import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { students, questions, questionResponses } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { assertOwnsStudent } from "../lib/ownership.js";

export const studentRoutes = new Hono();
studentRoutes.use("*", requireAuth);

// Every query here is scoped to the caller's account_id — this is the actual
// mechanism that keeps one family's kids invisible to another family, not
// anything the frontend does.

studentRoutes.get("/", async (c) => {
  const { id: accountId } = c.get("account");
  const db = getDb(c.env.DATABASE_URL);
  const rows = await db.select().from(students).where(eq(students.accountId, accountId));
  return c.json(rows);
});

studentRoutes.post("/", async (c) => {
  const { id: accountId } = c.get("account");
  const { name, avatar, grade } = await c.req.json().catch(() => ({}));
  if (!name?.trim() || !avatar || !grade) return c.json({ error: "name, avatar, and grade are required." }, 400);
  const db = getDb(c.env.DATABASE_URL);
  const [student] = await db.insert(students).values({ accountId, name: name.trim(), avatar, grade }).returning();
  return c.json(student);
});

// The one thing the client genuinely can't compute itself: topic stats and
// trends already work client-side from data the family already has (see
// computeTopicStats/detectPatterns in OlympiadTrail.jsx), but optionTags is
// deliberately never sent to students (see questions.js), so misconception
// frequency can only be computed here, where that column is actually
// reachable. Grouped by subject+topic+tag among this student's wrong
// answers only — the client combines this with its own topic stats to build
// the focus plan and render the final message text.
studentRoutes.get("/:id/insights", async (c) => {
  const { id: accountId } = c.get("account");
  const studentId = Number(c.req.param("id"));
  const db = getDb(c.env.DATABASE_URL);

  if (!(await assertOwnsStudent(db, accountId, studentId))) {
    return c.json({ error: "Student not found." }, 404);
  }

  const rows = await db.select({
    subject: questions.subject,
    topic: questions.topic,
    tag: sql`${questions.optionTags} ->> ${questionResponses.selectedIndex}`,
    count: sql`count(*)`.mapWith(Number),
  })
    .from(questionResponses)
    .innerJoin(questions, eq(questionResponses.questionId, questions.id))
    .where(and(
      eq(questionResponses.studentId, studentId),
      eq(questionResponses.isCorrect, false),
    ))
    .groupBy(questions.subject, questions.topic, sql`${questions.optionTags} ->> ${questionResponses.selectedIndex}`);

  return c.json({ misconceptions: rows.filter((r) => r.tag !== null) });
});

studentRoutes.delete("/:id", async (c) => {
  const { id: accountId } = c.get("account");
  const studentId = Number(c.req.param("id"));
  const db = getDb(c.env.DATABASE_URL);
  const deleted = await db.delete(students)
    .where(and(eq(students.id, studentId), eq(students.accountId, accountId)))
    .returning();
  if (deleted.length === 0) return c.json({ error: "Student not found." }, 404);
  return c.json({ ok: true });
});
