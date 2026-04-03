"""
DB Client — Proxy calls to PythonAnywhere DB API.
Same RPC-style pattern used by the Telegram bot.
"""
import requests
from config import DB_API_URL, DB_API_KEY

_session = requests.Session()


def _call(func_name: str, *args, **kwargs):
    """Call a function on the PythonAnywhere DB API server."""
    if not DB_API_URL:
        raise RuntimeError("DB_API_URL is not configured")

    payload = {
        "function": func_name,
        "args": list(args),
        "kwargs": kwargs,
    }
    headers = {
        "X-API-Key": DB_API_KEY,
        "Content-Type": "application/json",
    }
    try:
        resp = _session.post(
            f"{DB_API_URL.rstrip('/')}/api/call",
            json=payload,
            headers=headers,
            timeout=30,
        )
        data = resp.json()
        if data.get("status") == "ok":
            return data.get("result")
        raise RuntimeError(data.get("error", "Unknown DB API error"))
    except requests.RequestException as e:
        raise RuntimeError(f"DB API connection error: {e}")


# ── User / Auth ─────────────────────────────────────

def get_or_create_user(user_id, username="user"):
    return _call("get_or_create_user", user_id, username)

def get_user(user_id):
    return _call("get_user", user_id)

def get_user_plan(user_id):
    return _call("get_user_plan", user_id)

def check_user_can_generate(user_id, model_type="image"):
    return _call("check_user_can_generate", user_id, model_type)

def increment_user_usage(user_id, model_type="image"):
    return _call("increment_user_usage", user_id, model_type)

def decrement_user_usage(user_id, model_type="image"):
    return _call("decrement_user_usage", user_id, model_type)


# ── API Keys ────────────────────────────────────────

def get_valid_api_key(key_type="v2"):
    return _call("get_valid_api_key", key_type)

def release_api_key(api_key):
    return _call("release_api_key", api_key)

def mark_key_exhausted(api_key):
    return _call("mark_key_exhausted", api_key)

def increment_key_usage(api_key):
    return _call("increment_key_usage", api_key)


# ── Freepik Keys ────────────────────────────────────

def get_valid_freepik_key():
    return _call("get_valid_freepik_key")

def release_freepik_key(api_key):
    return _call("release_freepik_key", api_key)

def mark_freepik_key_exhausted(api_key):
    return _call("mark_freepik_key_exhausted", api_key)

def record_freepik_usage(api_key):
    return _call("record_freepik_usage", api_key)


# ── Workflow-specific DB functions ──────────────────

def ws_register_user(email, password_hash, display_name=""):
    return _call("ws_register_user", email, password_hash, display_name)

def ws_login_user(email):
    """Returns user row dict or None. Caller verifies password."""
    return _call("ws_login_user", email)

def ws_get_user(user_id):
    return _call("ws_get_user", user_id)

def ws_link_telegram(ws_user_id, telegram_user_id):
    return _call("ws_link_telegram", ws_user_id, telegram_user_id)

def ws_save_workflow(user_id, workflow_id, name, graph_json):
    return _call("ws_save_workflow", user_id, workflow_id, name, graph_json)

def ws_get_workflow(workflow_id, user_id):
    return _call("ws_get_workflow", workflow_id, user_id)

def ws_list_workflows(user_id):
    return _call("ws_list_workflows", user_id)

def ws_delete_workflow(workflow_id, user_id):
    return _call("ws_delete_workflow", workflow_id, user_id)

def ws_create_run(workflow_id, user_id):
    return _call("ws_create_run", workflow_id, user_id)

def ws_update_run(run_id, **kwargs):
    return _call("ws_update_run", run_id, **kwargs)

def ws_get_run(run_id):
    return _call("ws_get_run", run_id)

def ws_list_runs(user_id, limit=20):
    return _call("ws_list_runs", user_id, limit)


# ── Logging ─────────────────────────────────────────

def log_request(api_key, status, message, raw_json=None):
    try:
        return _call("log_request", api_key, status, message, raw_json)
    except:
        pass  # Non-critical
