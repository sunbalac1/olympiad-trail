# Olympiad Trail API

Cloudflare Worker (Hono) + Neon Postgres (Drizzle ORM) backend for Olympiad
Trail. See `../.claude/plans` (or ask Claude) for the full migration plan
this implements.

## One-time setup

1. **Install dependencies**

       cd server
       npm install

2. **Create a Neon database** — go to [neon.tech](https://neon.tech), sign
   up (free), create a project. Copy the connection string it gives you
   (looks like `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`).

3. **Create `.dev.vars`** in this `server/` folder (already gitignored) with:

       DATABASE_URL=<your Neon connection string>
       JWT_SECRET=<any long random string, e.g. `openssl rand -hex 32`>
       FRONTEND_ORIGIN=http://localhost:5173

4. **Run the migration** to create the tables in Neon:

       npm run db:generate   # generates SQL from src/db/schema.js into migrations/
       npm run db:migrate    # applies it to the database at DATABASE_URL

5. **Seed the question bank** (one-time — copies every question currently in
   `../src/questions.js` into Postgres):

       npm run seed

6. **Create your own admin account**: sign up once through the app (or
   `POST /auth/signup`), then flip `is_admin` to `true` for that row —
   easiest via `npm run db:studio` (opens a local DB browser UI) and editing
   the `accounts` table directly, or Neon's own SQL editor on their website.

## Local development

    npm run dev

Starts the Worker locally (via `wrangler dev`, default `http://localhost:8787`),
using the `.dev.vars` values above.

## Deploying

1. `npx wrangler login` (opens a browser to authenticate with your Cloudflare
   account — free, no card required for this usage level).
2. Set the same secrets you put in `.dev.vars`, but for production:

       npx wrangler secret put DATABASE_URL
       npx wrangler secret put JWT_SECRET

   `FRONTEND_ORIGIN` isn't a secret — set it as a plain var in `wrangler.toml`
   once you know your deployed frontend's URL (e.g. Cloudflare Pages gives
   you `https://olympiad-trail.pages.dev`).
3. `npm run deploy`
