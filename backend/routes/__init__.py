from .auth import auth_bp
from .friends import friends_bp
from .messages import messages_bp
from .groups import groups_bp
from .stories import stories_bp

__all__ = ["auth_bp", "friends_bp", "messages_bp", "groups_bp", "stories_bp"]
