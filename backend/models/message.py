# =============================================================================
# models/message.py — tabel voor PRIVÉberichten tussen twee personen.
# Eén Message kan gewone tekst zijn, een SNAP (verdwijnende foto) of een
# VOICE-bericht. De slimme snap-logica zit in to_dict().
# =============================================================================

from extensions import db
from utils.helpers import utc_now, iso_utc


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    text = db.Column(db.Text, nullable=True)              # gewone tekst (indien geen snap/voice)
    # Snap-velden:
    is_snap = db.Column(db.Boolean, default=False)
    snap_data = db.Column(db.Text, nullable=True)         # de foto als data-URL
    snap_open_count = db.Column(db.Integer, default=0)    # hoe vaak geopend (0/1/2+)
    snap_saved = db.Column(db.Boolean, default=False)     # permanent bewaard?
    # Voice-velden:
    is_voice = db.Column(db.Boolean, default=False)
    voice_data = db.Column(db.Text, nullable=True)        # audio als data-URL
    voice_duration = db.Column(db.Integer, nullable=True) # duur in seconden
    is_read = db.Column(db.Boolean, default=False)        # gelezen? (voor ongelezen-teller)
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self, viewer_id: int | None = None, include_snap_data: bool = False) -> dict:
        """Zet het bericht om naar JSON, AANGEPAST aan wie het bekijkt (viewer_id).

        Het belangrijkste hier is de SNAP-STATUS. Een snap mag je 1x bekijken en
        daarna nog 1x 'replay', dan is hij verlopen:
          - saved   : permanent bewaard -> altijd te zien
          - sent    : jij bent de verzender -> je ziet alleen de status
          - new     : 0x geopend -> ontvanger mag openen
          - replay  : 1x geopend -> ontvanger mag nog 1x openen
          - expired : 2x of meer -> niet meer te openen
        De echte foto (snap_data) sturen we alleen mee als het mag.
        """
        from models.user import User

        sender = db.session.get(User, self.sender_id)
        snap_status = None
        can_open_snap = False

        if self.is_snap:
            if self.snap_saved:
                snap_status = "saved"
                can_open_snap = True
            elif viewer_id == self.sender_id:
                # De verzender ziet enkel "verstuurd", niet de foto opnieuw.
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
            # Foto alleen meesturen als het expliciet mag of als de snap bewaard is:
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
