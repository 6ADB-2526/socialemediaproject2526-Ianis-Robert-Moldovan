# =============================================================================
# routes/auth.py — API voor accounts: registreren, inloggen, uitloggen,
# profiel ophalen en instellingen aanpassen.
# Alle URL's beginnen met /api (zie url_prefix hieronder).
# =============================================================================

from flask import Blueprint, request, jsonify, session
from extensions import db, bcrypt
from models.user import User
from utils.auth import require_auth
import re

# Een blueprint groepeert deze routes. url_prefix zorgt dat alles onder /api komt.
auth_bp = Blueprint("auth", __name__, url_prefix="/api")


@auth_bp.route("/register", methods=["POST"])
def register():
    """Maakt een nieuw account aan na een paar controles, en logt meteen in."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")

    # Controles op de invoer (validatie):
    if not username or not email or not password:
        return jsonify({"error": "Alle velden zijn verplicht"}), 400
    if len(username) < 3:
        return jsonify({"error": "Gebruikersnaam moet minimaal 3 tekens zijn"}), 400
    if len(password) < 8:
        return jsonify({"error": "Wachtwoord moet minimaal 8 tekens zijn"}), 400
    if not re.search(r"[^A-Za-z0-9]", password):
        return jsonify({"error": "Wachtwoord moet minimaal 1 speciaal teken bevatten"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Gebruikersnaam is al in gebruik"}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "E-mailadres is al in gebruik"}), 409

    # Maak de gebruiker aan. Het wachtwoord wordt GEHASHT met bcrypt (nooit als
    # gewone tekst opgeslagen).
    user = User(
        username=username,
        email=email,
        password_hash=bcrypt.generate_password_hash(password).decode("utf-8"),
        avatar_seed=username,
    )
    db.session.add(user)
    db.session.commit()
    # Meteen inloggen: zet user_id in de sessie (versleutelde cookie).
    session["user_id"] = user.id
    return jsonify({"message": "Account aangemaakt!", "user": user.to_dict()}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """Logt in op naam OF e-mail, na controle van het wachtwoord."""
    data = request.get_json(silent=True) or {}
    identifier = data.get("username_or_email", "").strip()
    password = data.get("password", "")

    # Zoek de gebruiker op gebruikersnaam of e-mail.
    user = User.query.filter(
        (User.username == identifier) | (User.email == identifier)
    ).first()

    # Vergelijk het ingetypte wachtwoord met de opgeslagen hash.
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "Ongeldige gebruikersnaam of wachtwoord"}), 401

    session["user_id"] = user.id  # ingelogd: onthoud wie je bent in de sessie
    return jsonify({"message": "Ingelogd!", "user": user.to_dict()}), 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Logt uit door het user_id uit de sessie te verwijderen."""
    session.pop("user_id", None)
    return jsonify({"message": "Uitgelogd"}), 200


@auth_bp.route("/me", methods=["GET"])
def get_me():
    """Geeft de huidige ingelogde gebruiker terug.
    De frontend gebruikt dit om te checken of je (nog) ingelogd bent."""
    user_id, error, code = require_auth()
    if error:
        return error, code
    user = db.session.get(User, user_id)
    return jsonify({"user": user.to_dict()}), 200


@auth_bp.route("/me/avatar", methods=["PUT"])
def update_avatar():
    """Werkt de profielfoto bij (via een geüpload bestand OF een URL)."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    data = request.get_json(silent=True) or {}
    avatar_url = data.get("avatar_url", "").strip()
    avatar_file = data.get("avatar_file", "").strip()

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Gebruiker niet gevonden"}), 404

    # Een geüpload bestand heeft voorrang op een URL.
    user.avatar_file = avatar_file or None
    user.avatar_url = (avatar_url if not avatar_file else None) or None
    db.session.commit()
    return jsonify({"message": "Avatar bijgewerkt!", "user": user.to_dict()}), 200


@auth_bp.route("/me/settings", methods=["PUT"])
def update_settings():
    """Past instellingen aan: dark mode en/of themakleur."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Gebruiker niet gevonden"}), 404

    data = request.get_json(silent=True) or {}
    if "dark_mode" in data:
        user.dark_mode = bool(data["dark_mode"])
    if "theme_color" in data:
        user.theme_color = data["theme_color"]

    db.session.commit()
    return jsonify({"message": "Instellingen bijgewerkt!", "user": user.to_dict()}), 200
