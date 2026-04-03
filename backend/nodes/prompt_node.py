"""Prompt Node — text input node for prompts."""
from .base import BaseNode


class PromptNode(BaseNode):
    NODE_TYPE = "prompt"
    CATEGORY = "input"
    DISPLAY_NAME = "Prompt"
    DESCRIPTION = "Text prompt for AI generation"
    COLOR = "#e8a838"

    INPUTS = []
    OUTPUTS = [
        {"name": "text", "type": "text", "label": "Text"},
    ]
    PROPERTIES = [
        {
            "name": "text",
            "type": "textarea",
            "label": "Prompt",
            "placeholder": "Enter your prompt here...",
            "default": "",
        },
        {
            "name": "negative_prompt",
            "type": "textarea",
            "label": "Negative Prompt",
            "placeholder": "What to avoid...",
            "default": "",
        },
    ]

    def execute(self, inputs, properties, context):
        text = properties.get("text", "").strip()
        if not text:
            raise ValueError("Prompt text is required")
        return {
            "text": {
                "prompt": text,
                "negative_prompt": properties.get("negative_prompt", "").strip(),
            }
        }

    def estimate_cost(self, properties):
        return 0.0
