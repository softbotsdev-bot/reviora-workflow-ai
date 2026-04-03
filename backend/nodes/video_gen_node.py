"""Video Generate Node — generate videos via Leonardo API."""
import requests
import time
from .base import BaseNode

LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest"


class VideoGenNode(BaseNode):
    NODE_TYPE = "video_gen"
    CATEGORY = "video"
    DISPLAY_NAME = "Generate Video"
    DESCRIPTION = "Generate video from text or image"
    COLOR = "#ec4899"

    INPUTS = [
        {"name": "prompt", "type": "text", "required": True, "label": "Prompt"},
        {"name": "image", "type": "file", "required": False, "label": "Reference Image"},
    ]
    OUTPUTS = [
        {"name": "video", "type": "file", "label": "Generated Video"},
    ]
    PROPERTIES = [
        {
            "name": "model",
            "type": "select",
            "label": "Model",
            "options": [
                {"value": "kling-3.0", "label": "Kling 3.0"},
                {"value": "kling-2.6", "label": "Kling 2.6"},
                {"value": "kling-video-o-3", "label": "Kling O3"},
                {"value": "veo-3.1-fast-generate-preview", "label": "Veo 3.1 Fast"},
                {"value": "veo-3.1-generate-preview", "label": "Veo 3.1"},
                {"value": "sora-2", "label": "Sora 2"},
                {"value": "sora-2-pro", "label": "Sora 2 Pro"},
            ],
            "default": "kling-2.6",
        },
        {
            "name": "aspect_ratio",
            "type": "select",
            "label": "Aspect Ratio",
            "options": [
                {"value": "16:9", "label": "16:9 Landscape"},
                {"value": "9:16", "label": "9:16 Portrait"},
                {"value": "1:1", "label": "1:1 Square"},
            ],
            "default": "16:9",
        },
        {
            "name": "duration",
            "type": "select",
            "label": "Duration (seconds)",
            "options": [
                {"value": "5", "label": "5s"},
                {"value": "8", "label": "8s"},
                {"value": "10", "label": "10s"},
            ],
            "default": "5",
        },
    ]

    _RATIO_DIMS = {
        "16:9": {"w": 1920, "h": 1080},
        "9:16": {"w": 1080, "h": 1920},
        "1:1":  {"w": 1440, "h": 1440},
    }

    def execute(self, inputs, properties, context):
        prompt_data = inputs.get("prompt", {})
        prompt_text = prompt_data.get("prompt", "") if isinstance(prompt_data, dict) else str(prompt_data)
        if not prompt_text:
            raise ValueError("Prompt is required for video generation")

        api_key = context.get("leonardo_api_key")
        if not api_key:
            raise ValueError("No Leonardo API key available")

        model_id = properties.get("model", "kling-2.6")
        ratio = properties.get("aspect_ratio", "16:9")
        duration = int(properties.get("duration", 5))
        dims = self._RATIO_DIMS.get(ratio, {"w": 1920, "h": 1080})

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        }

        payload = {
            "modelId": model_id,
            "prompt": prompt_text + " Do not include any text, watermark, or logo.",
            "width": dims["w"],
            "height": dims["h"],
            "num_images": 1,
            "isVariation": False,
        }

        # Add image reference if connected
        ref_image = inputs.get("image")
        if ref_image and isinstance(ref_image, dict) and ref_image.get("url"):
            payload["imageId"] = ref_image["url"]

        # Set duration if model supports it
        if duration:
            payload["duration"] = duration

        resp = requests.post(
            f"{LEONARDO_BASE}/v2/generations",
            json=payload,
            headers=headers,
            timeout=60,
        )
        if resp.status_code != 200:
            err = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            raise ValueError(f"Leonardo API error: {err.get('error', resp.status_code)}")

        gen_id = resp.json().get("sdGenerationJob", {}).get("generationId")
        if not gen_id:
            raise ValueError("No generation ID returned")

        # Poll for video — videos take longer
        for _ in range(180):  # ~15 min max
            time.sleep(5)
            poll = requests.get(
                f"{LEONARDO_BASE}/v1/generations/{gen_id}",
                headers=headers, timeout=30,
            )
            if poll.status_code != 200:
                continue

            gen_info = poll.json().get("generations_by_pk", {})
            status = gen_info.get("status")

            if status == "COMPLETE":
                videos = gen_info.get("generated_images", [])
                if videos:
                    video_url = videos[0].get("url", "") or videos[0].get("motionMP4URL", "")
                    if video_url:
                        return {"video": {"url": video_url, "type": "video"}}
                raise ValueError("Video generation complete but no video returned")

            if status == "FAILED":
                raise ValueError("Video generation failed on server")

        raise ValueError("Video generation timed out (15 min)")

    def estimate_cost(self, properties):
        costs = {
            "kling-3.0": 3.78, "kling-2.6": 1.85, "kling-video-o-3": 4.20,
            "veo-3.1-fast-generate-preview": 1.39, "veo-3.1-generate-preview": 3.90,
            "sora-2": 1.70, "sora-2-pro": 4.95,
        }
        return costs.get(properties.get("model", ""), 2.0)
