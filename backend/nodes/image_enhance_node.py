"""Image Enhance Node — upscale/enhance images via Leonardo Universal Upscaler API."""
import requests
import time
import json
import base64 as b64mod
from .base import BaseNode

LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest"


class ImageEnhanceNode(BaseNode):
    NODE_TYPE = "image_enhance"
    CATEGORY = "image"
    DISPLAY_NAME = "Enhance Image"
    DESCRIPTION = "Upscale and enhance image quality using Universal Upscaler"
    COLOR = "#06b6d4"

    INPUTS = [
        {"name": "image", "type": "file", "required": True, "label": "Image"},
    ]
    OUTPUTS = [
        {"name": "image", "type": "file", "label": "Enhanced Image"},
    ]
    PROPERTIES = [
        {
            "name": "upscale_multiplier",
            "type": "select",
            "label": "Upscale Multiplier",
            "options": [
                {"value": "1.5", "label": "1.5x"},
                {"value": "2", "label": "2x"},
            ],
            "default": "1.5",
        },
        {
            "name": "style",
            "type": "select",
            "label": "Upscale Style",
            "options": [
                {"value": "ARTISTIC", "label": "Artistic"},
                {"value": "CINEMATIC", "label": "Cinematic"},
                {"value": "REALISTIC", "label": "Realistic"},
            ],
            "default": "ARTISTIC",
        },
        {
            "name": "creativity",
            "type": "select",
            "label": "Creativity Strength",
            "options": [
                {"value": "3", "label": "Low (3)"},
                {"value": "5", "label": "Medium (5)"},
                {"value": "8", "label": "High (8)"},
            ],
            "default": "5",
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

        # ── Step 1: Upload image to Leonardo ──
        init_resp = requests.post(
            f"{LEONARDO_BASE}/v1/init-image",
            json={"extension": "jpg"},
            headers=headers,
            timeout=30,
        )
        if init_resp.status_code != 200:
            raise ValueError(f"Failed to init upload: {init_resp.status_code}")

        upload_data = init_resp.json().get("uploadInitImage", {})
        upload_url = upload_data.get("url")
        image_id = upload_data.get("id")
        fields_str = upload_data.get("fields")

        if not upload_url or not image_id:
            raise ValueError("Missing upload URL or image ID from Leonardo")

        # Get image bytes (handle base64 data URLs)
        if image_url.startswith("data:"):
            header, b64data = image_url.split(",", 1)
            img_bytes = b64mod.b64decode(b64data)
        else:
            img_resp = requests.get(image_url, timeout=60)
            if img_resp.status_code != 200:
                raise ValueError("Failed to download source image")
            img_bytes = img_resp.content

        fields = json.loads(fields_str) if isinstance(fields_str, str) else fields_str
        requests.post(upload_url, data=fields,
                      files={"file": ("img.jpg", img_bytes, "image/jpeg")},
                      timeout=60)

        print(f"[Enhance] Uploaded image {image_id}, {len(img_bytes)} bytes")

        # ── Step 2: Universal Upscaler request ──
        upscale_style = properties.get("style", "ARTISTIC")
        creativity = int(properties.get("creativity", 5))
        multiplier = float(properties.get("upscale_multiplier", 1.5))

        payload = {
            "initImageId": image_id,
            "upscaleMultiplier": multiplier,
            "creativityStrength": creativity,
        }

        # Ultra mode: ARTISTIC / REALISTIC use ultraUpscaleStyle
        # Legacy mode: CINEMATIC uses upscalerStyle
        if upscale_style in ("ARTISTIC", "REALISTIC"):
            payload["ultraUpscaleStyle"] = upscale_style
            payload["similarity"] = 5
            payload["detailContrast"] = 5
        else:
            payload["upscalerStyle"] = upscale_style

        print(f"[Enhance] Universal Upscaler payload: {payload}")

        var_resp = requests.post(
            f"{LEONARDO_BASE}/v1/variations/universal-upscaler",
            json=payload,
            headers=headers,
            timeout=60,
        )
        if var_resp.status_code != 200:
            err_body = var_resp.text[:300]
            raise ValueError(f"Universal Upscaler failed ({var_resp.status_code}): {err_body}")

        resp_data = var_resp.json()
        var_id = resp_data.get("universalUpscaler", {}).get("id")
        if not var_id:
            raise ValueError(f"No upscaler job ID returned: {resp_data}")

        print(f"[Enhance] Universal Upscaler job: {var_id}")

        # ── Step 3: Poll for result ──
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
                        print(f"[Enhance] Done! Result: {result_url[:80]}...")
                        return {"image": {"url": result_url, "type": "image"}}

        raise ValueError("Image enhancement timed out")

    def estimate_cost(self, properties):
        return 0.002
