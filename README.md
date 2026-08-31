# Olympiad Trail

A practice-exam app for Math, Science, English, and Reasoning (Grades
4–8, Olympiad style), with timed rounds, per-kid profiles, scored
review, and worked solutions.

Live at **https://nalnaal.com**.

## Architecture

- **Frontend**: React + Vite (`src/`), deployed as a Cloudflare Worker
  with static assets (`wrangler.toml` at the repo root). Auto-deploys on
  every push to `master` via Cloudflare's GitHub integration.
- **Backend**: Cloudflare Worker running Hono (`server/`), talking to a
  Neon Postgres database via Drizzle ORM. Deployed manually with
  `wrangler deploy` — see `server/README.md`.
- **Auth**: each family signs up with email + password and manages
  their own kid profiles; students, attempts, and flags are all scoped
  to the signed-in account server-side.

## Local development

Two servers, in separate terminals:

    npm install
    npm run dev

and

    cd server
    npm install
    npm run dev

The frontend (`http://localhost:5173`) talks to the API
(`http://localhost:8787`) using the values in `server/.dev.vars` (see
`server/README.md` for one-time setup — Neon connection string, JWT
secret, etc.).

## Admin: managing the question bank

There's no local admin password anymore. To make an account an admin,
flip `is_admin` to `true` for its row in the `accounts` table (Neon's
SQL editor, or `npm run db:studio` from `server/`), then log out and
back in — the admin flag is read from the session at login time. Once
signed in as admin, an **"Admin"** button appears on the profile picker,
giving access to the grade × subject matrix, a filterable/searchable
question table, manual question add, CSV bulk upload, and flagged-
question review.

## Deploying

See `server/README.md` for the backend. The frontend redeploys
automatically on push to `master` (Cloudflare Pages/Workers Git
integration) — no manual step needed unless you're changing Worker
config (`wrangler.toml`) or environment variables in the Cloudflare
dashboard.
