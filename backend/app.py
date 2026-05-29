"""
app.py — Application entry point.

Starts the Snapchat-clone Flask + Socket.IO server.
Run:  python app.py
"""
import os

from flask import Flask, jsonify
from flask_cors import CORS

from extensions import db, bcrypt, socketio
from utils.helpers import get_ice_servers, get_lan_ip
from db_migrate import ensure_schema
from routes import auth_bp, friends_bp, messages_bp, groups_bp, stories_bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))


def create_app() -> Flask:
    app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

    # ── Configuration ─────────────────────────────────────────────────────
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "snapchat-clone-secret-key-change-in-production")
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///snapchat.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 24 * 1024 * 1024
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "0") == "1"

    # ── Extensions ────────────────────────────────────────────────────────
    db.init_app(app)
    bcrypt.init_app(app)

    cors_origins_env = os.environ.get("CORS_ORIGINS")
    allowed_origins = (
        [o.strip() for o in cors_origins_env.split(",") if o.strip()]
        if cors_origins_env
        else ["http://127.0.0.1:5500", "http://localhost:5500", "null", "*"]
    )
    CORS(app, supports_credentials=True, origins=allowed_origins)

    socketio.init_app(app, cors_allowed_origins="*", async_mode="threading")

    # ── Blueprints ────────────────────────────────────────────────────────
    for bp in (auth_bp, friends_bp, messages_bp, groups_bp, stories_bp):
        app.register_blueprint(bp)

    # ── Static / utility routes ───────────────────────────────────────────
    @app.route("/")
    def serve_frontend():
        return app.send_static_file("auth.html")

    @app.route("/snap")
    @app.route("/snap/")
    def serve_snap():
        return app.send_static_file("pages/snap.html")

    @app.route("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    @app.route("/api/config")
    def client_config():
        return jsonify({
            "ice_servers": get_ice_servers(),
            "max_upload_mb": app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024),
            "public_url": os.environ.get("PUBLIC_URL", "").rstrip("/"),
            "needs_https_for_media": True,
        }), 200

    # Import socket event handlers (registration happens at import time)
    import socket_events  # noqa: F401

    return app


# ── Entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = create_app()

    with app.app_context():
        ensure_schema()
        print("Database klaar.")

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    public_url = os.environ.get("PUBLIC_URL", "").rstrip("/")
    lan_ip = get_lan_ip()

    print(f"Open op deze pc:    http://127.0.0.1:{port}")
    print(f"Zelfde wifi:        http://{lan_ip}:{port}")
    if public_url:
        print(f"Buiten wifi:        {public_url}")
    else:
        print("Buiten wifi: gebruik een HTTPS tunnel en deel die URL.")

    socketio.run(app, host=host, debug=debug, port=port, allow_unsafe_werkzeug=True)
