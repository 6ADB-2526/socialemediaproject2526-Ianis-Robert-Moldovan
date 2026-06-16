# =============================================================================
# models/group.py — alles voor GROEPSCHATS. Bevat drie tabellen:
#   GroupChat        : de groep zelf (naam, maker)
#   GroupChatMember  : wie lid is van welke groep
#   GroupMessage     : berichten binnen een groep
# + twee hulpfuncties om lidmaatschap te checken.
# =============================================================================

from extensions import db
from utils.helpers import utc_now, iso_utc


class GroupChat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    creator_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)  # wie maakte de groep
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self, viewer_id: int | None = None) -> dict:
        """Zet de groep om naar JSON, inclusief de ledenlijst en het laatste bericht."""
        from models.user import User

        # Alle leden ophalen (op volgorde van wanneer ze lid werden).
        memberships = GroupChatMember.query.filter_by(group_id=self.id).order_by(
            GroupChatMember.joined_at.asc()
        ).all()
        members = [
            db.session.get(User, m.user_id).to_dict()
            for m in memberships
            if db.session.get(User, m.user_id)
        ]

        # Het meest recente bericht (voor het voorbeeld in de lijst).
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
            "is_group": True,   # zo weet de frontend dat dit een groep is, geen 1-op-1
        }


class GroupChatMember(db.Model):
    """Koppeltabel: welke gebruiker zit in welke groep."""
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("group_chat.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    joined_at = db.Column(db.DateTime, default=utc_now)

    # Uniciteitsregel: dezelfde gebruiker kan niet twee keer in dezelfde groep zitten.
    __table_args__ = (db.UniqueConstraint("group_id", "user_id", name="uq_group_member"),)


class GroupMessage(db.Model):
    """Een bericht binnen een groep (heeft group_id i.p.v. receiver_id; geen snaps)."""
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("group_chat.id"), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    text = db.Column(db.Text, nullable=True)
    is_voice = db.Column(db.Boolean, default=False)
    voice_data = db.Column(db.Text, nullable=True)
    voice_duration = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self, viewer_id: int | None = None) -> dict:
        """Zet het groepsbericht om naar JSON. De snap-velden staan op 'leeg/false'
        zodat de frontend groeps- en privéberichten op dezelfde manier kan tekenen."""
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
# Hulpfuncties rond lidmaatschap.
# ---------------------------------------------------------------------------

def is_group_member(group_id: int, user_id: int) -> bool:
    """True als deze gebruiker lid is van deze groep."""
    return GroupChatMember.query.filter_by(group_id=group_id, user_id=user_id).first() is not None


def get_group_member_ids(group_id: int) -> list[int]:
    """Geeft de lijst van user_id's van alle leden van een groep terug.
    Handig om iedereen tegelijk een realtime melding te sturen."""
    return [m.user_id for m in GroupChatMember.query.filter_by(group_id=group_id).all()]
