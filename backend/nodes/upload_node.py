"""Upload Node — accepts image or video file uploads."""
import os
import uuid
from .base import BaseNode


class UploadNode(BaseNode):
    NODE_TYPE = "upload"
    CATEGORY = "input"
    DISPLAY_NAME = "Upload"
    DESCRIPTION = "Upload an image or video file"
    COLOR = "#4a90d9"

    INPUTS = []
    OUTPUTS = [
        {"name": "file", "type": "file", "label": "File"},
    ]
    PROPERTIES = [
        {
            "name": "file_url",
            "type": "file_upload",
            "label": "File",
            "accept": "image/*,video/*",
            "default": "",
        },
        {
            "name": "file_type",
            "type": "select",
            "label": "Type",
            "options": [
                {"value": "image", "label": "Image"},
                {"value": "video", "label": "Video"},
            ],
            "default": "image",
        },
    ]

    def execute(self, inputs, properties, context):
        file_url = properties.get("file_url", "")
        if not file_url:
            raise ValueError("No file uploaded")
        return {
            "file": {
                "url": file_url,
                "type": properties.get("file_type", "image"),
            }
        }

    def estimate_cost(self, properties):
        return 0.0
