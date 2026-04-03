"""
Workflow Studio — Configuration.
All settings loaded from environment variables.
"""
import os
import secrets
from dotenv import load_dotenv

load_dotenv()

# ── Server ──────────────────────────────────────────
PORT = int(os.getenv("PORT", os.getenv("WS_PORT", "5002")))
SECRET_KEY = os.getenv("WS_SECRET_KEY", secrets.token_hex(32))
DEBUG = os.getenv("WS_DEBUG", "0") == "1"

# ── JWT Auth ────────────────────────────────────────
JWT_SECRET = os.getenv("WS_JWT_SECRET", SECRET_KEY)
JWT_EXPIRY_HOURS = int(os.getenv("WS_JWT_EXPIRY_HOURS", "72"))

# ── Database API (PythonAnywhere) ───────────────────
DB_API_URL = os.getenv("DB_API_URL", "")
DB_API_KEY = os.getenv("DB_API_KEY", "")

# ── Leonardo API ────────────────────────────────────
LEONARDO_API_KEY = os.getenv("LEONARDO_API_KEY", "")

# ── Upload limits ───────────────────────────────────
MAX_UPLOAD_MB = int(os.getenv("WS_MAX_UPLOAD_MB", "100"))
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")

# ── CORS ────────────────────────────────────────────
CORS_ORIGINS = os.getenv("WS_CORS_ORIGINS", "*")
