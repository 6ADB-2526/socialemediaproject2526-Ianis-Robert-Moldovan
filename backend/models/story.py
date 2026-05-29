from extensions import db
from utils.helpers import utc_now, iso_utc


class Story(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    image_data = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    expires_at = db.Column(db.DateTime, nullable=False)

    def to_dict(self) -> dict:
        from models.user import User

        user = db.session.get(User, self.user_id)
        return {
            "id": self.id,
            "user_id": self.user_id,
            "username": user.username if user else "Unknown",
            "avatar": user.get_avatar() if user else "",
            "image_data": self.image_data,
            "created_at": iso_utc(self.created_at),
            "expires_at": iso_utc(self.expires_at),
        }
