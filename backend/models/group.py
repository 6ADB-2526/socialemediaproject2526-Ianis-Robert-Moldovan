from extensions import db
from utils.helpers import utc_now, iso_utc


class GroupChat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    creator_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self, viewer_id: int | None = None) -> dict:
        from models.user import User

        memberships = GroupChatMember.query.filter_by(group_id=self.id).order_by(
            GroupChatMember.joined_at.asc()
        ).all()
        members = [
            db.session.get(User, m.user_id).to_dict()
            for m in memberships
            if db.session.get(User, m.user_id)
        ]

        last_message = (
            GroupMessage.query.filter_by(group_id=self.id)
            .order_by(GroupMessage.created_at.desc())
            .first()
        )

        return {
            "id": self.id,
            "name": self.name,
            "creator_id": self.creator_id,
            "members": members,
            "member_count": len(members),
            "last_message": last_message.to_dict(viewer_id=viewer_id) if last_message else None,
            "unread_count": 0,
            "created_at": iso_utc(self.created_at),
            "is_group": True,
        }


class GroupChatMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("group_chat.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    joined_at = db.Column(db.DateTime, default=utc_now)

    __table_args__ = (db.UniqueConstraint("group_id", "user_id", name="uq_group_member"),)


class GroupMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("group_chat.id"), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    text = db.Column(db.Text, nullable=True)
    is_voice = db.Column(db.Boolean, default=False)
    voice_data = db.Column(db.Text, nullable=True)
    voice_duration = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self, viewer_id: int | None = None) -> dict:
        from models.user import User

        sender = db.session.get(User, self.sender_id)
        group = db.session.get(GroupChat, self.group_id)
        return {
            "id": self.id,
            "group_id": self.group_id,
            "group_name": group.name if group else "Groep",
            "sender_id": self.sender_id,
            "sender_username": sender.username if sender else "Unknown",
            "receiver_id": None,
            "text": self.text,
            "is_snap": False,
            "snap_data": None,
            "snap_open_count": 0,
            "snap_saved": False,
            "snap_status": None,
            "can_open_snap": False,
            "is_voice": self.is_voice,
            "voice_data": self.voice_data,
            "voice_duration": self.voice_duration,
            "is_read": True,
            "created_at": iso_utc(self.created_at),
        }


# ---------------------------------------------------------------------------
# Group membership helpers
# ---------------------------------------------------------------------------

def is_group_member(group_id: int, user_id: int) -> bool:
    return GroupChatMember.query.filter_by(group_id=group_id, user_id=user_id).first() is not None


def get_group_member_ids(group_id: int) -> list[int]:
    return [m.user_id for m in GroupChatMember.query.filter_by(group_id=group_id).all()]
