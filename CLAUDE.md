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

## Shared code

TypeScript types and the API client live in `shared/`, published as the `@hestia/shared` npm workspace package.

- **npm workspaces**: root `package.json` declares `["shared", "frontend"]` as workspaces. Always run `npm install` from the **project root** (`hestia/`), never from inside `frontend/`.
- Frontend resolves `@hestia/shared` via the workspace symlink at `node_modules/@hestia/shared`. `transpilePackages: ['@hestia/shared']` in `frontend/next.config.ts` tells Turbopack to compile the TypeScript source.
- Mobile is **not** a workspace member — it resolves `@hestia/shared` via `extraNodeModules` in `mobile/metro.config.js`, pointing directly at `../shared`.
- Import paths everywhere: `@hestia/shared/lib/api` and `@hestia/shared/types`.
