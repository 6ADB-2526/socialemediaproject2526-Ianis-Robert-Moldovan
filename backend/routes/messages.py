# =============================================================================
# routes/messages.py — API voor PRIVÉberichten: ophalen, sturen, snaps
# openen/bewaren, en verwijderen.
# =============================================================================

from flask import Blueprint, request, jsonify
from extensions import db, socketio
from models.user import User
from models.message import Message
from models.friendship import are_friends, is_blocked_between
from utils.auth import require_auth, notify_users

messages_bp = Blueprint("messages", __name__, url_prefix="/api")


def _get_room(user1: int, user2: int) -> str:
    """Naam van de gedeelde chat-kamer voor twee gebruikers.
    De id's worden gesorteerd (min/max) zodat beide personen DEZELFDE naam
    krijgen, ongeacht wie de zender is."""
    return f"chat_{min(user1, user2)}_{max(user1, user2)}"


@messages_bp.route("/messages/<int:friend_id>", methods=["GET"])
def get_messages(friend_id):
    """Haalt het volledige gesprek met een vriend op en markeert de berichten
    van die vriend als 'gelezen'."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    # Controles: niet geblokkeerd en wél bevriend.
    if is_blocked_between(user_id, friend_id):
        return jsonify({"error": "Dit gesprek is geblokkeerd"}), 403
    if not are_friends(user_id, friend_id):
        return jsonify({"error": "Je bent niet bevriend met deze gebruiker"}), 403

    # Alle berichten tussen jullie, oudste eerst.
    messages = Message.query.filter(
        ((Message.sender_id == user_id) & (Message.receiver_id == friend_id))
        | ((Message.sender_id == friend_id) & (Message.receiver_id == user_id))
    ).order_by(Message.created_at.asc()).all()

    # Gewiste berichten van de ander niet tonen; je eigen gewiste berichten wél
    # (zodat je ze kan terugplaatsen).
    messages = [m for m in messages if not m.is_deleted or m.sender_id == user_id]

    # Markeer de ongelezen berichten van de vriend als gelezen.
    Message.query.filter_by(
        sender_id=friend_id, receiver_id=user_id, is_read=False
    ).update({"is_read": True})
    db.session.commit()

    return jsonify({"messages": [m.to_dict(viewer_id=user_id) for m in messages]}), 200


@messages_bp.route("/messages/send", methods=["POST"])
def send_message():
    """Verstuurt een bericht: tekst, snap of voice. Controleert eerst of de
    ontvanger bestaat, niet geblokkeerd is en een vriend is."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    data = request.get_json(silent=True) or {}
    try:
        receiver_id = int(data.get("receiver_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Ongeldige ontvanger"}), 400

    if not db.session.get(User, receiver_id):
        return jsonify({"error": "Ontvanger bestaat niet"}), 404
    if is_blocked_between(user_id, receiver_id):
        return jsonify({"error": "Je kan deze gebruiker geen bericht sturen"}), 403
    if not are_friends(user_id, receiver_id):
        return jsonify({"error": "Je moet eerst vrienden zijn"}), 403

    # Bepaal het type bericht uit de meegestuurde data.
    text = data.get("text", "").strip()
    is_snap = bool(data.get("is_snap", False))
    snap_data = data.get("snap_data") or None
    is_voice = bool(data.get("is_voice", False) or data.get("voice_data"))
    voice_data = data.get("voice_data") or None
    voice_duration = data.get("voice_duration") or None

    if not text and not snap_data and not voice_data:
        return jsonify({"error": "Bericht, snap of voice message is verplicht"}), 400

    msg = Message(
        sender_id=user_id,
        receiver_id=receiver_id,
        # Tekst alleen bewaren als het géén snap/voice is.
        text=text if not is_snap and not is_voice else None,
        is_snap=is_snap,
        snap_data=snap_data,
        is_voice=is_voice,
        voice_data=voice_data,
        voice_duration=voice_duration,
    )
    db.session.add(msg)
    db.session.commit()

    # We sturen een PERSOONLIJKE kopie naar elke kant, want de snap-status
    # verschilt per kijker (verzender ziet 'sent', ontvanger ziet 'new').
    notify_users("new_message", msg.to_dict(viewer_id=user_id), user_id)
    notify_users("new_message", msg.to_dict(viewer_id=receiver_id), receiver_id)
    notify_users("message_notification", msg.to_dict(viewer_id=receiver_id), receiver_id)

    return jsonify({"message": msg.to_dict(viewer_id=user_id)}), 201


@messages_bp.route("/messages/<int:message_id>/open_snap", methods=["POST"])
def open_snap(message_id):
    """Opent een snap. Houdt bij hoe vaak hij geopend is: 1x kijken + 1x replay,
    daarna 'verlopen'. De server bepaalt dit (de frontend kan het niet omzeilen)."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    msg = db.session.get(Message, message_id)
    if not msg or not msg.is_snap or not msg.snap_data:
        return jsonify({"error": "Snap niet gevonden"}), 404
    if user_id not in (msg.sender_id, msg.receiver_id):
        return jsonify({"error": "Geen toegang tot deze snap"}), 403

    other_id = msg.receiver_id if user_id == msg.sender_id else msg.sender_id
    if is_blocked_between(user_id, other_id):
        return jsonify({"error": "Dit gesprek is geblokkeerd"}), 403

    # Een bewaarde snap mag altijd opnieuw bekeken worden.
    if msg.snap_saved:
        return jsonify({"message": msg.to_dict(viewer_id=user_id, include_snap_data=True), "snap_data": msg.snap_data}), 200

    # De verzender opent zijn eigen snap niet (die ziet enkel de status).
    if user_id == msg.sender_id:
        return jsonify({"error": "Je verzonden snap blijft als status in de chat."}), 403
    # 2x of meer = verlopen.
    if msg.snap_open_count >= 2:
        return jsonify({"error": "Deze snap is verlopen"}), 410

    msg.snap_open_count += 1   # tel deze opening mee
    db.session.commit()

    updated = msg.to_dict(viewer_id=user_id)
    # Laat ook de andere kant de nieuwe status zien (bv. 'replay' -> 'expired').
    socketio.emit("snap_updated", updated, room=_get_room(msg.sender_id, msg.receiver_id))
    return jsonify({"message": updated, "snap_data": msg.snap_data}), 200


@messages_bp.route("/messages/<int:message_id>/save_snap", methods=["POST"])
def save_snap(message_id):
    """Bewaart een snap permanent in de chat (dan verloopt hij niet meer)."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    msg = db.session.get(Message, message_id)
    if not msg or not msg.is_snap or not msg.snap_data:
        return jsonify({"error": "Snap niet gevonden"}), 404
    if user_id not in (msg.sender_id, msg.receiver_id):
        return jsonify({"error": "Geen toegang tot deze snap"}), 403

    other_id = msg.receiver_id if user_id == msg.sender_id else msg.sender_id
    if is_blocked_between(user_id, other_id):
        return jsonify({"error": "Dit gesprek is geblokkeerd"}), 403

    msg.snap_saved = True
    db.session.commit()

    updated = msg.to_dict(viewer_id=user_id, include_snap_data=True)
    socketio.emit("snap_updated", updated, room=_get_room(msg.sender_id, msg.receiver_id))
    return jsonify({"message": updated, "snap_data": msg.snap_data}), 200


@messages_bp.route("/messages/<int:message_id>", methods=["DELETE"])
def delete_message(message_id):
    """Wist een bericht (soft delete). Mag alleen de VERZENDER doen.
    Het bericht wordt niet écht verwijderd: de auteur kan het terugplaatsen,
    maar de andere gebruiker ziet het niet meer."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    msg = db.session.get(Message, message_id)
    if not msg or msg.sender_id != user_id:
        return jsonify({"error": "Bericht niet gevonden of geen toegang"}), 404

    msg.is_deleted = True
    db.session.commit()

    # De andere kant moet het bericht zien verdwijnen.
    other_id = msg.receiver_id
    notify_users("message_deleted", {"id": msg.id}, other_id)

    return jsonify({"message": "Gewist", "data": msg.to_dict(viewer_id=user_id)}), 200


@messages_bp.route("/messages/<int:message_id>/restore", methods=["POST"])
def restore_message(message_id):
    """Plaatst een gewist bericht terug. Mag alleen de VERZENDER doen."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    msg = db.session.get(Message, message_id)
    if not msg or msg.sender_id != user_id:
        return jsonify({"error": "Bericht niet gevonden of geen toegang"}), 404

    msg.is_deleted = False
    db.session.commit()

    # De andere kant ziet het bericht opnieuw verschijnen.
    notify_users("new_message", msg.to_dict(viewer_id=msg.receiver_id), msg.receiver_id)

    return jsonify({"message": "Teruggeplaatst", "data": msg.to_dict(viewer_id=user_id)}), 200
