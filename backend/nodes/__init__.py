"""Node implementations for the workflow system."""
from .base import BaseNode
from .upload_node import UploadNode
from .prompt_node import PromptNode
from .image_gen_node import ImageGenNode
from .image_edit_node import ImageEditNode
from .image_enhance_node import ImageEnhanceNode
from .video_gen_node import VideoGenNode
from .video_motion_node import VideoMotionNode
from .output_node import OutputNode

# Registry of all available node types
NODE_REGISTRY = {}

def _register(cls):
    NODE_REGISTRY[cls.NODE_TYPE] = cls

_register(UploadNode)
_register(PromptNode)
_register(ImageGenNode)
_register(ImageEditNode)
_register(ImageEnhanceNode)
_register(VideoGenNode)
_register(VideoMotionNode)
_register(OutputNode)


def get_node(node_type: str) -> BaseNode:
    """Get a node instance by type."""
    cls = NODE_REGISTRY.get(node_type)
    if not cls:
        raise ValueError(f"Unknown node type: {node_type}")
    return cls()


def get_all_node_definitions() -> list:
    """Get serialized definitions of all node types for the frontend."""
    defs = []
    for cls in NODE_REGISTRY.values():
        node = cls()
        defs.append(node.to_dict())
    return defs
