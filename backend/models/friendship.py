from extensions import db
from utils.helpers import utc_now, iso_utc


class FriendRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    status = db.Column(db.String(20), default="pending")
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self) -> dict:
        from models.user import User

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
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    friend_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)


class BlockedUser(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
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
# Relationship query helpers (used across routes)
# ---------------------------------------------------------------------------

def are_friends(user_id: int, friend_id: int) -> bool:
    return Friendship.query.filter_by(user_id=user_id, friend_id=friend_id).first() is not None


def is_blocked_between(user_id: int, other_id: int) -> bool:
    return BlockedUser.query.filter(
        ((BlockedUser.blocker_id == user_id) & (BlockedUser.blocked_id == other_id))
        | ((BlockedUser.blocker_id == other_id) & (BlockedUser.blocked_id == user_id))
    ).first() is not None


def get_relation_status(user_id: int, other_id: int) -> str:
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
