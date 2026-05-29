from extensions import db
from utils.helpers import utc_now


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    avatar_seed = db.Column(db.String(50), nullable=False)
    avatar_url = db.Column(db.String(500), nullable=True)
    avatar_file = db.Column(db.Text, nullable=True)
    dark_mode = db.Column(db.Boolean, default=False)
    theme_color = db.Column(db.String(20), default="purple")
    created_at = db.Column(db.DateTime, default=utc_now)

    def get_avatar(self) -> str:
        if self.avatar_file:
            return self.avatar_file
        if self.avatar_url:
            return self.avatar_url
        return f"https://api.dicebear.com/7.x/avataaars/svg?seed={self.avatar_seed}"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "avatar": self.get_avatar(),
            "dark_mode": self.dark_mode,
            "theme_color": self.theme_color,
        }
