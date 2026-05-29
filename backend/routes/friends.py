from flask import Blueprint, request, jsonify, session
from extensions import db
from models.user import User
from models.friendship import (
    FriendRequest, Friendship, BlockedUser,
    are_friends, is_blocked_between, get_relation_status,
)
from models.message import Message
from utils.auth import require_auth, notify_users

friends_bp = Blueprint("friends", __name__, url_prefix="/api")


@friends_bp.route("/friends", methods=["GET"])
def get_friends():
    user_id, error, code = require_auth()
    if error:
        return error, code

    friends = []
    for f in Friendship.query.filter_by(user_id=user_id).all():
        friend = db.session.get(User, f.friend_id)
        if not friend:
            continue

        last_msg = Message.query.filter(
            ((Message.sender_id == user_id) & (Message.receiver_id == friend.id))
            | ((Message.sender_id == friend.id) & (Message.receiver_id == user_id))
        ).order_by(Message.created_at.desc()).first()

        unread_count = Message.query.filter_by(
            sender_id=friend.id, receiver_id=user_id, is_read=False
        ).count()

        friends.append({
            **friend.to_dict(),
            "last_message": last_msg.to_dict(viewer_id=user_id) if last_msg else None,
            "unread_count": unread_count,
        })

    return jsonify({"friends": friends}), 200


@friends_bp.route("/friends/requests", methods=["GET"])
def get_friend_requests():
    user_id, error, code = require_auth()
    if error:
        return error, code

    incoming = FriendRequest.query.filter_by(receiver_id=user_id, status="pending").all()
    outgoing = FriendRequest.query.filter_by(sender_id=user_id, status="pending").all()
    return jsonify({
        "requests": [r.to_dict() for r in incoming],
        "incoming": [r.to_dict() for r in incoming],
        "outgoing": [r.to_dict() for r in outgoing],
    }), 200


@friends_bp.route("/friends/add", methods=["POST"])
def send_friend_request():
    user_id, error, code = require_auth()
    if error:
        return error, code

    data = request.get_json(silent=True) or {}
    friend = User.query.filter_by(username=data.get("username", "").strip()).first()
    if not friend:
        return jsonify({"error": "Gebruiker niet gevonden"}), 404
    if friend.id == user_id:
        return jsonify({"error": "Je kan jezelf niet toevoegen"}), 400
    if is_blocked_between(user_id, friend.id):
        return jsonify({"error": "Kan geen vriendschapsverzoek sturen"}), 403
    if are_friends(user_id, friend.id):
        return jsonify({"error": "Al bevriend"}), 409
    if FriendRequest.query.filter_by(sender_id=friend.id, receiver_id=user_id, status="pending").first():
        return jsonify({"error": "Deze persoon heeft jou al een verzoek gestuurd"}), 409
    if FriendRequest.query.filter_by(sender_id=user_id, receiver_id=friend.id, status="pending").first():
        return jsonify({"error": "Verzoek al verstuurd"}), 409

    req = FriendRequest(sender_id=user_id, receiver_id=friend.id)
    db.session.add(req)
    db.session.commit()
    notify_users("friend_request", req.to_dict(), friend.id)
    return jsonify({"message": f"Vriendschapsverzoek verstuurd naar {friend.username}!", "request": req.to_dict()}), 201


@friends_bp.route("/friends/requests/<int:request_id>/accept", methods=["POST"])
def accept_friend_request(request_id):
    user_id, error, code = require_auth()
    if error:
        return error, code

    req = db.session.get(FriendRequest, request_id)
    if not req or req.receiver_id != user_id or req.status != "pending":
        return jsonify({"error": "Verzoek niet gevonden"}), 404
    if is_blocked_between(user_id, req.sender_id):
        return jsonify({"error": "Kan dit verzoek niet accepteren"}), 403

    if not are_friends(user_id, req.sender_id):
        db.session.add(Friendship(user_id=user_id, friend_id=req.sender_id))
    if not are_friends(req.sender_id, user_id):
        db.session.add(Friendship(user_id=req.sender_id, friend_id=user_id))

    req.status = "accepted"
    db.session.commit()
    notify_users("friends_updated", {"user_id": user_id}, user_id, req.sender_id)
    return jsonify({"message": "Vriendschapsverzoek geaccepteerd!"}), 200


@friends_bp.route("/friends/requests/<int:request_id>/reject", methods=["POST"])
def reject_friend_request(request_id):
    user_id, error, code = require_auth()
    if error:
        return error, code

    req = db.session.get(FriendRequest, request_id)
    if not req or req.receiver_id != user_id:
        return jsonify({"error": "Verzoek niet gevonden"}), 404

    req.status = "rejected"
    db.session.commit()
    notify_users("friends_updated", {"user_id": user_id}, user_id, req.sender_id)
    return jsonify({"message": "Vriendschapsverzoek geweigerd"}), 200


@friends_bp.route("/users/search", methods=["GET"])
def search_users():
    user_id, error, code = require_auth()
    if error:
        return error, code

    query = request.args.get("q", "").strip()
    if len(query) < 2:
        return jsonify({"users": []}), 200

    users = User.query.filter(User.username.ilike(f"%{query}%"), User.id != user_id).limit(10).all()
    results = [{**u.to_dict(), "relation_status": get_relation_status(user_id, u.id)} for u in users]
    return jsonify({"users": results}), 200


# ── Blocking ──────────────────────────────────────────────────────────────

@friends_bp.route("/block/<int:target_id>", methods=["POST"])
def block_user(target_id):
    user_id, error, code = require_auth()
    if error:
        return error, code

    if user_id == target_id:
        return jsonify({"error": "Je kan jezelf niet blokkeren"}), 400
    if BlockedUser.query.filter_by(blocker_id=user_id, blocked_id=target_id).first():
        return jsonify({"error": "Gebruiker is al geblokkeerd"}), 409

    Friendship.query.filter(
        ((Friendship.user_id == user_id) & (Friendship.friend_id == target_id))
        | ((Friendship.user_id == target_id) & (Friendship.friend_id == user_id))
    ).delete(synchronize_session=False)

    FriendRequest.query.filter(
        ((FriendRequest.sender_id == user_id) & (FriendRequest.receiver_id == target_id))
        | ((FriendRequest.sender_id == target_id) & (FriendRequest.receiver_id == user_id))
    ).delete(synchronize_session=False)

    blocked = BlockedUser(blocker_id=user_id, blocked_id=target_id)
    db.session.add(blocked)
    db.session.commit()
    notify_users("friends_updated", {"user_id": user_id}, user_id, target_id)
    return jsonify({"message": "Gebruiker geblokkeerd", "blocked": blocked.to_dict()}), 200


@friends_bp.route("/unblock/<int:target_id>", methods=["POST"])
def unblock_user(target_id):
    user_id, error, code = require_auth()
    if error:
        return error, code

    blocked = BlockedUser.query.filter_by(blocker_id=user_id, blocked_id=target_id).first()
    if not blocked:
        return jsonify({"error": "Gebruiker is niet geblokkeerd"}), 404

    db.session.delete(blocked)
    db.session.commit()
    notify_users("friends_updated", {"user_id": user_id}, user_id, target_id)
    return jsonify({"message": "Gebruiker gedeblokkeerd"}), 200


@friends_bp.route("/blocked", methods=["GET"])
def get_blocked_users():
    user_id, error, code = require_auth()
    if error:
        return error, code

    blocked_list = BlockedUser.query.filter_by(blocker_id=user_id).all()
    return jsonify({"blocked": [b.to_dict() for b in blocked_list]}), 200
