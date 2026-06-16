# =============================================================================
# models/friendship.py — alles rond vriendschappen.
# Bevat DRIE tabellen + een paar hulpfuncties die overal gebruikt worden om te
# checken of een actie mag (zijn ze vrienden? geblokkeerd?).
# =============================================================================

from extensions import db
from utils.helpers import utc_now, iso_utc


class FriendRequest(db.Model):
    """Een verstuurd vriendschapsverzoek (nog niet bevestigd)."""
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)   # wie stuurt
    receiver_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False) # naar wie
    status = db.Column(db.String(20), default="pending")  # pending / accepted / rejected
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self) -> dict:
        """Zet het verzoek om naar JSON, met de volledige gegevens van zender en ontvanger."""
        from models.user import User  # lokale import om circulaire import te vermijden

        sender = db.session.get(User, self.sender_id)
        receiver = db.session.get(User, self.receiver_id)
        return {
            "id": self.id,
            "sender": sender.to_dict() if sender else None,
            "receiver": receiver.to_dict() if receiver else None,
            "status": self.status,
            "created_at": iso_utc(self.created_at),
        }


class Friendship(db.Model):
    """Een bevestigde vriendschap. Wordt in BEIDE richtingen opgeslagen
    (A->B én B->A) zodat opzoeken eenvoudig is."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    friend_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)


class BlockedUser(db.Model):
    """Houdt bij wie wie geblokkeerd heeft."""
    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)  # wie blokkeert
    blocked_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)  # wie geblokkeerd is
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self) -> dict:
        from models.user import User

        blocked = db.session.get(User, self.blocked_id)
        return {
            "id": self.id,
            "blocked_user": blocked.to_dict() if blocked else None,
            "created_at": iso_utc(self.created_at),
        }


# ---------------------------------------------------------------------------
# Hulpfuncties die door veel routes gebruikt worden om relaties te checken.
# ---------------------------------------------------------------------------

def are_friends(user_id: int, friend_id: int) -> bool:
    """True als user_id deze friend_id als vriend heeft."""
    return Friendship.query.filter_by(user_id=user_id, friend_id=friend_id).first() is not None


def is_blocked_between(user_id: int, other_id: int) -> bool:
    """True als één van de twee de ander geblokkeerd heeft (in welke richting dan ook)."""
    return BlockedUser.query.filter(
        ((BlockedUser.blocker_id == user_id) & (BlockedUser.blocked_id == other_id))
        | ((BlockedUser.blocker_id == other_id) & (BlockedUser.blocked_id == user_id))
    ).first() is not None


def get_relation_status(user_id: int, other_id: int) -> str:
    """Geeft de relatie tussen twee gebruikers terug als tekst.

    Mogelijke waarden: 'friends', 'blocked', 'request_sent', 'request_received',
    of 'none'. De frontend gebruikt dit om de juiste knop te tonen
    (bv. 'Chat', 'Accepteer', 'Verzoek').
    """
    if are_friends(user_id, other_id):
        return "friends"
    if is_blocked_between(user_id, other_id):
        return "blocked"
    if FriendRequest.query.filter_by(
        sender_id=user_id, receiver_id=other_id, status="pending"
    ).first():
        return "request_sent"
    if FriendRequest.query.filter_by(
        sender_id=other_id, receiver_id=user_id, status="pending"
    ).first():
        return "request_received"
    return "none"
