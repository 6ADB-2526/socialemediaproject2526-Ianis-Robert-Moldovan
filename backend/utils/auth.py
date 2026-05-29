from flask import session, jsonify
from extensions import db


def require_auth():
    """Return (user_id, None, None) or (None, error_response, status_code)."""
    # Avoid circular import by importing model here
    from models.user import User

    user_id = session.get("user_id")
    if not user_id:
        return None, jsonify({"error": "Niet ingelogd"}), 401
    user = db.session.get(User, user_id)
    if not user:
        return None, jsonify({"error": "Gebruiker niet gevonden"}), 404
    return user_id, None, None


def notify_users(event_name: str, payload, *user_ids):
    """Emit a Socket.IO event to each user's personal room."""
    from extensions import socketio

    for uid in user_ids:
        if uid:
            socketio.emit(event_name, payload, room=f"user_{uid}")
