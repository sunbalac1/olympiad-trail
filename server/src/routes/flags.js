import { Hono } from "hono";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { flags, questions } from "../db/schema.js";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import { assertOwnsStudent } from "../lib/ownership.js";

export const flagRoutes = new Hono();
flagRoutes.use("*", requireAuth);

// Any signed-in account can flag a question, but only for a student they own.
flagRoutes.post("/", async (c) => {
  const { id: accountId } = c.get("account");
  const { studentId, questionId, reason } = await c.req.json().catch(() => ({}));
  if (!studentId || !questionId || !["wrong", "no-correct-option"].includes(reason)) {
    return c.json({ error: "studentId, questionId, and a valid reason are required." }, 400);
  }
  const db = getDb(c.env.DATABASE_URL);
  if (!(await assertOwnsStudent(db, accountId, studentId))) {
    return c.json({ error: "Student not found." }, 404);
  }
  const [flag] = await db.insert(flags).values({ studentId, questionId, reason }).returning();
  return c.json(flag);
});

// Admin-only from here: reviewing and resolving flags raised across all accounts.
flagRoutes.get("/", requireAdmin, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const rows = await db.select({
    id: flags.id, reason: flags.reason, createdAt: flags.createdAt, resolvedAt: flags.resolvedAt,
    questionId: flags.questionId, questionText: questions.questionText,
    subject: questions.subject, grade: questions.grade,
  }).from(flags)
    .innerJoin(questions, eq(flags.questionId, questions.id))
    .where(isNull(flags.resolvedAt));
  return c.json(rows);
});

flagRoutes.post("/:id/resolve", requireAdmin, async (c) => {
  const flagId = Number(c.req.param("id"));
  const db = getDb(c.env.DATABASE_URL);
  const [updated] = await db.update(flags).set({ resolvedAt: new Date() }).where(eq(flags.id, flagId)).returning();
  if (!updated) return c.json({ error: "Flag not found." }, 404);
  return c.json(updated);
});
