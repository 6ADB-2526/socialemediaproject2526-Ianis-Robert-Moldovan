"""Socket.IO event handlers — registered on the socketio instance from extensions.py."""
from flask import session
from flask_socketio import emit, join_room, leave_room

from extensions import db, socketio, online_users
from models.user import User
from models.friendship import are_friends, is_blocked_between
from models.group import is_group_member


def _user_room(user_id: int) -> str:
    return f"user_{user_id}"


def _chat_room(user1: int, user2: int) -> str:
    return f"chat_{min(user1, user2)}_{max(user1, user2)}"


def _group_room(group_id: int) -> str:
    return f"group_{group_id}"


def _safe_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ── Connection ────────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect():
    user_id = session.get("user_id")
    if user_id:
        online_users[user_id] = online_users.get(user_id, 0) + 1
        join_room(_user_room(user_id))
        emit("socket_ready", {"user_id": user_id})


@socketio.on("disconnect")
def on_disconnect():
    user_id = session.get("user_id")
    if user_id and user_id in online_users:
        online_users[user_id] -= 1
        if online_users[user_id] <= 0:
            online_users.pop(user_id, None)


# ── Chat rooms ────────────────────────────────────────────────────────────

@socketio.on("join_chat")
def on_join_chat(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        join_room(_chat_room(user_id, friend_id))


@socketio.on("leave_chat")
def on_leave_chat(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        leave_room(_chat_room(user_id, friend_id))


@socketio.on("join_group_chat")
def on_join_group_chat(data):
    user_id = session.get("user_id")
    group_id = _safe_int(data.get("group_id"))
    if user_id and group_id and is_group_member(group_id, user_id):
        join_room(_group_room(group_id))


@socketio.on("leave_group_chat")
def on_leave_group_chat(data):
    user_id = session.get("user_id")
    group_id = _safe_int(data.get("group_id"))
    if user_id and group_id and is_group_member(group_id, user_id):
        leave_room(_group_room(group_id))


# ── Typing indicators ─────────────────────────────────────────────────────

@socketio.on("typing")
def on_typing(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if not user_id or not friend_id:
        return
    sender = db.session.get(User, user_id)
    emit("user_typing", {"username": sender.username if sender else ""}, room=_chat_room(user_id, friend_id), include_self=False)


@socketio.on("stop_typing")
def on_stop_typing(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        emit("user_stop_typing", {}, room=_chat_room(user_id, friend_id), include_self=False)


@socketio.on("group_typing")
def on_group_typing(data):
    user_id = session.get("user_id")
    group_id = _safe_int(data.get("group_id"))
    if not user_id or not group_id or not is_group_member(group_id, user_id):
        return
    sender = db.session.get(User, user_id)
    emit(
        {"group_id": group_id, "username": sender.username if sender else ""},
        room=_group_room(group_id),
        include_self=False,
    )


@socketio.on("group_stop_typing")
def on_group_stop_typing(data):
    user_id = session.get("user_id")
    group_id = _safe_int(data.get("group_id"))
    if user_id and group_id and is_group_member(group_id, user_id):
        emit("group_user_stop_typing", {"group_id": group_id}, room=_group_room(group_id), include_self=False)


# ── WebRTC / Calls ────────────────────────────────────────────────────────

@socketio.on("start_call")
def on_start_call(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    call_type = data.get("type", "voice")

    if not user_id:
        emit("call_unavailable", {"message": "Je bent niet ingelogd."})
        return
    if not friend_id:
        emit("call_unavailable", {"message": "Ongeldige ontvanger."})
        return
    if not are_friends(user_id, friend_id) or is_blocked_between(user_id, friend_id):
        emit("call_unavailable", {"message": "Je kan deze gebruiker niet bellen."})
        return
    if friend_id not in online_users:
        emit("call_unavailable", {"message": "Deze vriend is momenteel niet online."})
        return

    caller = db.session.get(User, user_id)
    emit("incoming_call", {
        "caller": caller.to_dict() if caller else None,
        "from_user_id": user_id,
        "type": call_type,
    }, room=_user_room(friend_id))


@socketio.on("answer_call")
def on_answer_call(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        emit("call_answered", {"from_user_id": user_id}, room=_user_room(friend_id))


@socketio.on("end_call")
def on_end_call(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        emit("call_ended", {"from_user_id": user_id}, room=_user_room(friend_id))


@socketio.on("decline_call")
def on_decline_call(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        emit("call_declined", {"from_user_id": user_id}, room=_user_room(friend_id))


@socketio.on("webrtc_offer")
def on_webrtc_offer(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    offer = data.get("offer")
    if user_id and friend_id and offer:
        emit("webrtc_offer", {"from_user_id": user_id, "offer": offer, "type": data.get("type", "audio")}, room=_user_room(friend_id))


@socketio.on("webrtc_answer")
def on_webrtc_answer(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    answer = data.get("answer")
    if user_id and friend_id and answer:
        emit("webrtc_answer", {"from_user_id": user_id, "answer": answer}, room=_user_room(friend_id))


@socketio.on("webrtc_ice_candidate")
def on_webrtc_ice_candidate(data):
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    candidate = data.get("candidate")
    if user_id and friend_id and candidate:
        emit("webrtc_ice_candidate", {"from_user_id": user_id, "candidate": candidate}, room=_user_room(friend_id))
