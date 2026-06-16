"""
socket_events.py — alle REALTIME gebeurtenissen (Socket.IO).

Hier staan de "handlers": functies die reageren wanneer de browser een event
stuurt (bv. 'ik typ', 'ik wil bellen'). Het @socketio.on("naam") erboven betekent:
"voer deze functie uit als er een event met die naam binnenkomt".

KERNIDEE: ROOMS (kamers). Je stuurt een event naar een kamer, en iedereen in
die kamer ontvangt het. Zo komt een bericht alleen bij de juiste mensen aan.
Dit bestand is de tegenhanger van frontend/javascript/app/socket.js.
"""
from flask import session
from flask_socketio import emit, join_room, leave_room

from extensions import db, socketio, online_users
from models.user import User
from models.friendship import are_friends, is_blocked_between
from models.group import is_group_member


def _user_room(user_id: int) -> str:
    """Persoonlijke kamer van één gebruiker (voor meldingen, oproepen)."""
    return f"user_{user_id}"


def _chat_room(user1: int, user2: int) -> str:
    """Gedeelde kamer voor een 1-op-1 gesprek. Id's gesorteerd zodat beide
    personen dezelfde kamernaam krijgen."""
    return f"chat_{min(user1, user2)}_{max(user1, user2)}"


def _group_room(group_id: int) -> str:
    """Kamer voor een groepschat."""
    return f"group_{group_id}"


def _safe_int(value) -> int | None:
    """Zet iets veilig om naar een int; geeft None bij ongeldige invoer."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ── Connection ────────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect():
    """Wordt uitgevoerd zodra een browser verbinding maakt.
    Zet de gebruiker online en in zijn persoonlijke kamer."""
    user_id = session.get("user_id")
    if user_id:
        online_users[user_id] = online_users.get(user_id, 0) + 1
        join_room(_user_room(user_id))
        emit("socket_ready", {"user_id": user_id})


@socketio.on("disconnect")
def on_disconnect():
    """Wordt uitgevoerd als de verbinding wegvalt. Verlaagt de online-teller."""
    user_id = session.get("user_id")
    if user_id and user_id in online_users:
        online_users[user_id] -= 1
        if online_users[user_id] <= 0:
            online_users.pop(user_id, None)   # niet meer online


# ── Chat rooms ────────────────────────────────────────────────────────────

@socketio.on("join_chat")
def on_join_chat(data):
    """Sluit je aan bij de gedeelde kamer van een 1-op-1 gesprek."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        join_room(_chat_room(user_id, friend_id))


@socketio.on("leave_chat")
def on_leave_chat(data):
    """Verlaat de kamer van een 1-op-1 gesprek (als je de chat sluit)."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        leave_room(_chat_room(user_id, friend_id))


@socketio.on("join_group_chat")
def on_join_group_chat(data):
    """Sluit je aan bij een groepskamer (alleen als je echt lid bent)."""
    user_id = session.get("user_id")
    group_id = _safe_int(data.get("group_id"))
    if user_id and group_id and is_group_member(group_id, user_id):
        join_room(_group_room(group_id))


@socketio.on("leave_group_chat")
def on_leave_group_chat(data):
    """Verlaat een groepskamer."""
    user_id = session.get("user_id")
    group_id = _safe_int(data.get("group_id"))
    if user_id and group_id and is_group_member(group_id, user_id):
        leave_room(_group_room(group_id))


# ── Typing indicators ─────────────────────────────────────────────────────

@socketio.on("typing")
def on_typing(data):
    """Stuurt 'X is aan het typen...' naar de andere persoon in een 1-op-1 chat.
    include_self=False = stuur het NIET naar jezelf terug."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if not user_id or not friend_id:
        return
    sender = db.session.get(User, user_id)
    emit("user_typing", {"username": sender.username if sender else ""}, room=_chat_room(user_id, friend_id), include_self=False)


@socketio.on("stop_typing")
def on_stop_typing(data):
    """Stuurt het signaal dat iemand gestopt is met typen."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        emit("user_stop_typing", {}, room=_chat_room(user_id, friend_id), include_self=False)


@socketio.on("group_typing")
def on_group_typing(data):
    """'X is aan het typen...' binnen een groep."""
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
    """Stop-met-typen binnen een groep."""
    user_id = session.get("user_id")
    group_id = _safe_int(data.get("group_id"))
    if user_id and group_id and is_group_member(group_id, user_id):
        emit("group_user_stop_typing", {"group_id": group_id}, room=_group_room(group_id), include_self=False)


# ── WebRTC / Calls ────────────────────────────────────────────────────────
# Bellen werkt met WebRTC. De SERVER doet alleen het "signaalverkeer": hij geeft
# berichten door tussen de twee bellers zodat ze rechtstreeks verbinding kunnen
# maken. De audio/video zelf gaat niet via de server.

@socketio.on("start_call")
def on_start_call(data):
    """Iemand wil bellen. Controleer of het mag en of de vriend online is,
    en stuur dan een 'incoming_call' naar die vriend."""
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
    """De vriend neemt op -> laat de beller weten dat er opgenomen is."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        emit("call_answered", {"from_user_id": user_id}, room=_user_room(friend_id))


@socketio.on("end_call")
def on_end_call(data):
    """Gesprek beëindigen -> laat de andere kant weten dat het stopt."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        emit("call_ended", {"from_user_id": user_id}, room=_user_room(friend_id))


@socketio.on("decline_call")
def on_decline_call(data):
    """Oproep weigeren."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    if user_id and friend_id:
        emit("call_declined", {"from_user_id": user_id}, room=_user_room(friend_id))


@socketio.on("webrtc_offer")
def on_webrtc_offer(data):
    """WebRTC-'offer' doorgeven: het eerste verbindingsvoorstel van de beller."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    offer = data.get("offer")
    if user_id and friend_id and offer:
        emit("webrtc_offer", {"from_user_id": user_id, "offer": offer, "type": data.get("type", "audio")}, room=_user_room(friend_id))


@socketio.on("webrtc_answer")
def on_webrtc_answer(data):
    """WebRTC-'answer' doorgeven: het antwoord van de opgebelde."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    answer = data.get("answer")
    if user_id and friend_id and answer:
        emit("webrtc_answer", {"from_user_id": user_id, "answer": answer}, room=_user_room(friend_id))


@socketio.on("webrtc_ice_candidate")
def on_webrtc_ice_candidate(data):
    """ICE-'candidate' doorgeven: een mogelijke verbindingsroute tussen de twee
    bellers. Ze sturen er meerdere tot er één werkt."""
    user_id = session.get("user_id")
    friend_id = _safe_int(data.get("friend_id"))
    candidate = data.get("candidate")
    if user_id and friend_id and candidate:
        emit("webrtc_ice_candidate", {"from_user_id": user_id, "candidate": candidate}, room=_user_room(friend_id))
