from flask import Blueprint, request, jsonify
from extensions import db
from models.user import User
from models.group import GroupChat, GroupChatMember, GroupMessage, is_group_member, get_group_member_ids
from models.friendship import are_friends, is_blocked_between
from utils.auth import require_auth, notify_users

groups_bp = Blueprint("groups", __name__, url_prefix="/api")


@groups_bp.route("/groups", methods=["GET"])
def get_groups():
    user_id, error, code = require_auth()
    if error:
        return error, code

    group_ids = [m.group_id for m in GroupChatMember.query.filter_by(user_id=user_id).all()]
    groups = GroupChat.query.filter(GroupChat.id.in_(group_ids)).all() if group_ids else []
    payload = [g.to_dict(viewer_id=user_id) for g in groups]
    payload.sort(
        key=lambda g: g["last_message"]["created_at"] if g["last_message"] else g["created_at"],
        reverse=True,
    )
    return jsonify({"groups": payload}), 200


@groups_bp.route("/groups", methods=["POST"])
def create_group():
    user_id, error, code = require_auth()
    if error:
        return error, code

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    raw_ids = data.get("member_ids") or []

    if not isinstance(raw_ids, list):
        return jsonify({"error": "Kies vrienden voor de groep"}), 400

    member_ids = []
    for raw_id in raw_ids:
        try:
            mid = int(raw_id)
        except (TypeError, ValueError):
            return jsonify({"error": "Ongeldige gebruiker in de groep"}), 400
        if mid != user_id and mid not in member_ids:
            member_ids.append(mid)

    if len(member_ids) < 2:
        return jsonify({"error": "Kies minimaal 2 vrienden voor een groepschat"}), 400
    if len(name) > 80:
        return jsonify({"error": "Groepsnaam mag maximaal 80 tekens zijn"}), 400

    members_by_id = {u.id: u for u in User.query.filter(User.id.in_(member_ids)).all()}
    if len(members_by_id) != len(member_ids):
        return jsonify({"error": "Een of meer gebruikers bestaan niet"}), 404

    for mid in member_ids:
        if not are_friends(user_id, mid) or is_blocked_between(user_id, mid):
            return jsonify({"error": "Je kan alleen vrienden toevoegen aan een groep"}), 403

    if not name:
        preview = [members_by_id[mid].username for mid in member_ids[:3]]
        name = "Groep met " + ", ".join(preview)
        if len(member_ids) > 3:
            name += f" +{len(member_ids) - 3}"

    group = GroupChat(name=name, creator_id=user_id)
    db.session.add(group)
    db.session.flush()

    all_ids = [user_id] + member_ids
    for mid in all_ids:
        db.session.add(GroupChatMember(group_id=group.id, user_id=mid))
    db.session.commit()

    payload = group.to_dict(viewer_id=user_id)
    notify_users("groups_updated", payload, *all_ids)
    return jsonify({"message": "Groep aangemaakt", "group": payload}), 201


@groups_bp.route("/groups/<int:group_id>/messages", methods=["GET"])
def get_group_messages(group_id):
    user_id, error, code = require_auth()
    if error:
        return error, code

    group = db.session.get(GroupChat, group_id)
    if not group or not is_group_member(group_id, user_id):
        return jsonify({"error": "Groep niet gevonden"}), 404

    messages = GroupMessage.query.filter_by(group_id=group_id).order_by(GroupMessage.created_at.asc()).all()
    return jsonify({"messages": [m.to_dict(viewer_id=user_id) for m in messages]}), 200


@groups_bp.route("/groups/<int:group_id>/messages/send", methods=["POST"])
def send_group_message(group_id):
    user_id, error, code = require_auth()
    if error:
        return error, code

    group = db.session.get(GroupChat, group_id)
    if not group or not is_group_member(group_id, user_id):
        return jsonify({"error": "Groep niet gevonden"}), 404

    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()
    voice_data = data.get("voice_data") or None
    is_voice = bool(data.get("is_voice", False) or voice_data)
    voice_duration = data.get("voice_duration") or None

    if not text and not voice_data:
        return jsonify({"error": "Bericht of voice message is verplicht"}), 400

    msg = GroupMessage(
        group_id=group_id,
        sender_id=user_id,
        text=text if not is_voice else None,
        is_voice=is_voice,
        voice_data=voice_data,
        voice_duration=voice_duration,
    )
    db.session.add(msg)
    db.session.commit()

    member_ids = get_group_member_ids(group_id)
    msg_payload = msg.to_dict(viewer_id=user_id)
    group_payload = group.to_dict(viewer_id=user_id)
    notify_users("new_group_message", msg_payload, *member_ids)
    notify_users("groups_updated", group_payload, *member_ids)
    return jsonify({"message": msg_payload}), 201


@groups_bp.route("/groups/messages/<int:message_id>", methods=["DELETE"])
def delete_group_message(message_id):
    user_id, error, code = require_auth()
    if error:
        return error, code

    msg = db.session.get(GroupMessage, message_id)
    if not msg or msg.sender_id != user_id or not is_group_member(msg.group_id, user_id):
        return jsonify({"error": "Bericht niet gevonden of geen toegang"}), 404

    group_id = msg.group_id
    group = db.session.get(GroupChat, group_id)
    member_ids = get_group_member_ids(group_id)
    db.session.delete(msg)
    db.session.commit()

    notify_users("group_message_deleted", {"message_id": message_id, "group_id": group_id}, *member_ids)
    if group:
        notify_users("groups_updated", group.to_dict(viewer_id=user_id), *member_ids)
    return jsonify({"message": "Verwijderd"}), 200
