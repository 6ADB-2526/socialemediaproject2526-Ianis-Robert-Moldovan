# =============================================================================
# models/__init__.py — "inhoudsopgave" van de models-map.
# -----------------------------------------------------------------------------
# Door alle modellen hier te importeren kan je elders kort schrijven:
#     from models import User, Message
# in plaats van het volledige pad. Het zorgt er ook voor dat SQLAlchemy alle
# tabellen "kent" wanneer create_all() draait.
# =============================================================================

from .user import User
from .friendship import FriendRequest, Friendship, BlockedUser
from .message import Message
from .group import GroupChat, GroupChatMember, GroupMessage
from .story import Story

# __all__ bepaalt wat er geïmporteerd wordt bij 'from models import *'.
__all__ = [
    "User",
    "FriendRequest",
    "Friendship",
    "BlockedUser",
    "Message",
    "GroupChat",
    "GroupChatMember",
    "GroupMessage",
    "Story",
]
