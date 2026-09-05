import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { attempts, students, questionResponses } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { assertOwnsStudent } from "../lib/ownership.js";

export const attemptRoutes = new Hono();
attemptRoutes.use("*", requireAuth);

// Submit a finished exam. The score is computed server-side from the
// answers, not trusted from the client, so a student can't just POST a
// fabricated high score.
attemptRoutes.post("/", async (c) => {
  const { id: accountId } = c.get("account");
  const { studentId, subject, grade, timeTakenSec, answers } = await c.req.json().catch(() => ({}));
  if (!studentId || !subject || !grade || !Array.isArray(answers) || answers.length === 0) {
    return c.json({ error: "studentId, subject, grade, and a non-empty answers array are required." }, 400);
  }

  const db = getDb(c.env.DATABASE_URL);
  if (!(await assertOwnsStudent(db, accountId, studentId))) {
    return c.json({ error: "Student not found." }, 404);
  }

  const score = answers.filter((a) => a.selected === a.correctIndex).length;
  const [attempt] = await db.insert(attempts).values({
    studentId, subject, grade,
    score, total: answers.length,
    timeTakenSec: timeTakenSec ?? 0,
    answers,
  }).returning();

  // Best-effort: the neon-http driver has no interactive transactions, so this
  // can't be atomic with the insert above. A dropped write here only makes the
  // "least attempted" ranking stale by a few rows until the backfill script
  // (which is also a reconciliation script) next runs — it never affects
  // score, review, or results, which all read from attempts.answers instead.
  try {
    await db.insert(questionResponses).values(
      answers.map((a) => ({
        attemptId: attempt.id,
        questionId: a.id,
        studentId,
        selectedIndex: a.selected,
        isCorrect: a.selected !== null && a.selected === a.correctIndex,
      }))
    );
  } catch (err) {
    console.error("Failed to record question_responses for attempt", attempt.id, err);
  }

  return c.json(attempt);
});

// History for one student's dashboard/analytics — 404s (not just an empty
// list) if the student isn't owned by the caller, so a guessed student id
// from another account can't even be used to probe for existence.
attemptRoutes.get("/student/:studentId", async (c) => {
  const { id: accountId } = c.get("account");
  const studentId = Number(c.req.param("studentId"));
  const db = getDb(c.env.DATABASE_URL);

  if (!(await assertOwnsStudent(db, accountId, studentId))) {
    return c.json({ error: "Student not found." }, 404);
  }

  const rows = await db.select().from(attempts)
    .where(eq(attempts.studentId, studentId))
    .orderBy(desc(attempts.createdAt));
  return c.json(rows);
});
