# =============================================================================
# extensions.py
# -----------------------------------------------------------------------------
# Hier maken we de gedeelde "gereedschappen" aan die de hele backend gebruikt.
# Ze worden hier LEEG aangemaakt en pas later in app.py aan de Flask-app
# gekoppeld (met db.init_app(app), enz.). Dat doen we apart om CIRCULAIRE
# IMPORTS te vermijden: modellen hebben 'db' nodig, en app.py heeft de modellen
# nodig -> als 'db' in app.py zou staan, krijg je een kringetje van imports.
# =============================================================================

from flask_sqlalchemy import SQLAlchemy   # database (data opslaan/ophalen)
from flask_bcrypt import Bcrypt           # wachtwoorden veilig hashen
from flask_cors import CORS               # toestaan dat de frontend de API mag aanroepen
from flask_socketio import SocketIO       # realtime communicatie (live chat, bellen)

# Deze objecten zijn nu nog "leeg". In app.py worden ze aan de app gekoppeld.
db = SQLAlchemy()
bcrypt = Bcrypt()
socketio = SocketIO()

# Houdt bij wie er nu online is: user_id -> aantal actieve verbindingen.
# (Iemand kan in meerdere tabbladen open staan, vandaar een teller.)
online_users: dict[int, int] = {}
