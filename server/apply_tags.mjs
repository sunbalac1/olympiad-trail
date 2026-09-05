// One-off script to apply a batch of hand-reviewed misconception tags (and
// any correct_index fixes found along the way) to the questions table.
// Validates every row BEFORE writing anything — the correct answer's own
// slot must always be null, since a tag there would be both wrong (correct
// answers aren't misconceptions) and a genuine leak risk if ever exposed.
// Usage: node --env-file=.dev.vars apply_tags.mjs <path-to-batch-json>

import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) { console.error("Usage: node apply_tags.mjs <batch.json>"); process.exit(1); }
const batch = JSON.parse(await readFile(file, "utf8"));

const sql = neon(process.env.DATABASE_URL);

// Pass 1: validate everything against the DB's current correct_index (or the
// batch's own fixCorrectIndex, if this batch is also correcting it) before
// writing a single row.
const errors = [];
for (const row of batch) {
  if (!Array.isArray(row.optionTags) || row.optionTags.length !== 4) {
    errors.push(`id ${row.id}: optionTags must be an array of exactly 4 entries`);
    continue;
  }
  const [dbRow] = await sql`SELECT correct_index FROM questions WHERE id = ${row.id}`;
  if (!dbRow) { errors.push(`id ${row.id}: not found in database`); continue; }
  const correctIndex = row.fixCorrectIndex !== undefined ? row.fixCorrectIndex : dbRow.correct_index;
  if (row.optionTags[correctIndex] !== null) {
    errors.push(`id ${row.id}: correct_index=${correctIndex} but optionTags[${correctIndex}]="${row.optionTags[correctIndex]}" (must be null)`);
  }
}
if (errors.length > 0) {
  console.error(`Validation failed — nothing written. ${errors.length} issue(s):`);
  errors.forEach((e) => console.error("  " + e));
  process.exit(1);
}

// Pass 2: all rows validated, now write.
let tagged = 0, fixed = 0;
for (const row of batch) {
  if (row.fixCorrectIndex !== undefined) {
    await sql`UPDATE questions SET correct_index = ${row.fixCorrectIndex} WHERE id = ${row.id}`;
    fixed++;
    console.log(`  fixed correct_index for id ${row.id} -> ${row.fixCorrectIndex}`);
  }
  await sql`UPDATE questions SET option_tags = ${JSON.stringify(row.optionTags)}::jsonb WHERE id = ${row.id}`;
  tagged++;
}
console.log(`Applied tags to ${tagged} questions (${fixed} correct_index fix(es)).`);
