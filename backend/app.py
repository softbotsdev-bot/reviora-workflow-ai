"""
Reviora Workflow Studio — Main Flask Application.
Serves REST API + built React frontend.
"""
import os
import json
import uuid
import threading
import time
from flask import Flask, request, jsonify, send_from_directory, g, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename
from queue import Queue, Empty

import config
import db_client as db
from auth import register_user, login_user, require_auth
from executor import execute_workflow, estimate_workflow_cost
from nodes import get_all_node_definitions

# ── Flask App ────────────────────────────────────────
# In Docker: dist is at ./frontend/dist (copied into backend workdir)
# In local dev: dist is at ../frontend/dist
_dist_docker = os.path.join(os.path.dirname(__file__), "frontend", "dist")
_dist_local = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
_static = _dist_docker if os.path.isdir(_dist_docker) else _dist_local

app = Flask(__name__, static_folder=_static, static_url_path="")
app.secret_key = config.SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = config.MAX_UPLOAD_MB * 1024 * 1024

CORS(app, origins=config.CORS_ORIGINS.split(","))

# Ensure upload dir exists
os.makedirs(config.UPLOAD_DIR, exist_ok=True)

# ── In-memory state ──────────────────────────────────
_run_progress = {}   # run_id -> Queue for SSE
_run_lock = threading.Lock()


# ════════════════════════════════════════════════════
#  STATIC / SPA
# ════════════════════════════════════════════════════

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    full = os.path.join(app.static_folder, path)
    if os.path.isfile(full):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


# ════════════════════════════════════════════════════
#  AUTH ENDPOINTS
# ════════════════════════════════════════════════════

@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "")
    password = data.get("password", "")
    name = data.get("display_name", "")

    user, err = register_user(email, password, name)
    if err:
        return jsonify(ok=False, error=err), 400

    # Auto-login after register
    token, user_data, _ = login_user(email, password)
    return jsonify(ok=True, token=token, user=user_data)


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "")
    password = data.get("password", "")

    token, user_data, err = login_user(email, password)
    if err:
        return jsonify(ok=False, error=err), 401

    return jsonify(ok=True, token=token, user=user_data)


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def api_me():
    user = db.ws_get_user(g.user_id)
    if not user:
        return jsonify(ok=False, error="User not found"), 404

    # Get linked plan if telegram is linked
    plan = None
    tg_id = user.get("telegram_user_id")
    if tg_id:
        plan = db.get_user_plan(tg_id)

    return jsonify(ok=True, user={
        "id": user["id"],
        "email": user.get("email", ""),
        "display_name": user.get("display_name", ""),
        "telegram_user_id": tg_id,
        "plan": plan,
    })


@app.route("/api/auth/link-telegram", methods=["POST"])
@require_auth
def api_link_telegram():
    data = request.get_json(silent=True) or {}
    tg_id = data.get("telegram_user_id")
    if not tg_id:
        return jsonify(ok=False, error="telegram_user_id required"), 400

    db.ws_link_telegram(g.user_id, int(tg_id))
    return jsonify(ok=True)


# ════════════════════════════════════════════════════
#  NODE DEFINITIONS
# ════════════════════════════════════════════════════

@app.route("/api/nodes", methods=["GET"])
@require_auth
def api_nodes():
    return jsonify(ok=True, nodes=get_all_node_definitions())


# ════════════════════════════════════════════════════
#  FILE UPLOAD
# ════════════════════════════════════════════════════

@app.route("/api/upload", methods=["POST"])
@require_auth
def api_upload():
    if "file" not in request.files:
        return jsonify(ok=False, error="No file"), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify(ok=False, error="Empty filename"), 400

    ext = os.path.splitext(f.filename)[1].lower()
    allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".avi", ".webm"}
    if ext not in allowed:
        return jsonify(ok=False, error=f"File type {ext} not allowed"), 400

    unique_name = f"{uuid.uuid4().hex[:12]}{ext}"
    save_path = os.path.join(config.UPLOAD_DIR, unique_name)
    f.save(save_path)

    # Public URL — served by this same Flask app
    base_url = request.host_url.rstrip("/")
    file_url = f"{base_url}/api/files/{unique_name}"

    return jsonify(ok=True, url=file_url, filename=unique_name)


@app.route("/api/files/<filename>")
def serve_upload(filename):
    return send_from_directory(config.UPLOAD_DIR, secure_filename(filename))


# ════════════════════════════════════════════════════
#  WORKFLOW CRUD
# ════════════════════════════════════════════════════

@app.route("/api/workflows", methods=["GET"])
@require_auth
def api_list_workflows():
    workflows = db.ws_list_workflows(g.user_id)
    return jsonify(ok=True, workflows=workflows or [])


@app.route("/api/workflows", methods=["POST"])
@require_auth
def api_save_workflow():
    data = request.get_json(silent=True) or {}
    wf_id = data.get("id", uuid.uuid4().hex[:16])
    name = data.get("name", "Untitled Workflow")
    graph = data.get("graph", {})

    db.ws_save_workflow(g.user_id, wf_id, name, json.dumps(graph))
    return jsonify(ok=True, id=wf_id)


@app.route("/api/workflows/<wf_id>", methods=["GET"])
@require_auth
def api_get_workflow(wf_id):
    wf = db.ws_get_workflow(wf_id, g.user_id)
    if not wf:
        return jsonify(ok=False, error="Not found"), 404

    # Parse graph JSON
    if isinstance(wf.get("graph_json"), str):
        try:
            wf["graph"] = json.loads(wf["graph_json"])
        except:
            wf["graph"] = {}
    return jsonify(ok=True, workflow=wf)


@app.route("/api/workflows/<wf_id>", methods=["DELETE"])
@require_auth
def api_delete_workflow(wf_id):
    db.ws_delete_workflow(wf_id, g.user_id)
    return jsonify(ok=True)


# ════════════════════════════════════════════════════
#  WORKFLOW EXECUTION
# ════════════════════════════════════════════════════

@app.route("/api/workflows/run", methods=["POST"])
@require_auth
def api_run_workflow():
    data = request.get_json(silent=True) or {}
    graph = data.get("graph", {})
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])

    if not nodes:
        return jsonify(ok=False, error="Workflow kosong"), 400

    # Estimate cost
    cost = estimate_workflow_cost(nodes)

    # Check user credits (via linked Telegram account)
    user = db.ws_get_user(g.user_id)
    tg_id = user.get("telegram_user_id") if user else None

    # Get API keys
    leo_key = db.get_valid_api_key("v2")
    freepik_key = None
    try:
        freepik_key = db.get_valid_freepik_key()
    except:
        pass

    if not leo_key:
        return jsonify(ok=False, error="Tidak ada Leonardo API key tersedia"), 503

    # Create run record
    run_id = uuid.uuid4().hex[:16]

    # Create SSE queue
    with _run_lock:
        _run_progress[run_id] = Queue()

    # Start execution in background
    t = threading.Thread(
        target=_run_workflow_bg,
        args=(run_id, graph, g.user_id, tg_id, leo_key, freepik_key),
        daemon=True,
    )
    t.start()

    return jsonify(ok=True, run_id=run_id, estimated_cost=cost)


def _run_workflow_bg(run_id, graph, ws_user_id, tg_user_id, leo_key, freepik_key):
    """Background thread: execute workflow and push SSE events."""
    q = _run_progress.get(run_id)

    def _push(event_type, data):
        if q:
            msg = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
            try:
                q.put_nowait(msg)
            except:
                pass

    context = {
        "user_id": ws_user_id,
        "telegram_user_id": tg_user_id,
        "leonardo_api_key": leo_key,
        "freepik_api_key": freepik_key,
    }

    def on_start(nid, ntype, idx, total):
        _push("node_start", {"node_id": nid, "type": ntype, "index": idx, "total": total})

    def on_complete(nid, ntype, outputs, idx, total):
        _push("node_complete", {"node_id": nid, "type": ntype, "index": idx, "total": total,
                                "outputs": outputs})

    def on_error(nid, ntype, err, idx, total):
        _push("node_error", {"node_id": nid, "type": ntype, "error": err, "index": idx, "total": total})

    try:
        result = execute_workflow(
            graph, context,
            on_node_start=on_start,
            on_node_complete=on_complete,
            on_node_error=on_error,
        )
        _push("workflow_done", result)
    except Exception as e:
        _push("workflow_done", {"status": "failed", "errors": {"_": str(e)}, "results": [], "elapsed": 0})
    finally:
        # Release API keys
        try:
            db.release_api_key(leo_key)
        except:
            pass
        if freepik_key:
            try:
                db.release_freepik_key(freepik_key)
            except:
                pass

        # Mark SSE stream as done
        _push("__done__", {})

        # Cleanup queue after delay
        def _cleanup():
            time.sleep(60)
            with _run_lock:
                _run_progress.pop(run_id, None)
        threading.Thread(target=_cleanup, daemon=True).start()


@app.route("/api/workflows/run/<run_id>/events")
@require_auth
def api_run_events(run_id):
    """SSE endpoint for real-time execution progress."""
    q = _run_progress.get(run_id)
    if not q:
        return jsonify(ok=False, error="Run not found"), 404

    def stream():
        while True:
            try:
                msg = q.get(timeout=120)
                if "__done__" in msg:
                    yield msg
                    break
                yield msg
            except Empty:
                yield "event: ping\ndata: {}\n\n"

    return Response(stream(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ════════════════════════════════════════════════════
#  HEALTH CHECK
# ════════════════════════════════════════════════════

@app.route("/api/health")
def health():
    return jsonify(ok=True, service="workflow-studio")


# ════════════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════════════

if __name__ == "__main__":
    print(f"[Workflow Studio] Starting on port {config.PORT}")
    print(f"[Workflow Studio] DB API: {config.DB_API_URL or 'NOT SET'}")
    app.run(host="0.0.0.0", port=config.PORT, debug=config.DEBUG)
