<!-- @format -->

# 👻 Snapchat Clone

Een Snapchat-kloon gebouwd als schoolproject: een sociale-media-app met realtime
chat, verdwijnende snaps, stories, groepschats en spraakberichten.

> **Gemaakt door:** Ianis-Robert Moldovan
> **Backend:** Python (Flask + Socket.IO) · **Frontend:** vanilla JavaScript (ES-modules)

---

## 📋 Inhoud

- [Wat kan de app?](#-wat-kan-de-app)
- [Gebruikte technologie](#-gebruikte-technologie)
- [Snel starten](#-snel-starten)
- [Hoe werkt het? (architectuur)](#-hoe-werkt-het-architectuur)
- [Projectstructuur](#-projectstructuur)
- [Belangrijk om te weten](#-belangrijk-om-te-weten)

---

## ✨ Wat kan de app?

| Functie | Uitleg |
|---|---|
| 🔐 **Accounts** | Registreren en inloggen, met veilig gehashte wachtwoorden (bcrypt). |
| 💬 **Chatten** | Realtime 1-op-1 berichten, met "is aan het typen…"-indicator. |
| 👻 **Snaps** | Verdwijnende foto's: 1× bekijken + 1× replay, daarna weg (of bewaren). |
| 📖 **Stories** | Foto's die na 24 uur automatisch verdwijnen. |
| 👥 **Groepschats** | Chatten met meerdere vrienden tegelijk. |
| 🎙️ **Spraakberichten** | Audio opnemen en versturen (1-op-1 en in groepen). |
| 🤝 **Vrienden** | Zoeken, vriendschapsverzoeken sturen/accepteren, blokkeren. |
| 🎨 **Personalisatie** | Eigen avatar, dark mode en themakleur. |
| 📞 **Bellen** | Een (vereenvoudigde) bel-interface. |

---

## 🛠 Gebruikte technologie

**Backend**
- **Python 3.10+**
- **Flask** — de webserver en de API
- **Flask-SocketIO** — realtime communicatie (live chat, typen, bellen)
- **Flask-SQLAlchemy** — database (SQLite)
- **Flask-Bcrypt** — wachtwoorden veilig hashen

**Frontend**
- **HTML / CSS** — opbouw en opmaak
- **JavaScript (ES-modules)** — alle logica, zonder framework
- **Socket.IO client** — de realtime-tegenhanger van de backend

---

## 🚀 Snel starten

### Vereisten
- Python 3.10 of nieuwer
- Een moderne browser (Chrome, Firefox, Edge)

### Stap 1 — Dependencies installeren

```bash
cd backend
pip install -r requirements.txt
```

### Stap 2 — De server starten

```bash
python app.py
```

Je zou dit moeten zien:

```
Database klaar.
Open op deze pc:    http://127.0.0.1:5000
Zelfde wifi:        http://192.168.x.x:5000
```

### Stap 3 — Openen
Open **http://127.0.0.1:5000** in je browser, maak een account aan en je kan beginnen. 🎉

> 💡 **Tip:** wil je vanaf je gsm testen op hetzelfde wifi-netwerk? Gebruik dan
> het "Zelfde wifi"-adres. Camera en microfoon werken enkel via `localhost` of
> een HTTPS-verbinding (een beveiligingsregel van de browser).

---

## 🧠 Hoe werkt het? (architectuur)

De app bestaat uit twee delen die met elkaar praten:

```
┌──────────────┐     HTTP (fetch / JSON)      ┌──────────────┐
│              │ ───────────────────────────> │              │
│   FRONTEND   │                              │   BACKEND    │
│  (browser)   │     Socket.IO (realtime)     │   (Flask)    │
│              │ <──────────────────────────> │              │
└──────────────┘                              └──────┬───────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │   SQLite db  │
                                              └──────────────┘
```

1. **Gewone aanvragen** (inloggen, bericht sturen, vrienden ophalen…) gaan via
   `fetch()` naar de **API-routes** (alles onder `/api`). De backend antwoordt met JSON.
2. **Realtime gebeurtenissen** (een nieuw bericht dat binnenkomt, "X is aan het
   typen…", een inkomende oproep) gaan via **Socket.IO**.

### De reis van een chatbericht
1. Je typt een bericht en klikt op versturen → `chat.js` roept de API aan.
2. De route in `routes/messages.py` slaat het bericht op in de database.
3. De server stuurt via Socket.IO een `new_message`-event naar de juiste **room**.
4. De browser van de ontvanger vangt dat event op (`socket.js`) en toont het bericht — zonder de pagina te verversen.

### Rooms (kamers)
Socket.IO gebruikt "rooms" om berichten bij de juiste mensen te krijgen:
- `user_<id>` — persoonlijke kamer (meldingen, oproepen)
- `chat_<a>_<b>` — een 1-op-1 gesprek (de id's worden gesorteerd zodat beide kanten dezelfde naam krijgen)
- `group_<id>` — een groepschat

---

## 📁 Projectstructuur

```
snapchat-project/
├── backend/
│   ├── app.py              # 🚀 Startpunt — dit bestand draai je
│   ├── extensions.py       # Gedeelde objecten (db, bcrypt, socketio)
│   ├── db_migrate.py       # Database klaarmaken/bijwerken
│   ├── socket_events.py    # Alle realtime (Socket.IO) gebeurtenissen
│   ├── requirements.txt    # Python-dependencies
│   ├── models/             # De databasetabellen
│   │   ├── user.py             # Gebruikers
│   │   ├── friendship.py       # Verzoeken, vriendschappen, blokkeringen
│   │   ├── message.py          # Privéberichten + snap-logica
│   │   ├── group.py            # Groepen, leden, groepsberichten
│   │   └── story.py            # Stories (24u)
│   ├── routes/             # De API (alles onder /api)
│   │   ├── auth.py             # Registreren, inloggen, profiel
│   │   ├── friends.py          # Vrienden zoeken/toevoegen, blokkeren
│   │   ├── messages.py         # Berichten, snaps openen/bewaren
│   │   ├── groups.py           # Groepschats
│   │   └── stories.py          # Stories
│   └── utils/              # Hulpfuncties
│       ├── auth.py             # require_auth(), notify_users()
│       └── helpers.py          # Tijd, netwerk, bel-servers
│
└── frontend/
    ├── auth.html           # Login-/registratiepagina
    ├── pages/snap.html     # De hoofd-app
    ├── style/              # CSS (opmaak)
    │   ├── auth.css
    │   └── app/                # main.css, sidebar.css, chat-view.css
    └── javascript/
        ├── auth.js             # Logica van de loginpagina
        ├── utils/              # Herbruikbare hulpjes
        │   ├── config.js           # Bepaalt het backend-adres
        │   ├── api.js              # fetch-wrapper + meldingen (toast)
        │   ├── dom.js              # HTML veilig bouwen, modals, tijd
        │   └── media.js            # Camera/microfoon, tekst op foto
        └── app/                # De app zelf
            ├── main.js             # 🚀 Startpunt van de frontend
            ├── state.js            # Gedeeld geheugen van de app
            ├── sidebar.js          # Zijbalk: vrienden, groepen, stories
            ├── chat.js             # Chatvenster, berichten, voice
            ├── modals.js           # Alle pop-upvensters
            ├── camera.js           # Snap maken en versturen
            ├── profile.js          # Profiel en instellingen
            ├── calls.js            # Bellen
            └── socket.js           # Realtime events (browserkant)
```

---

## 📌 Belangrijk om te weten

- **De server is de baas.** Belangrijke regels (zoals "een snap mag maar 2× geopend
  worden") worden op de **backend** gecontroleerd, niet in de browser. Zo kan een
  gebruiker via de frontend niet "vals spelen".
- **Wachtwoorden worden nooit als gewone tekst opgeslagen** — alleen de bcrypt-hash.
- **Veilig tegen XSS.** Tekst van gebruikers wordt altijd via `escapeHtml()` (in
  `dom.js`) ontdaan van gevaarlijke code voordat ze in de pagina komt.
- **De code is van commentaar voorzien.** In bijna elk bestand staat per functie
  in het Nederlands uitgelegd wat ze doet, met extra uitleg bij de lastige stukken.

---

_Schoolproject sociale media — 2025-2026_
