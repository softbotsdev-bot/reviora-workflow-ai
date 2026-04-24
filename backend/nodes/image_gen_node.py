"""Image Generate Node — generate images via Leonardo API."""
import requests
import time
from .base import BaseNode

LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest"

MODEL_CONFIG = {
    "img_nano_banana_2":   {"label": "Nano Banana 2", "model_param": "nano-banana-2"},
    "img_nano_banana_pro": {"label": "Nano Banana Pro", "model_param": "gemini-image-2"},
    "img_nano_banana":     {"label": "Nano Banana", "model_param": "gemini-2.5-flash-image"},
    "img_seedream_45":     {"label": "Seedream 4.5", "model_param": "seedream-4.5"},
    "img_seedream_4":      {"label": "Seedream 4.0", "model_param": "seedream-4.0"},
    "img_gpt_15":          {"label": "GPT Image-1.5", "model_param": "gpt-image-1.5"},
    "img_flux2_pro":       {"label": "FLUX.2 Pro", "model_param": "flux-pro-2.0"},
}


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
            "options": [{"value": k, "label": v["label"]} for k, v in MODEL_CONFIG.items()],
            "default": "img_nano_banana_2",
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
            ],
            "default": "2K",
        },
    ]

    # Dimension lookup table
    _DIMS = {
        "1:1":  {"1K": (1024, 1024), "2K": (2048, 2048)},
        "2:3":  {"1K": (848, 1264),  "2K": (1696, 2528)},
        "3:2":  {"1K": (1264, 848),  "2K": (2528, 1696)},
        "3:4":  {"1K": (896, 1200),  "2K": (1792, 2400)},
        "4:3":  {"1K": (1200, 896),  "2K": (2400, 1792)},
        "9:16": {"1K": (768, 1376),  "2K": (1536, 2752)},
        "16:9": {"1K": (1376, 768),  "2K": (2752, 1536)},
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

        model_key = properties.get("model", "img_nano_banana_2")
        model_config = MODEL_CONFIG.get(model_key)
        if not model_config:
            raise ValueError(f"Unknown model: {model_key}")
        model_id = model_config["model_param"]
        ratio = properties.get("aspect_ratio", "1:1")
        quality = properties.get("quality", "2K")

        dims = self._DIMS.get(ratio, {}).get(quality, (1024, 1024))
        width, height = dims

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        }

        # Handle reference image input
        ref_data = inputs.get("reference", {})
        ref_url = ref_data.get("url", "") if isinstance(ref_data, dict) else ""
        leo_ref_id = None

        if ref_url:
            leo_ref_id = self._upload_ref_to_leonardo(ref_url, headers)

        # V2 API format
        params = {
            "prompt": prompt_text + " Do not include any text, watermark, or logo in the image.",
            "width": width,
            "height": height,
            "quantity": 1,
            "prompt_enhance": "OFF",
        }

        # Add reference image guidance
        if leo_ref_id:
            params["guidances"] = {
                "image_reference": [
                    {"image": {"id": leo_ref_id, "type": "UPLOADED"}, "strength": "MID"}
                ]
            }

        payload = {
            "model": model_id,
            "public": False,
            "parameters": params,
        }

        # 1. Create generation (V2 endpoint)
        resp = requests.post(
            f"{LEONARDO_BASE}/v2/generations",
            json=payload,
            headers=headers,
            timeout=60,
        )

        if resp.status_code != 200:
            try:
                error_data = resp.json()
                err_msg = error_data.get("error", error_data.get("message", str(resp.status_code)))
            except Exception:
                err_msg = f"HTTP {resp.status_code}"
            raise ValueError(f"Leonardo API error: {err_msg}")

        gen_data = resp.json()
        if isinstance(gen_data, list):
            gen_data = gen_data[0] if gen_data else {}
        if not isinstance(gen_data, dict):
            gen_data = {}
            
        # V2 API returns {"generate": {"generationId": "..."}}, V1 returns {"sdGenerationJob": {"generationId": "..."}}
        gen_id = (
            gen_data.get("generate", {}).get("generationId") or
            gen_data.get("sdGenerationJob", {}).get("generationId") or
            gen_data.get("generationId")
        )
        if not gen_id:
            raise ValueError(f"No generation ID returned: {gen_data}")

        # 2. Poll for result (V1 polling endpoint)
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

    def _upload_ref_to_leonardo(self, image_url, headers):
        """Download image from URL (or decode base64 data URL) and upload to Leonardo.
        NOTE: Everything is in-memory — no temp files are written to disk."""
        import json as json_mod
        import base64

        try:
            # 1. Get image bytes — handle base64 data URLs or regular URLs
            if image_url.startswith("data:"):
                # Parse data URL: data:image/png;base64,XXXXX
                header, b64data = image_url.split(",", 1)
                image_bytes = base64.b64decode(b64data)
                # Extract extension from MIME
                mime_part = header.split(":")[1].split(";")[0]  # e.g. image/png
                ext_map = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
                ext = ext_map.get(mime_part, "jpg")
                print(f"[RefImage] Decoded base64 data URL, {len(image_bytes)} bytes, ext={ext}")
            else:
                # Download from regular URL
                dl_resp = requests.get(image_url, timeout=30)
                if dl_resp.status_code != 200:
                    print(f"[RefImage] Failed to download: {dl_resp.status_code}")
                    return None
                image_bytes = dl_resp.content
                content_type = dl_resp.headers.get("content-type", "image/jpeg")
                ext = "jpg"
                if "png" in content_type:
                    ext = "png"
                elif "webp" in content_type:
                    ext = "webp"

            # 2. Init upload on Leonardo
            init_resp = requests.post(
                f"{LEONARDO_BASE}/v1/init-image",
                json={"extension": ext},
                headers=headers,
                timeout=15,
            )
            if init_resp.status_code != 200:
                print(f"[RefImage] Init-image failed: {init_resp.status_code} - {init_resp.text}")
                return None

            init_data = init_resp.json().get("uploadInitImage", {})
            image_id = init_data.get("id")
            upload_url = init_data.get("url")
            fields = json_mod.loads(init_data.get("fields", "{}"))

            if not image_id or not upload_url:
                print("[RefImage] Missing id or upload_url from init-image")
                return None

            # 3. Upload to Leonardo's S3 storage
            mime = f"image/{ext}" if ext != "jpg" else "image/jpeg"
            files_payload = {"file": (f"ref.{ext}", image_bytes, mime)}
            upload_resp = requests.post(upload_url, data=fields, files=files_payload, timeout=30)
            if upload_resp.status_code not in [200, 204]:
                print(f"[RefImage] S3 upload failed: {upload_resp.status_code}")
                return None

            print(f"[RefImage] Uploaded successfully, ID: {image_id}")
            return image_id

        except Exception as e:
            print(f"[RefImage] Error: {str(e)}")
            return None

    def estimate_cost(self, properties):
        return 0.002
