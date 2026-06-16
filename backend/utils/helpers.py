# =============================================================================
# utils/helpers.py — algemene kleine hulpfuncties (tijd, netwerk, bel-servers).
# =============================================================================

import json
import os
import socket
from datetime import datetime, timezone


def iso_utc(value: datetime | None) -> str | None:
    """Zet een datum om naar een nette ISO-tekst in UTC (bv. '2024-01-01T00:00:00Z').

    De frontend kan zo'n tekst makkelijk verwerken. Geeft None terug bij een lege waarde.
    """
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def utc_now() -> datetime:
    """Geeft de huidige tijd in UTC terug (zonder tijdzone-info, past bij SQLite)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_lan_ip() -> str:
    """Zoekt het lokale netwerk-IP van deze computer.

    Truc: we 'verbinden' met 8.8.8.8 (zonder echt data te sturen) en vragen
    welk lokaal adres daarvoor gebruikt zou worden. Lukt dat niet -> 127.0.0.1.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def get_ice_servers() -> list[dict]:
    """Geeft de ICE-servers terug die nodig zijn om te bellen (WebRTC).

    ICE/STUN-servers helpen twee browsers elkaar te 'vinden' op het internet.
    We lezen ze uit een omgevingsvariabele, of gebruiken gratis standaardservers.
    """
    raw = os.environ.get("ICE_SERVERS_JSON", "").strip()
    if raw:
        try:
            servers = json.loads(raw)
            if isinstance(servers, list):
                return servers
        except json.JSONDecodeError:
            pass
    return [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:global.stun.twilio.com:3478"},
    ]
