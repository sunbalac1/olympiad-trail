// One-time backfill (safe to re-run — also doubles as reconciliation for the
// rare dropped write from the best-effort insert in routes/attempts.js):
// unnests every existing attempt's `answers` JSONB into question_responses
// rows, so "least attempted" ranking isn't blind to history that predates
// this table.
//
//   cd server
//   node --env-file=.dev.vars scripts/backfill-question-responses.js

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { questionResponses } from "../src/db/schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.dev.vars scripts/backfill-question-responses.js");
  process.exit(1);
}

const sql = neon(databaseUrl);
const db = drizzle(neon(databaseUrl), { schema: { questionResponses } });

// Only attempts not already represented — makes this script idempotent.
const pendingAttempts = await sql`
  SELECT a.id AS attempt_id, a.student_id, a.answers
  FROM attempts a
  WHERE NOT EXISTS (SELECT 1 FROM question_responses qr WHERE qr.attempt_id = a.id)
`;

console.log(`Found ${pendingAttempts.length} attempt(s) to backfill.`);

const rows = [];
for (const attempt of pendingAttempts) {
  for (const ans of attempt.answers) {
    rows.push({
      attemptId: attempt.attempt_id,
      questionId: ans.id,
      studentId: attempt.student_id,
      selectedIndex: ans.selected,
      isCorrect: ans.selected !== null && ans.selected === ans.correctIndex,
    });
  }
}

console.log(`Backfilling ${rows.length} question_responses row(s)...`);

const BATCH_SIZE = 200;
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  if (batch.length === 0) continue;
  await db.insert(questionResponses).values(batch);
  inserted += batch.length;
  console.log(`  ${inserted}/${rows.length}`);
}

console.log("Done.");
