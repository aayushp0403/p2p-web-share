# ⚡ P2P Web Share

> Direct browser-to-browser file transfer. No server. No storage. Just browsers.

**Live Demo:** https://p2p-web-share.vercel.app

---

## 🚀 What is this?

P2P Web Share lets you transfer files directly between two browsers using WebRTC.
The file **never touches the server** — the backend only handles the initial
WebRTC handshake (signaling), after which the two browsers talk directly.

Built for **MARS Open Projects 2026** — Web Development Track.

---

## 🏗️ Architecture

```text
Sender Browser ──────────────────── Receiver Browser
│                                      │
│   1. create room                     │
│──────────────────► Signaling  ◄──────│ 2. join room
│                    Server            │
│   3. WebRTC offer/answer exchange    │
│◄─────────────────────────────────────│
│                                      │
│   4. Direct P2P Data Channel         │
│══════════════════════════════════════│
│         FILE TRANSFER (no server)    │
```

---

## ✨ Features

- 🗂️ **Drag & Drop** file picker with 50MB limit
- 🔗 **Unique room links** — share and receiver joins instantly  
- ⚡ **Direct P2P transfer** — file never hits the server
- 🔒 **SHA-256 chunk verification** — zero data corruption
- 📊 **Real-time progress** — percentage + transfer speed (MB/s)
- ❌ **Graceful disconnect** — clean error handling if peer leaves
- 📥 **Auto-download** — file saves automatically on receiver side
- 📱 **Mobile responsive** — works on all screen sizes

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js + Vite |
| Styling | Tailwind CSS v3 |
| P2P Layer | WebRTC (RTCPeerConnection + DataChannel) |
| Signaling | Node.js + Express + Socket.io |
| Hosting (Frontend) | Vercel |
| Hosting (Backend) | Render |

---

## 📁 Project Structure
```text
p2p-web-share/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sender.jsx      # drag/drop, room creation, file sending
│   │   │   └── Receiver.jsx    # joins room, receives + downloads file
│   │   ├── App.jsx             # routing logic
│   │   ├── socket.js           # socket.io client
│   │   └── index.css           # tailwind directives
│   ├── vercel.json             # SPA routing fix
│   └── package.json
│
├── backend/
│   ├── server.js               # signaling server (offer/answer/ICE)
│   └── package.json
│
└── README.md
```
---

## ⚙️ How the Transfer Works

1. **Sender** drops a file → backend creates a room → unique link generated
2. **Receiver** opens the link → joins the room on the backend
3. **Signaling** — backend routes WebRTC offer, answer, and ICE candidates
4. **P2P connection** established — backend is no longer involved
5. **File chunking** — sender splits file into 64KB chunks
6. **Hash verification** — each chunk gets a SHA-256 hash, receiver verifies
7. **Reassembly** — receiver collects all chunks → auto-triggers download

---

## 🏃 Running Locally

### Prerequisites
- Node.js v18+
- Git

### Backend
```bash
cd backend
npm install
node server.js
# runs on http://localhost:3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# runs on http://localhost:5173
```

### Environment Variables

Create `frontend/.env.development`:
```text
VITE_BACKEND_URL=http://localhost:3001
```
---

## 🚢 Deployment

| Service | URL |
|---------|-----|
| Frontend | https://p2p-web-share.vercel.app |
| Backend | https://p2p-web-share-backend.onrender.com |

**Vercel** (frontend): auto-deploys on push to `main`  
**Render** (backend): auto-deploys on push to `main`

---

## 📸 Screenshots

> Sender — drop file and generate link

> Receiver — download complete

---

## 👤 Author

**aayushp0403** — Built for MARS Open Projects 2026
