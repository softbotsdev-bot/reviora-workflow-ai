"""Output Node — final output/preview/download node."""
from .base import BaseNode


class OutputNode(BaseNode):
    NODE_TYPE = "output"
    CATEGORY = "output"
    DISPLAY_NAME = "Output"
    DESCRIPTION = "Preview and download the final result"
    COLOR = "#10b981"

    INPUTS = [
        {"name": "file", "type": "file", "required": True, "label": "Result"},
    ]
    OUTPUTS = []
    PROPERTIES = [
        {
            "name": "label",
            "type": "text",
            "label": "Output Label",
            "default": "Result",
        },
    ]

    def execute(self, inputs, properties, context):
        file_data = inputs.get("file", {})
        if not file_data:
            raise ValueError("No input connected to output")
        # Output node just passes through with metadata
        return {
            "_output": {
                "label": properties.get("label", "Result"),
                "data": file_data,
            }
        }

    def estimate_cost(self, properties):
        return 0.0
