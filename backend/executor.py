"""
Workflow Executor — runs a workflow graph in topological order.
Supports real-time progress reporting via callbacks.
"""
import time
import traceback
from collections import defaultdict
from nodes import get_node
import db_client as db


class ExecutionError(Exception):
    """Raised when a node execution fails."""
    def __init__(self, node_id, node_type, message):
        self.node_id = node_id
        self.node_type = node_type
        super().__init__(message)


def _topological_sort(nodes: list, edges: list) -> list:
    """
    Sort nodes in execution order based on edges.
    nodes: [{"id": "node_1", "type": "prompt", ...}, ...]
    edges: [{"source": "node_1", "sourceHandle": "text",
             "target": "node_2", "targetHandle": "prompt"}, ...]
    Returns list of node IDs in execution order.
    """
    node_ids = {n["id"] for n in nodes}
    in_degree = defaultdict(int)
    adjacency = defaultdict(list)

    for edge in edges:
        src, tgt = edge["source"], edge["target"]
        if src in node_ids and tgt in node_ids:
            adjacency[src].append(tgt)
            in_degree[tgt] += 1

    # Initialize nodes with no incoming edges
    queue = [nid for nid in node_ids if in_degree[nid] == 0]
    result = []

    while queue:
        # Sort for deterministic order
        queue.sort()
        current = queue.pop(0)
        result.append(current)
        for neighbor in adjacency[current]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(node_ids):
        raise ValueError("Workflow contains a cycle — cannot execute")

    return result


def _get_upstream_nodes(target_id: str, edges: list, node_lookup: dict) -> set:
    """Recursively collect all upstream node IDs that feed into target_id."""
    upstream = set()
    stack = [target_id]
    while stack:
        current = stack.pop()
        for edge in edges:
            if edge["target"] == current:
                src = edge["source"]
                if src not in upstream and src in node_lookup:
                    upstream.add(src)
                    stack.append(src)
    return upstream


def _build_input_map(node_id: str, edges: list, outputs: dict) -> dict:
    """
    Build the input dict for a node by looking at incoming edges
    and mapping outputs from source nodes.
    """
    inputs = {}
    for edge in edges:
        if edge["target"] == node_id:
            src_id = edge["source"]
            src_handle = edge.get("sourceHandle", "")
            tgt_handle = edge.get("targetHandle", "")
            if src_id in outputs and src_handle in outputs[src_id]:
                inputs[tgt_handle] = outputs[src_id][src_handle]
    return inputs


def estimate_workflow_cost(nodes: list) -> float:
    """Estimate total credit cost for a workflow before execution."""
    total = 0.0
    for node_data in nodes:
        try:
            node = get_node(node_data["type"])
            props = node_data.get("data", {}).get("properties", {})
            total += node.estimate_cost(props)
        except Exception:
            pass
    return total


def execute_workflow(
    workflow_graph: dict,
    context: dict,
    on_node_start=None,
    on_node_complete=None,
    on_node_error=None,
    target_node_id=None,
    existing_outputs=None,
) -> dict:
    """
    Execute a complete workflow graph.

    Args:
        workflow_graph: {"nodes": [...], "edges": [...]}
        context: {"user_id": ..., "leonardo_api_key": ..., "freepik_api_key": ...}
        on_node_start: callback(node_id, node_type, index, total)
        on_node_complete: callback(node_id, node_type, outputs, index, total)
        on_node_error: callback(node_id, node_type, error, index, total)

    Returns:
        {
            "status": "completed" | "partial" | "failed",
            "outputs": {node_id: {handle: value}},
            "errors": {node_id: error_msg},
            "results": [{"node_id": ..., "label": ..., "data": ...}],
            "elapsed": seconds,
        }
    """
    nodes = workflow_graph.get("nodes", [])
    edges = workflow_graph.get("edges", [])

    if not nodes:
        return {"status": "failed", "errors": {"_": "No nodes in workflow"}, "outputs": {}, "results": [], "elapsed": 0}

    # Build node lookup
    node_lookup = {n["id"]: n for n in nodes}

    # Topological sort
    try:
        exec_order = _topological_sort(nodes, edges)
    except ValueError as e:
        return {"status": "failed", "errors": {"_": str(e)}, "outputs": {}, "results": [], "elapsed": 0}

    total = len(exec_order)
    outputs = {}  # node_id -> {handle: value}
    errors = {}
    results = []  # Final output nodes' results
    start_time = time.time()

    # Seed with existing outputs from previously completed nodes
    if existing_outputs:
        for nid, out in existing_outputs.items():
            if nid in node_lookup:
                outputs[nid] = out
                print(f"[Executor] Pre-loaded outputs for {nid}")

    # If target_node_id specified, only execute nodes needed for that target
    if target_node_id and target_node_id in node_lookup:
        needed = _get_upstream_nodes(target_node_id, edges, node_lookup)
        needed.add(target_node_id)
        exec_order = [nid for nid in exec_order if nid in needed]
        total = len(exec_order)

    for idx, node_id in enumerate(exec_order):
        node_data = node_lookup.get(node_id)
        if not node_data:
            continue

        node_type = node_data.get("type", "unknown")
        properties = node_data.get("data", {}).get("properties", {})

        # Skip nodes that already have outputs (from previous runs)
        if node_id in outputs and node_id != target_node_id:
            print(f"[Executor] Skipping {node_id} ({node_type}) — using cached outputs")
            continue

        # Notify start
        if on_node_start:
            on_node_start(node_id, node_type, idx, total)

        try:
            # Get node executor
            node = get_node(node_type)

            # Build inputs from connected edges
            node_inputs = _build_input_map(node_id, edges, outputs)

            # Validate
            validation_err = node.validate(node_inputs, properties)
            if validation_err:
                raise ValueError(validation_err)

            # ── Credit check for billable nodes ──
            billable_types = {"image_gen", "image_edit", "image_enhance", "video_gen", "video_motion"}
            tg_user_id = context.get("telegram_user_id")
            is_billable = node_type in billable_types

            if is_billable and tg_user_id:
                content_type = "video" if node_type in ("video_gen", "video_motion") else "image"
                
                # Backwards compatibility for old saved workflows
                old_model_keys = {
                    "nano-banana-2": "img_nano_banana_2",
                    "gemini-image-2": "img_nano_banana_pro",
                    "gemini-2.5-flash-image": "img_nano_banana",
                    "seedream-4.5": "img_seedream_45",
                    "seedream-4.0": "img_seedream_4",
                    "gpt-image-1.5": "img_gpt_15",
                    "flux-pro-2.0": "img_flux2_pro",
                }
                if properties.get("model") in old_model_keys:
                    properties["model"] = old_model_keys[properties["model"]]

                model_key = properties.get("model", "")
                try:
                    can_result = db.check_user_can_generate(tg_user_id, model_key, content_type)
                    # Result can be (bool, str) tuple or list
                    if isinstance(can_result, (list, tuple)):
                        allowed, msg = can_result[0], can_result[1] if len(can_result) > 1 else ""
                    else:
                        allowed, msg = bool(can_result), ""
                    if not allowed:
                        raise ValueError(f"Kuota habis: {msg}")
                except (RuntimeError, ConnectionError) as e:
                    print(f"[Executor] Credit check failed (non-blocking): {e}")
                    # Non-blocking: if DB is unreachable, proceed anyway

            # Execute
            node_outputs = node.execute(node_inputs, properties, context)
            outputs[node_id] = node_outputs

            # ── Increment usage after success ──
            if is_billable and tg_user_id:
                content_type = "video" if node_type in ("video_gen", "video_motion") else "image"
                try:
                    db.increment_user_usage(tg_user_id, content_type)
                    print(f"[Executor] Usage incremented: {tg_user_id} +1 {content_type}")
                except Exception as ue:
                    print(f"[Executor] Usage increment failed: {ue}")

                # Track API key usage
                api_key = context.get("leonardo_api_key")
                if api_key:
                    try:
                        db.increment_key_usage(api_key)
                    except Exception:
                        pass

            # Check for output nodes — collect results
            if "_output" in node_outputs:
                results.append({
                    "node_id": node_id,
                    "label": node_outputs["_output"].get("label", "Result"),
                    "data": node_outputs["_output"].get("data", {}),
                })

            if on_node_complete:
                on_node_complete(node_id, node_type, node_outputs, idx, total)

        except Exception as e:
            error_msg = str(e)
            
            # Intercept Leonardo API token exhaustion
            err_str = error_msg.lower()
            if "401" in err_str or "402" in err_str or "not enough api tokens" in err_str or "insufficient tokens" in err_str:
                api_key = context.get("leonardo_api_key")
                if api_key:
                    try:
                        db.mark_key_exhausted(api_key)
                    except Exception:
                        pass
                error_msg = "Sistem telah mengganti API Key karena limit token tercapai. Silakan klik Run kembali."

            errors[node_id] = error_msg
            traceback.print_exc()

            if on_node_error:
                on_node_error(node_id, node_type, error_msg, idx, total)

            # Check if downstream nodes depend on this — they'll fail too
            # For now, continue executing other branches

    elapsed = round(time.time() - start_time, 2)
    status = "completed" if not errors else ("partial" if outputs else "failed")

    return {
        "status": status,
        "outputs": {k: _safe_serialize(v) for k, v in outputs.items()},
        "errors": errors,
        "results": results,
        "elapsed": elapsed,
    }


def _safe_serialize(obj):
    """Ensure output is JSON-serializable."""
    if isinstance(obj, dict):
        return {k: _safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_serialize(i) for i in obj]
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    return str(obj)
