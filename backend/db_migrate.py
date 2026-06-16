"""
db_migrate.py — Database-structuur klaarmaken en bijwerken.

Probleem dat dit oplost: als je later een nieuwe kolom toevoegt aan een model,
heeft een BESTAANDE database die kolom nog niet. Dit bestand voegt ontbrekende
kolommen toe ZONDER bestaande data te wissen.

Het woord "idempotent" betekent: je mag dit 100x draaien, het resultaat blijft
hetzelfde (er wordt nooit iets dubbel toegevoegd).
"""
from datetime import timedelta
from sqlalchemy import inspect
from sqlalchemy import text as sql_text

from extensions import db
from utils.helpers import utc_now


# Per tabel: welke kolommen er (mogelijk) toegevoegd moeten worden, met hun type.
# Deze lijst gebruiken we om te vergelijken met wat al in de database zit.
_COLUMN_DEFINITIONS: dict[str, dict[str, str]] = {
    "user": {
        "avatar_seed": "VARCHAR(50)",
        "avatar_url": "VARCHAR(500)",
        "avatar_file": "TEXT",
        "dark_mode": "BOOLEAN DEFAULT 0",
        "theme_color": "VARCHAR(20) DEFAULT 'purple'",
        "created_at": "DATETIME",
    },
    "friend_request": {
        "status": "VARCHAR(20) DEFAULT 'pending'",
        "created_at": "DATETIME",
    },
    "friendship": {"created_at": "DATETIME"},
    "blocked_user": {"created_at": "DATETIME"},
    "message": {
        "is_snap": "BOOLEAN DEFAULT 0",
        "snap_data": "TEXT",
        "snap_open_count": "INTEGER DEFAULT 0",
        "snap_saved": "BOOLEAN DEFAULT 0",
        "is_voice": "BOOLEAN DEFAULT 0",
        "voice_data": "TEXT",
        "voice_duration": "INTEGER",
        "is_read": "BOOLEAN DEFAULT 0",
        "created_at": "DATETIME",
    },
    "story": {"created_at": "DATETIME", "expires_at": "DATETIME"},
}


def _add_missing_columns():
    """Voeg kolommen toe die in de database nog ontbreken.

    We vragen aan de database (via 'inspector') welke tabellen en kolommen er al
    zijn, en voegen met ALTER TABLE alleen toe wat ontbreekt.
    """
    inspector = inspect(db.engine)
    existing_tables = set(inspector.get_table_names())

    for table, columns in _COLUMN_DEFINITIONS.items():
        if table not in existing_tables:
            continue  # tabel bestaat nog niet -> create_all() maakt ze later
        existing_cols = {col["name"] for col in inspector.get_columns(table)}
        for col_name, col_sql in columns.items():
            if col_name not in existing_cols:
                # Voeg de ontbrekende kolom toe.
                db.session.execute(sql_text(f'ALTER TABLE "{table}" ADD COLUMN "{col_name}" {col_sql}'))


def _backfill_nulls():
    """Vul zinnige standaardwaarden in voor velden die nog leeg (NULL) zijn.

    Bijvoorbeeld: oude gebruikers zonder thema krijgen 'purple', oude berichten
    krijgen een aanmaakdatum, stories krijgen een verloopdatum (+24u), enz.
    """
    now = utc_now()
    statements = [
        ('UPDATE "user" SET avatar_seed = username WHERE avatar_seed IS NULL', {}),
        ('UPDATE "user" SET dark_mode = 0 WHERE dark_mode IS NULL', {}),
        ('UPDATE "user" SET theme_color = :t WHERE theme_color IS NULL', {"t": "purple"}),
        ('UPDATE "user" SET created_at = :n WHERE created_at IS NULL', {"n": now}),
        ('UPDATE "friend_request" SET status = :s WHERE status IS NULL', {"s": "pending"}),
        ('UPDATE "friend_request" SET created_at = :n WHERE created_at IS NULL', {"n": now}),
        ('UPDATE "friendship" SET created_at = :n WHERE created_at IS NULL', {"n": now}),
        ('UPDATE "blocked_user" SET created_at = :n WHERE created_at IS NULL', {"n": now}),
        ('UPDATE "message" SET is_snap = 0 WHERE is_snap IS NULL', {}),
        ('UPDATE "message" SET snap_open_count = 0 WHERE snap_open_count IS NULL', {}),
        ('UPDATE "message" SET snap_saved = 0 WHERE snap_saved IS NULL', {}),
        ('UPDATE "message" SET is_voice = 0 WHERE is_voice IS NULL', {}),
        ('UPDATE "message" SET is_read = 0 WHERE is_read IS NULL', {}),
        ('UPDATE "message" SET created_at = :n WHERE created_at IS NULL', {"n": now}),
        ('UPDATE "story" SET created_at = :n WHERE created_at IS NULL', {"n": now}),
        ('UPDATE "story" SET expires_at = :e WHERE expires_at IS NULL', {"e": now + timedelta(hours=24)}),
    ]

    for stmt, params in statements:
        try:
            db.session.execute(sql_text(stmt), params)
        except Exception:
            # Als een UPDATE faalt (bv. tabel bestaat nog niet), gewoon negeren.
            db.session.rollback()


def ensure_schema():
    """Maak de tabellen aan + breng een bestaande database naar de huidige vorm.

    Wordt aangeroepen vanuit app.py bij het opstarten. Drie stappen:
      1) create_all(): maak ontbrekende tabellen aan.
      2) voeg ontbrekende kolommen toe.
      3) vul lege velden met standaardwaarden.
    """
    db.create_all()
    _add_missing_columns()
    _backfill_nulls()
    db.session.commit()
