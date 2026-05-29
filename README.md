<!-- @format -->

# Snapchat Clone — Setup & Run

## Requirements

- Python 3.10+
- A modern browser (Chrome, Firefox, Edge)

---

## 1. Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```
---

## 2. Start the server

```bash
cd backend
python app.py
```

You should see:

```
Database klaar.
Open op deze pc:    http://127.0.0.1:5000
Zelfde wifi:        http://192.168.x.x:5000
```

## Project structure

```
snapchat-project/
├── backend/
│   ├── app.py              # Entry point — run this
│   ├── extensions.py       # Shared Flask extensions (db, socketio, …)
│   ├── db_migrate.py       # Schema migration helper
│   ├── socket_events.py    # All Socket.IO event handlers
│   ├── requirements.txt
│   ├── models/
│   │   ├── user.py
│   │   ├── friendship.py   # FriendRequest, Friendship, BlockedUser
│   │   ├── message.py
│   │   ├── group.py        # GroupChat, GroupChatMember, GroupMessage
│   │   └── story.py
│   ├── routes/
│   │   ├── auth.py         # /api/register, /login, /logout, /me, …
│   │   ├── friends.py      # /api/friends, /block, /unblock, …
│   │   ├── messages.py     # /api/messages, /open_snap, /save_snap
│   │   ├── groups.py       # /api/groups, group messages
│   │   └── stories.py      # /api/stories
│   └── utils/
│       ├── helpers.py      # iso_utc, utc_now, get_ice_servers, …
│       └── auth.py         # require_auth(), notify_users()
└── frontend/
    ├── auth.html           # Login / register page
    ├── pages/snap.html     # Main app
    ├── style/
    │   ├── auth.css
    │   └── app/  (main.css, sidebar.css, chat-view.css)
    └── javascript/
        ├── auth.js         # Auth page logic
        ├── utils/
        │   ├── config.js   # Backend URL resolution
        │   ├── api.js      # fetch wrapper + toast()
        │   ├── dom.js      # HTML helpers, modals, time formatting
        │   └── media.js    # Camera/mic guards, canvas text
        └── app/
            ├── main.js     # Bootstrap — loaded by snap.html
            ├── state.js    # Shared app state
            ├── sidebar.js  # Friends list, stories, data loaders
            ├── chat.js     # Chat view, messages, voice recording
            ├── modals.js   # All modal dialogs
            ├── camera.js   # Snap camera + story sending
            ├── profile.js  # Profile & settings modals
            ├── calls.js    # WebRTC call handling
            └── socket.js   # Socket.IO client events
```
