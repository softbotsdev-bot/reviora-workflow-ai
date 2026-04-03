"""
Auth module — Email/Password authentication with JWT tokens.
"""
import time
import hashlib
import hmac
import json
import base64
import re
from functools import wraps
from flask import request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash

from config import JWT_SECRET, JWT_EXPIRY_HOURS
import db_client as db


def _create_jwt(payload: dict) -> str:
    """Create a simple JWT token (HS256)."""
    header = base64.urlsafe_b64encode(json.dumps(
        {"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload_b64 = base64.urlsafe_b64encode(
        json.dumps(payload).encode()).rstrip(b"=").decode()
    signing_input = f"{header}.{payload_b64}"
    signature = hmac.new(
        JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()
    return f"{header}.{payload_b64}.{sig_b64}"


def _decode_jwt(token: str) -> dict | None:
    """Decode and verify a JWT token. Returns payload or None."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload_b64, sig_b64 = parts

        # Verify signature
        signing_input = f"{header}.{payload_b64}"
        expected_sig = hmac.new(
            JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256
        ).digest()
        # Pad base64
        sig_b64_padded = sig_b64 + "=" * (4 - len(sig_b64) % 4)
        actual_sig = base64.urlsafe_b64decode(sig_b64_padded)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        # Decode payload
        payload_padded = payload_b64 + "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_padded))

        # Check expiry
        if payload.get("exp", 0) < time.time():
            return None

        return payload
    except Exception:
        return None


def register_user(email: str, password: str, display_name: str = "") -> tuple:
    """Register a new user. Returns (user_data, error)."""
    email = email.strip().lower()
    if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email):
        return None, "Format email tidak valid"
    if len(password) < 6:
        return None, "Password minimal 6 karakter"

    # Check if email already exists
    existing = db.ws_login_user(email)
    if existing:
        return None, "Email sudah terdaftar"

    password_hash = generate_password_hash(password)
    display_name = display_name.strip() or email.split("@")[0]

    result = db.ws_register_user(email, password_hash, display_name)
    if result:
        return result, None
    return None, "Gagal registrasi, coba lagi"


def login_user(email: str, password: str) -> tuple:
    """Login user. Returns (token, user_data, error)."""
    email = email.strip().lower()
    user = db.ws_login_user(email)
    if not user:
        return None, None, "Email atau password salah"

    if not check_password_hash(user.get("password_hash", ""), password):
        return None, None, "Email atau password salah"

    # Create JWT
    payload = {
        "sub": user["id"],
        "email": email,
        "name": user.get("display_name", ""),
        "exp": time.time() + (JWT_EXPIRY_HOURS * 3600),
        "iat": time.time(),
    }
    token = _create_jwt(payload)

    safe_user = {
        "id": user["id"],
        "email": email,
        "display_name": user.get("display_name", ""),
        "telegram_user_id": user.get("telegram_user_id"),
        "created_at": user.get("created_at", ""),
    }
    return token, safe_user, None


def require_auth(f):
    """Decorator: require valid JWT in Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify(error="Token diperlukan"), 401

        token = auth_header[7:]
        payload = _decode_jwt(token)
        if not payload:
            return jsonify(error="Token tidak valid atau expired"), 401

        g.user_id = payload["sub"]
        g.user_email = payload.get("email", "")
        g.user_name = payload.get("name", "")
        return f(*args, **kwargs)
    return decorated
