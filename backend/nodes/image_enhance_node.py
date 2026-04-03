"""Image Enhance Node — upscale/enhance images via Leonardo API."""
import requests
import time
from .base import BaseNode

LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest"


class ImageEnhanceNode(BaseNode):
    NODE_TYPE = "image_enhance"
    CATEGORY = "image"
    DISPLAY_NAME = "Enhance Image"
    DESCRIPTION = "Upscale and enhance image quality"
    COLOR = "#06b6d4"

    INPUTS = [
        {"name": "image", "type": "file", "required": True, "label": "Image"},
    ]
    OUTPUTS = [
        {"name": "image", "type": "file", "label": "Enhanced Image"},
    ]
    PROPERTIES = [
        {
            "name": "upscale",
            "type": "select",
            "label": "Upscale Factor",
            "options": [
                {"value": "2x", "label": "2x"},
                {"value": "4x", "label": "4x"},
            ],
            "default": "2x",
        },
        {
            "name": "style",
            "type": "select",
            "label": "Enhancement Style",
            "options": [
                {"value": "general", "label": "General"},
                {"value": "cinematic", "label": "Cinematic"},
                {"value": "creative", "label": "Creative"},
            ],
            "default": "general",
        },
    ]

    def execute(self, inputs, properties, context):
        image_data = inputs.get("image", {})
        image_url = image_data.get("url", "") if isinstance(image_data, dict) else ""
        if not image_url:
            raise ValueError("Image is required for enhancement")

        api_key = context.get("leonardo_api_key")
        if not api_key:
            raise ValueError("No Leonardo API key available")

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        }

        # Upload image to Leonardo first
        init_resp = requests.post(
            f"{LEONARDO_BASE}/v1/init-image",
            json={"extension": "jpg"},
            headers=headers,
            timeout=30,
        )
        if init_resp.status_code != 200:
            raise ValueError("Failed to init upload")

        upload_data = init_resp.json().get("uploadInitImage", {})
        upload_url = upload_data.get("url")
        image_id = upload_data.get("id")
        fields_str = upload_data.get("fields")

        # Download and re-upload
        img_resp = requests.get(image_url, timeout=60)
        if img_resp.status_code != 200:
            raise ValueError("Failed to download source image")

        import json
        fields = json.loads(fields_str) if isinstance(fields_str, str) else fields_str
        requests.post(upload_url, data=fields,
                      files={"file": ("img.jpg", img_resp.content, "image/jpeg")},
                      timeout=60)

        # Create upscale variation
        upscale_type = "UPSCALE" if properties.get("upscale") == "2x" else "UPSCALE_4X"
        var_resp = requests.post(
            f"{LEONARDO_BASE}/v1/variations/upscale",
            json={"id": image_id, "upscaleType": upscale_type},
            headers=headers,
            timeout=60,
        )
        if var_resp.status_code != 200:
            raise ValueError(f"Upscale request failed: {var_resp.status_code}")

        var_id = var_resp.json().get("sdUpscaleJob", {}).get("id")
        if not var_id:
            raise ValueError("No upscale job ID returned")

        # Poll
        for _ in range(60):
            time.sleep(5)
            poll = requests.get(
                f"{LEONARDO_BASE}/v1/variations/{var_id}",
                headers=headers, timeout=30,
            )
            if poll.status_code == 200:
                var_data = poll.json().get("generated_image_variation_generic", [])
                if var_data and var_data[0].get("status") == "COMPLETE":
                    result_url = var_data[0].get("url", "")
                    if result_url:
                        return {"image": {"url": result_url, "type": "image"}}

        raise ValueError("Image enhancement timed out")

    def estimate_cost(self, properties):
        return 0.001
