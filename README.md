# Hestia 🏠

A private, family-oriented recipe management system. Named after the Greek goddess of the hearth, Hestia transforms scattered culinary knowledge into a unified, searchable, and interactive database.

## Quick Start (DevContainer)

1. Open this repo in VS Code / DevPod — the devcontainer will install Python 3.12, Node LTS, and all dependencies automatically.
2. Copy `.env.example` to `backend/.env` and fill in any API keys you need (Gemini is optional).
3. Start the backend and frontend:

```bash
# Terminal 1 — Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Docker Compose (Production)

```bash
docker compose up --build
```

This starts the backend on `:8000` and the frontend on `:3000`.

## Project Structure

```
├── backend/           # FastAPI + SQLite backend
│   ├── main.py        # App entry point
│   ├── models.py      # SQLAlchemy models
│   ├── schemas.py     # Pydantic request/response schemas
│   ├── routers/       # API route handlers
│   └── services/      # Business logic (scraper, vision OCR)
├── frontend/          # Next.js 16 + TypeScript frontend
│   ├── app/           # App Router pages
│   └── lib/           # Shared utilities (API client)
├── data/              # Runtime data (gitignored)
│   ├── db/            # SQLite database
│   └── uploads/       # Recipe images
└── spec.md            # Full technical specification
```

## Environment Variables

See [`.env.example`](.env.example) for all available configuration options.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy, SQLite (WAL mode) |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| State | TanStack React Query |
| OCR | Google Gemini (optional), Ollama (planned) |
| Scraping | recipe-scrapers |
| Deployment | Docker Compose |
