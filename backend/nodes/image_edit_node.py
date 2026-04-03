"""Image Edit Node — img2img transformations via Leonardo API."""
import requests
import time
from .base import BaseNode

LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest"


class ImageEditNode(BaseNode):
    NODE_TYPE = "image_edit"
    CATEGORY = "image"
    DISPLAY_NAME = "Edit Image"
    DESCRIPTION = "Transform an image using AI with a prompt"
    COLOR = "#8b5cf6"

    INPUTS = [
        {"name": "image", "type": "file", "required": True, "label": "Source Image"},
        {"name": "prompt", "type": "text", "required": True, "label": "Edit Prompt"},
    ]
    OUTPUTS = [
        {"name": "image", "type": "file", "label": "Edited Image"},
    ]
    PROPERTIES = [
        {
            "name": "model",
            "type": "select",
            "label": "Model",
            "options": [
                {"value": "nano-banana-2", "label": "Nano Banana 2"},
                {"value": "gemini-image-2", "label": "Nano Banana Pro"},
            ],
            "default": "nano-banana-2",
        },
        {
            "name": "strength",
            "type": "slider",
            "label": "Edit Strength",
            "min": 0.1,
            "max": 0.9,
            "step": 0.1,
            "default": 0.5,
        },
    ]

    def _upload_to_leonardo(self, image_url, api_key):
        """Download image and upload to Leonardo, return init_image_id."""
        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        }

        # Init upload
        resp = requests.post(
            f"{LEONARDO_BASE}/v1/init-image",
            json={"extension": "jpg"},
            headers=headers,
            timeout=30,
        )
        if resp.status_code != 200:
            return None
        upload_data = resp.json().get("uploadInitImage", {})
        upload_url = upload_data.get("url")
        image_id = upload_data.get("id")
        fields_str = upload_data.get("fields")
        if not upload_url or not image_id:
            return None

        # Download source image
        img_resp = requests.get(image_url, timeout=60)
        if img_resp.status_code != 200:
            return None

        # Upload to presigned URL
        import json
        fields = json.loads(fields_str) if isinstance(fields_str, str) else fields_str
        files = {"file": ("image.jpg", img_resp.content, "image/jpeg")}
        requests.post(upload_url, data=fields, files=files, timeout=60)

        return image_id

    def execute(self, inputs, properties, context):
        image_data = inputs.get("image", {})
        prompt_data = inputs.get("prompt", {})
        image_url = image_data.get("url", "") if isinstance(image_data, dict) else ""
        prompt_text = prompt_data.get("prompt", "") if isinstance(prompt_data, dict) else str(prompt_data)

        if not image_url:
            raise ValueError("Source image is required")
        if not prompt_text:
            raise ValueError("Edit prompt is required")

        api_key = context.get("leonardo_api_key")
        if not api_key:
            raise ValueError("No Leonardo API key available")

        model_id = properties.get("model", "nano-banana-2")
        strength = float(properties.get("strength", 0.5))

        # Upload reference image
        init_image_id = self._upload_to_leonardo(image_url, api_key)
        if not init_image_id:
            raise ValueError("Failed to upload reference image")

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        }

        payload = {
            "modelId": model_id,
            "prompt": prompt_text + " Do not include any text, watermark, or logo.",
            "width": 1024,
            "height": 1024,
            "num_images": 1,
            "init_image_id": init_image_id,
            "init_strength": strength,
        }

        resp = requests.post(
            f"{LEONARDO_BASE}/v2/generations",
            json=payload,
            headers=headers,
            timeout=60,
        )
        if resp.status_code != 200:
            raise ValueError(f"Leonardo API error: {resp.status_code}")

        gen_id = resp.json().get("sdGenerationJob", {}).get("generationId")
        if not gen_id:
            raise ValueError("No generation ID returned")

        # Poll
        for _ in range(90):
            time.sleep(5)
            poll = requests.get(
                f"{LEONARDO_BASE}/v1/generations/{gen_id}",
                headers=headers, timeout=30,
            )
            if poll.status_code != 200:
                continue
            gen_info = poll.json().get("generations_by_pk", {})
            if gen_info.get("status") == "COMPLETE":
                images = gen_info.get("generated_images", [])
                if images:
                    return {"image": {"url": images[0]["url"], "type": "image"}}
                raise ValueError("No images in result")
            if gen_info.get("status") == "FAILED":
                raise ValueError("Image editing failed")

        raise ValueError("Image editing timed out")

    def estimate_cost(self, properties):
        return 0.002
