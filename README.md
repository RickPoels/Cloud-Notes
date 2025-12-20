# Cloud-Notes

Lightweight, Obsidian-inspired cloud notebook. One backend, static frontend, PostgreSQL storage, JWT auth, and a vault → folder → note model.

## 🧠 Summary
Cloud-Notes lets you organize notes inside vaults and folders, with autosaving and heading-based outlines. It’s deliberately minimal: plain HTML/CSS/JS frontend served by an Express backend, all backed by PostgreSQL.

Important tech:
- Backend: Node.js (Express, Helmet, express-rate-limit), JWT, bcrypt, pg
- Frontend: Plain HTML/CSS/JS (no build step), served statically by Express
- Database: PostgreSQL with UUIDs, citext, triggers for updated_at, proper indexes

## 📁 High Level — Project Structure
```
cloud-notes/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── db.js
│   │   ├── middleware/auth.js
│   │   └── routes/ (auth, vaults, folders, notes, tags)
│   ├── sql/schema.sql
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── login.html
    ├── signup.html
    ├── notes.html
    ├── vaults.html
    └── app.css
```

## ✨ Features
- Vaults & folders: organize notes by vault and folder; notes are scoped to the selected folder.
- Notes: title + body (text), pins/archives, tags (API-ready).
- Auth: email/password with bcrypt; JWT access tokens (5h).
- Outline: heading-based outline (toggleable), autosave on typing.
- Static frontend: no build step; served by Express.
- API-first: REST endpoints for auth, vaults, folders, notes, tags.

## 🔌 API (JWT protected unless noted)
- Public: `POST /auth/register`, `POST /auth/login`, `GET /auth/me` (token validation)
- Vaults: `GET|POST /vaults`
- Folders: `GET|POST /vaults/:vaultId/folders`
- Notes:
  - List (lightweight): `GET /vaults/:vaultId/notes?folder_id=...`
  - Detail: `GET /vaults/:vaultId/notes/:noteId`
  - Create: `POST /vaults/:vaultId/notes` (requires folder_id)
  - Update/Delete: `PUT|DELETE /vaults/:vaultId/notes/:noteId`
- Tags: `GET|POST /vaults/:vaultId/tags`

## 🖥 Frontend usage
- Login: `/login.html`; Sign up: `/signup.html`
- Vault management: `/vaults.html` (list/create/open vault)
- Notes: `/notes.html` (select vault → folder → notes; autosave; outline toggle)

## ⚙️ Local setup
```bash
cd cloud-notes/backend
cp .env.example .env
# set DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npm install
psql "$DATABASE_URL" -f sql/schema.sql
npm run dev
```
Open `http://localhost:3000/login.html`.

## ☁️ Deployment (Render/Railway)
- Root: `cloud-notes/backend`
- Build: `npm install`
- Start: `npm start`
- Env vars: `DATABASE_URL` (use internal if same platform), `JWT_SECRET`, `CORS_ORIGIN` (your app URL)
- Run `sql/schema.sql` once against your Postgres

## 🔒 Security notes
- JWT access tokens expire in 5h (stored client-side). For production, consider HttpOnly cookies + refresh tokens + CSRF.
- Helmet enabled; HTTPS redirect in production; rate limiting on `/auth`.
- Passwords hashed with bcrypt; strength check (upper/lower/digit, 8+).
- Ownership checks on vault/folder/note routes.

## 📌 Roadmap / Nice-to-haves
- HttpOnly cookie sessions + refresh token rotation + CSRF protection
- Search/backlinks panels in the UI
- Role/permission model, row-level security policies
- Audit logging and broader rate limiting
- CSP/HSTS and secure header tightening
