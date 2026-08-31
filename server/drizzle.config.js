import { defineConfig } from "drizzle-kit";

// drizzle-kit runs in plain Node (not the Worker), so it reads DATABASE_URL
// from the environment directly — see server/README.md for how to set it
// when running `npm run db:generate` / `db:migrate` locally.
export default defineConfig({
  schema: "./src/db/schema.js",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
