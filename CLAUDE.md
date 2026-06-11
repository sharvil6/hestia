# Hestia — Development Guide

## Backend

- Virtual environment: `backend\backend\.venv` (from project root), or `backend\.venv` when already inside `backend\` — always activate it before running backend commands.
- **Do not use devcontainers.** Build and run everything locally.
- Start the backend from the `backend/` directory:
  ```
  backend\.venv\Scripts\Activate.ps1
  uvicorn main:app --reload
  ```
- The API runs on `http://127.0.0.1:8000`.

## Frontend

- Run from the `frontend/` directory:
  ```
  npm run dev
  ```
- Uses Turbopack by default (Next.js 16). Do NOT pass `--webpack` or `--turbopack` explicitly.
- The app runs on `http://localhost:3000`.

## Running the full stack

Start both processes (backend first, then frontend). Keep them running until the frontend loads in a browser without errors. Verify the golden paths (add recipe, scrape URL, upload image) before reporting the task done.

## Local dev login (for Claude)

A dedicated admin user `Claude Dev` exists in the **local** SQLite DB (`backend/data/db/hestia.db` only — not in prod) so Claude can drive the UI past the passkey gate during development.

The 12-word key and login snippet live in `CLAUDE.local.md` at the project root (gitignored; not committed). If that file is missing on a fresh checkout, mint a new one with `python -m scripts.create_admin "Claude Dev" --force` from `backend/` (venv activated) and write the printed words into a new `CLAUDE.local.md`.

## Quick verification (`verify.ps1`)

Use `verify.ps1` at the project root to quickly confirm your changes haven't broken the dev servers. It reuses any server already listening on the port and only cold-starts what's missing, so re-runs are near-instant.

```
.\verify.ps1                # backend + frontend  (default)
.\verify.ps1 -Backend       # backend only
.\verify.ps1 -Mobile        # also start + check the Expo/Metro bundler
.\verify.ps1 -All           # backend + frontend + mobile
.\verify.ps1 -Stop          # kill servers this script previously started
```

What it checks:
- **backend** — `GET /` returns a JSON object with `status`, and `GET /recipes/` returns 200.
- **frontend** — `GET http://127.0.0.1:3000/` returns 200.
- **mobile** — Metro's `/status` reports `packager-status:running`.

Tracked PIDs are written to `.verify-pids.json`; use `-Stop` to tear them down. Servers it didn't start (already running) are left alone. Exit code is 0 on pass, 1 on any failure — safe to chain with `; if ($?) { ... }`.

Run this after edits as a fast smoke test instead of starting servers by hand. It is NOT a substitute for exercising golden paths in the browser when you change UI.

## Shared code

TypeScript types and the API client live in `shared/`, published as the `@hestia/shared` npm workspace package.

- **npm workspaces**: root `package.json` declares `["shared", "frontend"]` as workspaces. Always run `npm install` from the **project root** (`hestia/`), never from inside `frontend/`.
- Frontend resolves `@hestia/shared` via the workspace symlink at `node_modules/@hestia/shared`. `transpilePackages: ['@hestia/shared']` in `frontend/next.config.ts` tells Turbopack to compile the TypeScript source.
- Mobile is **not** a workspace member — it resolves `@hestia/shared` via `extraNodeModules` in `mobile/metro.config.js`, pointing directly at `../shared`.
- Import paths everywhere: `@hestia/shared/lib/api` and `@hestia/shared/types`.

## Production deployment (self-hosted on Proxmox)

Hestia runs on an Ubuntu 24.04 VM (`hestia`) on a home Proxmox box. The stack is **native systemd, not Docker** — local `docker-compose.yml` is for dev only. CD runs via a GitHub Actions self-hosted runner on the same VM; every push to `main` triggers `deploy/deploy.sh`. Cloudflare Tunnel handles HTTPS at the edge; no inbound ports are opened on the home router.

Public hostnames:
- `https://hestia.sharvilpatel.dev` → frontend (Next.js on `127.0.0.1:3000`)
- `https://hestia-api.sharvilpatel.dev` → backend (FastAPI on `127.0.0.1:8000`)

Both are single-level subdomains so Cloudflare's free Universal SSL covers them. Do not introduce `*.hestia.sharvilpatel.dev` — that's two levels deep and breaks SSL.

Persistent data lives at `/srv/hestia/data/` on the VM (SQLite + uploaded images). Repo at `/srv/hestia/repo`, secrets at `/srv/hestia/.env` (`root:hestia` 0640).

### Production ops quick reference

| Task | Command (run on the VM) |
|---|---|
| Manual deploy | `sudo -u hestia bash /srv/hestia/repo/deploy/deploy.sh && sudo systemctl restart hestia-backend hestia-frontend` |
| Tail backend logs | `sudo journalctl -u hestia-backend -f` |
| Tail frontend logs | `sudo journalctl -u hestia-frontend -f` |
| Tail tunnel logs | `sudo journalctl -u cloudflared -f` |
| Restart everything | `sudo systemctl restart hestia-backend hestia-frontend cloudflared` |
| Backup right now | `sudo -u hestia sqlite3 /srv/hestia/data/db/hestia.db ".backup '/srv/hestia/backups/manual-$(date +%F-%H%M).db'"` |
| Disk usage | `du -sh /srv/hestia/*` |

### Files that govern the prod stack

- [deploy/install.sh](deploy/install.sh) — one-time host bootstrap (idempotent)
- [deploy/deploy.sh](deploy/deploy.sh) — per-deploy build (git pull, conditional pip/npm, rsync standalone bundle). Bakes `NEXT_PUBLIC_API_URL` at build time.
- [deploy/hestia-backend.service](deploy/hestia-backend.service), [deploy/hestia-frontend.service](deploy/hestia-frontend.service) — systemd units (bind to 127.0.0.1, hardened)
- [deploy/gh-runner.sudoers](deploy/gh-runner.sudoers) — least-privilege sudo for the CD runner (4 exact commands)
- [.github/workflows/deploy.yml](.github/workflows/deploy.yml) — push-to-main → build → restart → health-check

### Gotchas when changing prod-affecting code

- **`useSearchParams()` and similar CSR-bailout hooks must be wrapped in `<Suspense>`** — `next dev` is forgiving, `next build` is not, and `verify.ps1` does not catch it. Adding a route that uses any of these without a Suspense wrapper will break CD even if local dev looks fine. See [frontend/app/login/page.tsx](frontend/app/login/page.tsx) for the pattern.
- **`NEXT_PUBLIC_*` env vars are inlined at build time** — changing the backend URL means editing `deploy/deploy.sh` and triggering a frontend rebuild, not just restarting the service.
- **CORS_ORIGINS in [deploy/hestia-backend.service](deploy/hestia-backend.service)** must match the frontend's public hostname exactly. If you ever change the frontend hostname, change both.
- **Stick to single-level subdomains under `sharvilpatel.dev`** unless you want to pay for Cloudflare Advanced Certificate Manager.
