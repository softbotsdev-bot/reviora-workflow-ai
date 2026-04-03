"""Base node class for the workflow system."""
from abc import ABC, abstractmethod


class BaseNode(ABC):
    """Abstract base class for all workflow nodes."""

    NODE_TYPE = "base"
    CATEGORY = "misc"
    DISPLAY_NAME = "Base Node"
    DESCRIPTION = ""
    COLOR = "#666666"

    # Define input/output sockets
    INPUTS = []   # [{"name": "image", "type": "image", "required": True}]
    OUTPUTS = []  # [{"name": "image", "type": "image"}]

    # Define configurable properties
    PROPERTIES = []  # [{"name": "model", "type": "select", "options": [...], "default": "..."}]

    @abstractmethod
    def execute(self, inputs: dict, properties: dict, context: dict) -> dict:
        """Execute the node.

        Args:
            inputs: dict of input_name -> value (from connected nodes)
            properties: dict of property_name -> value (user configured)
            context: dict with user_id, api_keys, etc.

        Returns:
            dict of output_name -> value
        """
        pass

    def validate(self, inputs: dict, properties: dict) -> str | None:
        """Validate inputs before execution. Returns error message or None."""
        for inp in self.INPUTS:
            if inp.get("required", False) and inp["name"] not in inputs:
                return f"Input '{inp['name']}' is required"
        return None

    def estimate_cost(self, properties: dict) -> float:
        """Estimate credit cost for this node execution."""
        return 0.0

    def to_dict(self) -> dict:
        """Serialize node definition for frontend."""
        return {
            "type": self.NODE_TYPE,
            "category": self.CATEGORY,
            "displayName": self.DISPLAY_NAME,
            "description": self.DESCRIPTION,
            "color": self.COLOR,
            "inputs": self.INPUTS,
            "outputs": self.OUTPUTS,
            "properties": self.PROPERTIES,
        }
