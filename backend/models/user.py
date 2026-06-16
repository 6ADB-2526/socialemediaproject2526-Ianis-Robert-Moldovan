# =============================================================================
# models/user.py — de tabel met alle gebruikers (accounts).
# Een "model" is een Python-klasse die één databasetabel beschrijft.
# Elk db.Column is een kolom in de tabel.
# =============================================================================

from extensions import db
from utils.helpers import utc_now


class User(db.Model):
    # Elke regel hieronder = één kolom in de tabel 'user'.
    id = db.Column(db.Integer, primary_key=True)                  # uniek nummer per gebruiker
    username = db.Column(db.String(50), unique=True, nullable=False)   # moet uniek zijn
    email = db.Column(db.String(120), unique=True, nullable=False)     # moet uniek zijn
    password_hash = db.Column(db.String(255), nullable=False)    # GEHASHT wachtwoord (nooit het echte!)
    avatar_seed = db.Column(db.String(50), nullable=False)       # basis voor automatische avatar
    avatar_url = db.Column(db.String(500), nullable=True)        # avatar via een link
    avatar_file = db.Column(db.Text, nullable=True)              # geüploade avatar (als data-URL)
    dark_mode = db.Column(db.Boolean, default=False)             # voorkeur dark mode
    theme_color = db.Column(db.String(20), default="purple")     # gekozen themakleur
    created_at = db.Column(db.DateTime, default=utc_now)         # wanneer aangemaakt

    def get_avatar(self) -> str:
        """Bepaalt welke profielfoto getoond wordt.

        Volgorde: een geüpload bestand > een opgegeven URL > anders een
        automatisch gegenereerde DiceBear-avatar op basis van avatar_seed.
        """
        if self.avatar_file:
            return self.avatar_file
        if self.avatar_url:
            return self.avatar_url
        return f"https://api.dicebear.com/7.x/avataaars/svg?seed={self.avatar_seed}"

    def to_dict(self) -> dict:
        """Zet deze gebruiker om naar een veilige dictionary (voor JSON).

        BELANGRIJK: het wachtwoord(hash) wordt hier NOOIT meegestuurd.
        """
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "avatar": self.get_avatar(),
            "dark_mode": self.dark_mode,
            "theme_color": self.theme_color,
        }
