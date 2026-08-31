import { Hono } from "hono";
import { and, eq, ilike } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { questions } from "../db/schema.js";
import { requireAuth, requireAdmin } from "../lib/auth.js";

export const adminRoutes = new Hono();
adminRoutes.use("*", requireAuth, requireAdmin);

function validateQuestion(q) {
  if (!q?.subject || !q?.grade || !q?.questionText?.trim()) return "subject, grade, and questionText are required.";
  if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => !o?.toString().trim())) {
    return "options must be an array of exactly 4 non-empty values.";
  }
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
    return "correctIndex must be 0-3.";
  }
  return null;
}

// The "All questions" table: same grade/subject/topic filters as the public
// question list, plus a text search — this is the server-backed replacement
// for the client-side filtering the local-only Admin screen used to do.
adminRoutes.get("/questions", async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const { subject, grade, topic, search } = c.req.query();

  const conditions = [];
  if (subject) conditions.push(eq(questions.subject, subject));
  if (grade) conditions.push(eq(questions.grade, Number(grade)));
  if (topic) conditions.push(eq(questions.topic, topic));
  if (search) conditions.push(ilike(questions.questionText, `%${search}%`));

  const rows = conditions.length > 0
    ? await db.select().from(questions).where(and(...conditions))
    : await db.select().from(questions);
  return c.json(rows);
});

adminRoutes.post("/questions", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const error = validateQuestion(body);
  if (error) return c.json({ error }, 400);
  const db = getDb(c.env.DATABASE_URL);
  const [question] = await db.insert(questions).values({
    subject: body.subject, grade: body.grade, topic: body.topic || "uncategorized",
    questionText: body.questionText.trim(), options: body.options,
    correctIndex: body.correctIndex, solution: body.solution || "",
  }).returning();
  return c.json(question);
});

// Bulk import — takes an array of the same shape as a single POST, so the
// frontend's CSV parser (unchanged) just posts its parsed rows here instead
// of appending them to questions.js on disk.
adminRoutes.post("/questions/bulk", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const list = Array.isArray(body?.questions) ? body.questions : [];
  if (list.length === 0) return c.json({ error: "questions must be a non-empty array." }, 400);

  const errors = [];
  const valid = [];
  list.forEach((q, i) => {
    const error = validateQuestion(q);
    if (error) errors.push(`Row ${i + 1}: ${error}`);
    else valid.push({
      subject: q.subject, grade: q.grade, topic: q.topic || "uncategorized",
      questionText: q.questionText.trim(), options: q.options,
      correctIndex: q.correctIndex, solution: q.solution || "",
    });
  });

  const db = getDb(c.env.DATABASE_URL);
  const inserted = valid.length > 0 ? await db.insert(questions).values(valid).returning() : [];
  return c.json({ inserted: inserted.length, errors });
});

adminRoutes.delete("/questions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DATABASE_URL);
  const deleted = await db.delete(questions).where(eq(questions.id, id)).returning();
  if (deleted.length === 0) return c.json({ error: "Question not found." }, 404);
  return c.json({ ok: true });
});
