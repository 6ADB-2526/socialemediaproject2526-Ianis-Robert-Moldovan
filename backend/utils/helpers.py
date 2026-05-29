import json
import os
import socket
from datetime import datetime, timezone


def iso_utc(value: datetime | None) -> str | None:
    """Return an ISO-8601 UTC string (e.g. '2024-01-01T00:00:00Z') or None."""
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def utc_now() -> datetime:
    """Return a naive UTC datetime (compatible with SQLite storage)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_lan_ip() -> str:
    """Best-effort LAN IP detection."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def get_ice_servers() -> list[dict]:
    """Return ICE server list from env or sensible defaults."""
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
