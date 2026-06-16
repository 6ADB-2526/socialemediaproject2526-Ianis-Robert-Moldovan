"""
app.py — Application entry point (HET STARTPUNT VAN DE SERVER).

Dit bestand draai je met:  python app.py
Het bouwt de Flask + Socket.IO-server op en start hem.

Grote lijn van dit bestand:
  1) create_app(): maakt de app, stelt configuratie in, koppelt extensions,
     registreert alle routes (blueprints) en een paar losse routes.
  2) Onderaan (__main__): maakt de database klaar en start de server op.
"""
import os

from flask import Flask, jsonify
from flask_cors import CORS

from extensions import db, bcrypt, socketio
from utils.helpers import get_ice_servers, get_lan_ip
from db_migrate import ensure_schema
from routes import auth_bp, friends_bp, messages_bp, groups_bp, stories_bp

# Pad naar deze map (backend/) en naar de frontend-map ernaast.
# We berekenen dit zodat de server de HTML/CSS/JS-bestanden kan terugsturen.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))


def create_app() -> Flask:
    """Bouwt de volledige Flask-applicatie op en geeft ze terug.

    Deze 'application factory' is een nette Flask-gewoonte: alle opbouw zit in
    één functie, zodat je de app makkelijk kan aanmaken (en bv. testen).
    """
    # static_folder = de frontend-map, zodat de server HTML/CSS/JS kan serveren.
    app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

    # ── Configuration ─────────────────────────────────────────────────────
    # SECRET_KEY: geheime sleutel om de sessie-cookie te versleutelen (login).
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "snapchat-clone-secret-key-change-in-production")
    # Waar de SQLite-database staat (bestand snapchat.db).
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///snapchat.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    # Maximale grootte van een upload (24 MB) — beschermt tegen te grote bestanden.
    app.config["MAX_CONTENT_LENGTH"] = 24 * 1024 * 1024
    # Cookie-instellingen voor de sessie (veiligheid).
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "0") == "1"

    # ── Extensions ────────────────────────────────────────────────────────
    # Hier koppelen we de eerder leeg-aangemaakte objecten aan deze app.
    db.init_app(app)
    bcrypt.init_app(app)

    # CORS = bepaalt welke websites de API mogen aanroepen. Nodig omdat de
    # frontend soms op een ander adres/poort draait dan de backend.
    cors_origins_env = os.environ.get("CORS_ORIGINS")
    allowed_origins = (
        [o.strip() for o in cors_origins_env.split(",") if o.strip()]
        if cors_origins_env
        else ["http://127.0.0.1:5500", "http://localhost:5500", "null", "*"]
    )
    CORS(app, supports_credentials=True, origins=allowed_origins)

    # Socket.IO koppelen voor realtime events.
    socketio.init_app(app, cors_allowed_origins="*", async_mode="threading")

    # ── Blueprints ────────────────────────────────────────────────────────
    # Een blueprint = een groep routes uit een apart bestand. We registreren
    # ze hier allemaal zodat hun URL's (/api/...) bereikbaar worden.
    for bp in (auth_bp, friends_bp, messages_bp, groups_bp, stories_bp):
        app.register_blueprint(bp)

    # ── Static / utility routes ───────────────────────────────────────────
    @app.route("/")
    def serve_frontend():
        # Begin-URL: toont de login-/registratiepagina.
        return app.send_static_file("auth.html")

    @app.route("/snap")
    @app.route("/snap/")
    def serve_snap():
        # De hoofd-app (na het inloggen).
        return app.send_static_file("pages/snap.html")

    @app.route("/health")
    def health():
        # Simpele check: leeft de server nog? Handig om te testen.
        return jsonify({"status": "ok"}), 200

    @app.route("/api/config")
    def client_config():
        # Geeft instellingen aan de frontend, o.a. de ICE-servers voor bellen.
        return jsonify({
            "ice_servers": get_ice_servers(),
            "max_upload_mb": app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024),
            "public_url": os.environ.get("PUBLIC_URL", "").rstrip("/"),
            "needs_https_for_media": True,
        }), 200

    # De socket-events staan in socket_events.py. Door het te importeren worden
    # de @socketio.on(...)-handlers geregistreerd (dat gebeurt bij het importeren).
    import socket_events  # noqa: F401

    return app


# ── Entry point ───────────────────────────────────────────────────────────
# Dit blok draait alleen als je dit bestand rechtstreeks start (python app.py).

if __name__ == "__main__":
    app = create_app()

    # Database klaarmaken: tabellen aanmaken + eventuele migraties uitvoeren.
    with app.app_context():
        ensure_schema()
        print("Database klaar.")

    # Host/poort uit omgevingsvariabelen halen, met standaardwaarden.
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    public_url = os.environ.get("PUBLIC_URL", "").rstrip("/")
    lan_ip = get_lan_ip()

    # Toon de adressen waarop de server bereikbaar is.
    print(f"Open op deze pc:    http://127.0.0.1:{port}")
    print(f"Zelfde wifi:        http://{lan_ip}:{port}")
    if public_url:
        print(f"Buiten wifi:        {public_url}")
    else:
        print("Buiten wifi: gebruik een HTTPS tunnel en deel die URL.")

    # Start de server (met Socket.IO-ondersteuning).
    socketio.run(app, host=host, debug=debug, port=port, allow_unsafe_werkzeug=True)
