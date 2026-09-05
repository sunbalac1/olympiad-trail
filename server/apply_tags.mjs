// One-off script to apply a batch of hand-reviewed misconception tags (and
// any correct_index fixes found along the way) to the questions table.
// Usage: node --env-file=.dev.vars apply_tags.mjs <path-to-batch-json>

import { neon } from "@neondatabase/serverless";

const file = process.argv[2];
if (!file) { console.error("Usage: node apply_tags.mjs <batch.json>"); process.exit(1); }
const batch = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));

const sql = neon(process.env.DATABASE_URL);

let tagged = 0, fixed = 0;
for (const row of batch) {
  if (row.optionTags.length !== 4) throw new Error(`id ${row.id}: optionTags must have 4 entries`);
  await sql`UPDATE questions SET option_tags = ${JSON.stringify(row.optionTags)}::jsonb WHERE id = ${row.id}`;
  tagged++;
  if (row.fixCorrectIndex !== undefined) {
    await sql`UPDATE questions SET correct_index = ${row.fixCorrectIndex} WHERE id = ${row.id}`;
    fixed++;
    console.log(`  fixed correct_index for id ${row.id} -> ${row.fixCorrectIndex}`);
  }
}
console.log(`Applied tags to ${tagged} questions (${fixed} correct_index fix(es)).`);
