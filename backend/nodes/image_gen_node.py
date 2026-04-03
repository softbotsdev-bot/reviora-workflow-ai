"""Image Generate Node — generate images via Leonardo API."""
import requests
import time
import os
from .base import BaseNode

LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest"


class ImageGenNode(BaseNode):
    NODE_TYPE = "image_gen"
    CATEGORY = "image"
    DISPLAY_NAME = "Generate Image"
    DESCRIPTION = "Generate images using AI models"
    COLOR = "#7c3aed"

    INPUTS = [
        {"name": "prompt", "type": "text", "required": True, "label": "Prompt"},
        {"name": "reference", "type": "file", "required": False, "label": "Reference Image"},
    ]
    OUTPUTS = [
        {"name": "image", "type": "file", "label": "Generated Image"},
    ]
    PROPERTIES = [
        {
            "name": "model",
            "type": "select",
            "label": "Model",
            "options": [
                {"value": "nano-banana-2", "label": "Nano Banana 2"},
                {"value": "gemini-image-2", "label": "Nano Banana Pro"},
                {"value": "gemini-2.5-flash-image", "label": "Nano Banana"},
                {"value": "seedream-4.5", "label": "Seedream 4.5"},
                {"value": "seedream-4.0", "label": "Seedream 4.0"},
                {"value": "gpt-image-1.5", "label": "GPT Image-1.5"},
                {"value": "flux-pro-2.0", "label": "FLUX.2 Pro"},
            ],
            "default": "nano-banana-2",
        },
        {
            "name": "aspect_ratio",
            "type": "select",
            "label": "Aspect Ratio",
            "options": [
                {"value": "1:1", "label": "1:1 Square"},
                {"value": "3:4", "label": "3:4 Portrait"},
                {"value": "4:3", "label": "4:3 Landscape"},
                {"value": "9:16", "label": "9:16 Vertical"},
                {"value": "16:9", "label": "16:9 Widescreen"},
                {"value": "2:3", "label": "2:3"},
                {"value": "3:2", "label": "3:2"},
            ],
            "default": "1:1",
        },
        {
            "name": "quality",
            "type": "select",
            "label": "Resolution",
            "options": [
                {"value": "1K", "label": "1K"},
                {"value": "2K", "label": "2K"},
                {"value": "4K", "label": "4K"},
            ],
            "default": "2K",
        },
        {
            "name": "num_images",
            "type": "number",
            "label": "Number of Images",
            "min": 1,
            "max": 4,
            "default": 1,
        },
    ]

    # Dimension lookup table
    _DIMS = {
        "1:1":  {"1K": (1024, 1024), "2K": (2048, 2048), "4K": (4096, 4096)},
        "2:3":  {"1K": (848, 1264),  "2K": (1696, 2528), "4K": (3392, 5056)},
        "3:2":  {"1K": (1264, 848),  "2K": (2528, 1696), "4K": (5056, 3392)},
        "3:4":  {"1K": (896, 1200),  "2K": (1792, 2400), "4K": (3584, 4800)},
        "4:3":  {"1K": (1200, 896),  "2K": (2400, 1792), "4K": (4800, 3584)},
        "9:16": {"1K": (768, 1376),  "2K": (1536, 2752), "4K": (3072, 5504)},
        "16:9": {"1K": (1376, 768),  "2K": (2752, 1536), "4K": (5504, 3072)},
    }

    def execute(self, inputs, properties, context):
        prompt_data = inputs.get("prompt", {})
        prompt_text = prompt_data.get("prompt", "") if isinstance(prompt_data, dict) else str(prompt_data)
        negative = prompt_data.get("negative_prompt", "") if isinstance(prompt_data, dict) else ""

        if not prompt_text:
            raise ValueError("Prompt is required for image generation")

        api_key = context.get("leonardo_api_key")
        if not api_key:
            raise ValueError("No Leonardo API key available")

        model_id = properties.get("model", "nano-banana-2")
        ratio = properties.get("aspect_ratio", "1:1")
        quality = properties.get("quality", "2K")
        num_images = int(properties.get("num_images", 1))

        dims = self._DIMS.get(ratio, {}).get(quality, (1024, 1024))
        width, height = dims

        # Build request
        payload = {
            "modelId": model_id,
            "prompt": prompt_text + " Do not include any text, watermark, or logo in the image.",
            "width": width,
            "height": height,
            "num_images": min(num_images, 4),
        }
        if negative:
            payload["negative_prompt"] = negative

        # Add reference image if connected
        ref = inputs.get("reference")
        if ref and isinstance(ref, dict) and ref.get("url"):
            payload["init_image_id"] = ref["url"]
            payload["init_strength"] = 0.3

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        }

        # 1. Create generation
        resp = requests.post(
            f"{LEONARDO_BASE}/v2/generations",
            json=payload,
            headers=headers,
            timeout=60,
        )

        if resp.status_code != 200:
            error_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            raise ValueError(f"Leonardo API error: {error_data.get('error', resp.status_code)}")

        gen_data = resp.json()
        gen_id = gen_data.get("sdGenerationJob", {}).get("generationId")
        if not gen_id:
            raise ValueError("No generation ID returned")

        # 2. Poll for result
        for _ in range(90):  # ~450s max
            time.sleep(5)
            poll_resp = requests.get(
                f"{LEONARDO_BASE}/v1/generations/{gen_id}",
                headers=headers,
                timeout=30,
            )
            if poll_resp.status_code != 200:
                continue

            poll_data = poll_resp.json()
            gen_info = poll_data.get("generations_by_pk", {})
            status = gen_info.get("status")

            if status == "COMPLETE":
                images = gen_info.get("generated_images", [])
                if images:
                    result_url = images[0].get("url", "")
                    return {
                        "image": {
                            "url": result_url,
                            "type": "image",
                            "all_urls": [img.get("url", "") for img in images],
                        }
                    }
                raise ValueError("Generation complete but no images returned")

            if status == "FAILED":
                raise ValueError("Image generation failed on server")

        raise ValueError("Image generation timed out")

    def estimate_cost(self, properties):
        return 0.002
