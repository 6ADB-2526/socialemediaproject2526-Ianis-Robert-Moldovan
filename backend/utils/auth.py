# =============================================================================
# utils/auth.py — twee kleine hulpfuncties die in bijna ELKE route gebruikt worden.
# =============================================================================

from flask import session, jsonify
from extensions import db


def require_auth():
    """Controleert of er een ingelogde gebruiker is.

    Geeft terug: (user_id, None, None) als alles oké is,
    of (None, foutmelding, statuscode) als er iemand NIET ingelogd is.

    Zo hoeft elke route maar één regel te schrijven i.p.v. de hele check te
    herhalen (DRY = Don't Repeat Yourself).
    """
    # Lokale import om circulaire import te vermijden.
    from models.user import User

    user_id = session.get("user_id")   # zit er een user_id in de sessie-cookie?
    if not user_id:
        return None, jsonify({"error": "Niet ingelogd"}), 401
    user = db.session.get(User, user_id)
    if not user:
        return None, jsonify({"error": "Gebruiker niet gevonden"}), 404
    return user_id, None, None


def notify_users(event_name: str, payload, *user_ids):
    """Stuur een realtime Socket.IO-event naar de persoonlijke kamer van
    één of meer gebruikers (bv. 'je hebt een nieuw bericht')."""
    from extensions import socketio

    for uid in user_ids:
        if uid:
            socketio.emit(event_name, payload, room=f"user_{uid}")
