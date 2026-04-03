"""Video Motion Node — Freepik Kling 2.6 motion control."""
import requests
import time
from .base import BaseNode

FREEPIK_BASE = "https://api.freepik.com"

MOTION_ENDPOINTS = {
    "std": "/v1/ai/video/kling-v2-6-motion-control-std",
    "pro": "/v1/ai/video/kling-v2-6-motion-control-pro",
}


class VideoMotionNode(BaseNode):
    NODE_TYPE = "video_motion"
    CATEGORY = "video"
    DISPLAY_NAME = "Video Motion"
    DESCRIPTION = "Generate motion video from image + reference video (Kling 2.6)"
    COLOR = "#f59e0b"

    INPUTS = [
        {"name": "image", "type": "file", "required": True, "label": "Character Image"},
        {"name": "video", "type": "file", "required": True, "label": "Reference Video"},
        {"name": "prompt", "type": "text", "required": False, "label": "Prompt (optional)"},
    ]
    OUTPUTS = [
        {"name": "video", "type": "file", "label": "Motion Video"},
    ]
    PROPERTIES = [
        {
            "name": "quality",
            "type": "select",
            "label": "Quality",
            "options": [
                {"value": "std", "label": "⚡ Standard"},
                {"value": "pro", "label": "✨ Pro"},
            ],
            "default": "std",
        },
        {
            "name": "orientation",
            "type": "select",
            "label": "Orientation",
            "options": [
                {"value": "video", "label": "🎬 Video (max 30s)"},
                {"value": "image", "label": "🖼️ Image"},
            ],
            "default": "video",
        },
        {
            "name": "cfg_scale",
            "type": "slider",
            "label": "CFG Scale",
            "min": 0.0,
            "max": 1.0,
            "step": 0.1,
            "default": 0.5,
        },
    ]

    def execute(self, inputs, properties, context):
        image_data = inputs.get("image", {})
        video_data = inputs.get("video", {})
        prompt_data = inputs.get("prompt", {})

        image_url = image_data.get("url", "") if isinstance(image_data, dict) else ""
        video_url = video_data.get("url", "") if isinstance(video_data, dict) else ""
        prompt_text = ""
        if prompt_data:
            prompt_text = prompt_data.get("prompt", "") if isinstance(prompt_data, dict) else str(prompt_data)

        if not image_url:
            raise ValueError("Character image is required")
        if not video_url:
            raise ValueError("Reference video is required")

        freepik_key = context.get("freepik_api_key")
        if not freepik_key:
            raise ValueError("No Freepik API key available")

        quality = properties.get("quality", "std")
        orientation = properties.get("orientation", "video")
        cfg_scale = float(properties.get("cfg_scale", 0.5))

        endpoint = MOTION_ENDPOINTS.get(quality, MOTION_ENDPOINTS["std"])

        # 1. Create motion task
        payload = {
            "image_url": image_url,
            "video_url": video_url,
            "character_orientation": orientation,
            "cfg_scale": cfg_scale,
            "prompt": prompt_text,
        }
        headers = {
            "x-freepik-api-key": freepik_key,
            "Content-Type": "application/json",
        }

        resp = requests.post(
            f"{FREEPIK_BASE}{endpoint}",
            json=payload, headers=headers, timeout=60,
        )
        if resp.status_code != 200:
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            msg = data.get("message", f"HTTP {resp.status_code}")
            raise ValueError(f"Freepik error: {msg}")

        task_data = resp.json().get("data", {})
        task_id = task_data.get("task_id")
        if not task_id:
            raise ValueError("No task_id returned from Freepik")

        # 2. Poll for completion
        poll_headers = {"x-freepik-api-key": freepik_key}
        for _ in range(120):  # ~10 min
            time.sleep(5)
            poll = requests.get(
                f"{FREEPIK_BASE}/v1/ai/image-to-video/kling-v2-6/{task_id}",
                headers=poll_headers, timeout=30,
            )
            if poll.status_code != 200:
                continue

            poll_data = poll.json().get("data", {})
            status = poll_data.get("status", "")

            if status == "COMPLETED":
                generated = poll_data.get("generated", [])
                if generated:
                    return {"video": {"url": generated[0], "type": "video"}}
                raise ValueError("Motion complete but no video URL")

            if status == "FAILED":
                raise ValueError("Video motion generation failed")

        raise ValueError("Video motion generation timed out")

    def estimate_cost(self, properties):
        return 0.5 if properties.get("quality") == "std" else 1.0
