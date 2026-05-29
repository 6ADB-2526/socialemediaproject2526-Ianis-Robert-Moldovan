from extensions import db
from utils.helpers import utc_now, iso_utc


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    text = db.Column(db.Text, nullable=True)
    is_snap = db.Column(db.Boolean, default=False)
    snap_data = db.Column(db.Text, nullable=True)
    snap_open_count = db.Column(db.Integer, default=0)
    snap_saved = db.Column(db.Boolean, default=False)
    is_voice = db.Column(db.Boolean, default=False)
    voice_data = db.Column(db.Text, nullable=True)
    voice_duration = db.Column(db.Integer, nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self, viewer_id: int | None = None, include_snap_data: bool = False) -> dict:
        from models.user import User

        sender = db.session.get(User, self.sender_id)
        snap_status = None
        can_open_snap = False

        if self.is_snap:
            if self.snap_saved:
                snap_status = "saved"
                can_open_snap = True
            elif viewer_id == self.sender_id:
                snap_status = "sent"
            elif self.snap_open_count == 0:
                snap_status = "new"
                can_open_snap = viewer_id == self.receiver_id
            elif self.snap_open_count == 1:
                snap_status = "replay"
                can_open_snap = viewer_id == self.receiver_id
            else:
                snap_status = "expired"

        return {
            "id": self.id,
            "sender_id": self.sender_id,
            "sender_username": sender.username if sender else "Unknown",
            "receiver_id": self.receiver_id,
            "text": self.text,
            "is_snap": self.is_snap,
            "snap_data": self.snap_data if (self.is_snap and (include_snap_data or self.snap_saved)) else None,
            "snap_open_count": self.snap_open_count,
            "snap_saved": self.snap_saved,
            "snap_status": snap_status,
            "can_open_snap": can_open_snap,
            "is_voice": self.is_voice,
            "voice_data": self.voice_data,
            "voice_duration": self.voice_duration,
            "is_read": self.is_read,
            "created_at": iso_utc(self.created_at),
        }
