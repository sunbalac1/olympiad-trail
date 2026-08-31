// One-time migration: reads the existing STARTER_QUESTIONS array (whatever
// its current size — 2269 as of writing this, and growing) and bulk-inserts
// every question into Postgres. Run once against a fresh database:
//
//   cd server
//   node --env-file=.dev.vars scripts/seed.js
//
// (.dev.vars must have DATABASE_URL set — see server/README.md)

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { questions } from "../src/db/schema.js";
import { STARTER_QUESTIONS } from "../../src/questions.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.dev.vars scripts/seed.js");
  process.exit(1);
}

const db = drizzle(neon(databaseUrl), { schema: { questions } });

const rows = STARTER_QUESTIONS.map((q) => ({
  subject: q.subject,
  grade: q.grade,
  topic: q.topic || "uncategorized",
  questionText: q.q,
  options: q.options,
  correctIndex: q.correct,
  solution: q.solution || "",
}));

console.log(`Seeding ${rows.length} questions...`);

// insert in batches to stay well under any single-request payload limits
const BATCH_SIZE = 200;
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  await db.insert(questions).values(batch);
  inserted += batch.length;
  console.log(`  ${inserted}/${rows.length}`);
}

console.log("Done.");
