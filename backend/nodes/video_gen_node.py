"""Video Generate Node — generate videos via Leonardo AI API.

Based on Leonardo AI docs — two API versions supported:
  - v1: /generations-image-to-video  (Veo 3.0, Veo 3.1, Kling 2.1 Pro, Kling 2.5 Turbo)
  - v2: /generations                 (Kling 2.6, Kling 3.0, Kling O1, Kling O3, Seedance)
"""
import requests
import time
import json
import base64 as b64mod
from .base import BaseNode

LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest"

# ── Model config table ──
# api: "v1" or "v2"
# model_param: value for the "model" field
# durations: list of allowed durations
# start_frame: True if start frame (imageId) is supported
# end_frame: True if endFrameImage / end_frame is supported
# has_audio: True if motion_has_audio is supported
MODEL_CONFIG = {
    "VEO3_1": {
        "label": "Veo 3.1", "api": "v1", "model_param": "VEO3_1",
        "durations": [4, 6, 8], "start_frame": True, "end_frame": True,
    },
    "VEO3_1FAST": {
        "label": "Veo 3.1 Fast", "api": "v1", "model_param": "VEO3_1FAST",
        "durations": [4, 6, 8], "start_frame": True, "end_frame": True,
    },
    "VEO3_0": {
        "label": "Veo 3.0", "api": "v1", "model_param": "VEO3_0",
        "durations": [4, 6, 8], "start_frame": True, "end_frame": False,
    },
    "VEO3FAST": {
        "label": "Veo 3.0 Fast", "api": "v1", "model_param": "VEO3FAST",
        "durations": [4, 6, 8], "start_frame": True, "end_frame": False,
    },
    "KLING2_1": {
        "label": "Kling 2.1 Pro", "api": "v1", "model_param": "KLING2_1",
        "durations": [5, 10], "start_frame": True, "end_frame": True,
    },
    "Kling2_5": {
        "label": "Kling 2.5 Turbo", "api": "v1", "model_param": "Kling2_5",
        "durations": [5, 10], "start_frame": True, "end_frame": True,
    },
    "kling-2.6": {
        "label": "Kling 2.6", "api": "v2", "model_param": "kling-2.6",
        "durations": [5, 10], "start_frame": True, "end_frame": False,
    },
    "kling-3.0": {
        "label": "Kling 3.0", "api": "v2", "model_param": "kling-3.0",
        "durations": [3, 5, 8, 10, 15], "start_frame": True, "end_frame": True,
        "has_audio": True,
    },
    "kling-video-o-1": {
        "label": "Kling O1", "api": "v2", "model_param": "kling-video-o-1",
        "durations": [5, 10], "start_frame": True, "end_frame": True,
    },
    "kling-video-o-3": {
        "label": "Kling O3", "api": "v2", "model_param": "kling-video-o-3",
        "durations": [3, 5, 8, 10, 12], "start_frame": True, "end_frame": True,
        "has_audio": True,
    },
    "seedance-1.0-pro": {
        "label": "Seedance 1.0 Pro", "api": "v2", "model_param": "seedance-1.0-pro",
        "durations": [4, 6, 8, 10], "start_frame": True, "end_frame": True,
    },
    "seedance-1.0-lite": {
        "label": "Seedance 1.0 Lite", "api": "v2", "model_param": "seedance-1.0-lite",
        "durations": [4, 6, 8, 10], "start_frame": True, "end_frame": True,
    },
}

RATIO_DIMS = {
    "16:9": {"w": 1920, "h": 1080},
    "9:16": {"w": 1080, "h": 1920},
    "1:1":  {"w": 1440, "h": 1440},
}


class VideoGenNode(BaseNode):
    NODE_TYPE = "video_gen"
    CATEGORY = "video"
    DISPLAY_NAME = "Generate Video"
    DESCRIPTION = "Generate video from text + optional start frame image"
    COLOR = "#ec4899"

    INPUTS = [
        {"name": "prompt", "type": "text", "required": True, "label": "Prompt"},
        {"name": "start_frame", "type": "file", "required": False, "label": "Start Frame"},
    ]
    OUTPUTS = [
        {"name": "video", "type": "file", "label": "Generated Video"},
    ]
    PROPERTIES = [
        {
            "name": "model",
            "type": "select",
            "label": "Model",
            "options": [{"value": k, "label": v["label"]} for k, v in MODEL_CONFIG.items()],
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
            "type": "dynamic_select",
            "label": "Duration (seconds)",
            "depends_on": "model",
            "default": "5",
        },
    ]

    # Exposed to frontend via /api/nodes — model capabilities
    MODEL_META = {
        k: {
            "label": v["label"],
            "durations": v["durations"],
            "start_frame": v.get("start_frame", False),
            "end_frame": v.get("end_frame", False),
            "has_audio": v.get("has_audio", False),
        }
        for k, v in MODEL_CONFIG.items()
    }

    def _upload_image_to_leonardo(self, image_url, headers):
        """Upload image (URL or base64) to Leonardo, return init_image_id."""
        try:
            # Get image bytes
            if image_url.startswith("data:"):
                header, b64data = image_url.split(",", 1)
                img_bytes = b64mod.b64decode(b64data)
            else:
                dl = requests.get(image_url, timeout=30)
                if dl.status_code != 200:
                    return None
                img_bytes = dl.content

            # Init upload
            resp = requests.post(
                f"{LEONARDO_BASE}/v1/init-image",
                json={"extension": "jpg"},
                headers=headers,
                timeout=15,
            )
            if resp.status_code != 200:
                return None

            upload_data = resp.json().get("uploadInitImage", {})
            upload_url = upload_data.get("url")
            image_id = upload_data.get("id")
            fields_str = upload_data.get("fields")
            if not upload_url or not image_id:
                return None

            fields = json.loads(fields_str) if isinstance(fields_str, str) else fields_str
            requests.post(upload_url, data=fields,
                          files={"file": ("frame.jpg", img_bytes, "image/jpeg")},
                          timeout=60)

            print(f"[VideoGen] Uploaded start frame: {image_id}")
            return image_id
        except Exception as e:
            print(f"[VideoGen] Upload error: {e}")
            return None

    def execute(self, inputs, properties, context):
        prompt_data = inputs.get("prompt", {})
        prompt_text = prompt_data.get("prompt", "") if isinstance(prompt_data, dict) else str(prompt_data)
        if not prompt_text:
            raise ValueError("Prompt is required for video generation")

        api_key = context.get("leonardo_api_key")
        if not api_key:
            raise ValueError("No Leonardo API key available")

        model_key = properties.get("model", "kling-2.6")
        config = MODEL_CONFIG.get(model_key)
        if not config:
            raise ValueError(f"Unknown model: {model_key}")

        ratio = properties.get("aspect_ratio", "16:9")
        duration = int(properties.get("duration", 5))
        dims = RATIO_DIMS.get(ratio, {"w": 1920, "h": 1080})

        # Validate duration against model's supported values
        valid_durations = config.get("durations", [5])
        if duration not in valid_durations:
            # Pick nearest valid duration
            duration = min(valid_durations, key=lambda d: abs(d - duration))
            print(f"[VideoGen] Duration adjusted to {duration}s for model {model_key}")

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        }

        # ── Get start frame image if connected ──
        start_frame_data = inputs.get("start_frame")
        start_frame_url = None
        if start_frame_data and isinstance(start_frame_data, dict):
            start_frame_url = start_frame_data.get("url", "")

        start_frame_id = None
        if start_frame_url and config.get("start_frame"):
            start_frame_id = self._upload_image_to_leonardo(start_frame_url, headers)

        # ── Build payload based on API version ──
        api_version = config["api"]

        if api_version == "v1":
            # v1 endpoint: /generations-image-to-video
            payload = {
                "model": config["model_param"],
                "prompt": prompt_text,
                "width": dims["w"],
                "height": dims["h"],
                "duration": duration,
                "resolution": "RESOLUTION_1080",
                "isPublic": False,
            }
            if start_frame_id:
                payload["imageId"] = start_frame_id
                payload["imageType"] = "UPLOADED"

            endpoint = f"{LEONARDO_BASE}/v1/generations-image-to-video"
            print(f"[VideoGen] v1 payload: {payload}")

        else:
            # v2 endpoint: /generations
            params = {
                "prompt": prompt_text,
                "duration": duration,
                "width": dims["w"],
                "height": dims["h"],
            }

            # Add start_frame guidance if available
            if start_frame_id:
                params["guidances"] = {
                    "start_frame": [{
                        "image": {"id": start_frame_id, "type": "UPLOADED"}
                    }]
                }

            # Audio support for Kling 3.0 / O3
            if config.get("has_audio"):
                params["motion_has_audio"] = True

            payload = {
                "model": config["model_param"],
                "public": False,
                "parameters": params,
            }
            endpoint = f"{LEONARDO_BASE}/v2/generations"
            print(f"[VideoGen] v2 payload: {json.dumps(payload, indent=2)}")

        # ── Send request ──
        resp = requests.post(endpoint, json=payload, headers=headers, timeout=60)
        if resp.status_code != 200:
            err_body = resp.text[:500]
            raise ValueError(f"Video API error ({resp.status_code}): {err_body}")

        resp_data = resp.json()

        # Extract generation ID — different response formats per API version
        gen_id = None
        if api_version == "v1":
            # v1 returns: {"motionVideoGenerationJob": {"generationId": "..."}}
            gen_id = resp_data.get("motionVideoGenerationJob", {}).get("generationId")
            if not gen_id:
                gen_id = resp_data.get("sdGenerationJob", {}).get("generationId")
        else:
            # v2 returns: {"sdGenerationJob": {"generationId": "..."}}
            gen_id = resp_data.get("sdGenerationJob", {}).get("generationId")
            if not gen_id:
                gen_id = resp_data.get("generationId")

        if not gen_id:
            raise ValueError(f"No generation ID returned: {resp_data}")

        print(f"[VideoGen] Generation started: {gen_id}")

        # ── Poll for result ──
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
                    # Video URL can be in motionMP4URL or url
                    video_url = videos[0].get("motionMP4URL") or videos[0].get("url", "")
                    if video_url:
                        print(f"[VideoGen] Done! {video_url[:80]}...")
                        return {"video": {"url": video_url, "type": "video"}}
                raise ValueError("Video generation complete but no video returned")

            if status == "FAILED":
                raise ValueError("Video generation failed on server")

        raise ValueError("Video generation timed out (15 min)")

    def estimate_cost(self, properties):
        costs = {
            "VEO3_1": 3.90, "VEO3_1FAST": 1.39, "VEO3_0": 3.90, "VEO3FAST": 1.39,
            "KLING2_1": 2.50, "Kling2_5": 1.85,
            "kling-2.6": 1.85, "kling-3.0": 3.78,
            "kling-video-o-1": 3.50, "kling-video-o-3": 4.20,
            "seedance-1.0-pro": 2.80, "seedance-1.0-lite": 1.50,
        }
        return costs.get(properties.get("model", ""), 2.0)
