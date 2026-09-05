import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { questions, questionResponses } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { assertOwnsStudent } from "../lib/ownership.js";

export const questionRoutes = new Hono();
questionRoutes.use("*", requireAuth);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The question bank is shared content, same for every account — no
// account-scoping here, unlike students/attempts/flags.
questionRoutes.get("/", async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const { subject, grade, topic } = c.req.query();

  const conditions = [];
  if (subject) conditions.push(eq(questions.subject, subject));
  if (grade) conditions.push(eq(questions.grade, Number(grade)));
  if (topic) conditions.push(eq(questions.topic, topic));

  const rows = conditions.length > 0
    ? await db.select().from(questions).where(and(...conditions))
    : await db.select().from(questions);

  return c.json(rows);
});

// Server-side exam question selection: excludes questions this student has
// already answered, then biases toward globally under-attempted questions —
// sampling from a band of the least-attempted rather than a strict cutoff, so
// students hitting the same low-count tier concurrently don't all get the
// identical set (just in shuffled order). Supplements, not replaces, the
// per-student no-repeat behavior.
questionRoutes.get("/exam", async (c) => {
  const { id: accountId } = c.get("account");
  const { subject, grade, studentId, count } = c.req.query();
  const numStudentId = Number(studentId);
  const numGrade = Number(grade);
  const numCount = Math.max(1, Number(count) || 10);

  if (!subject || !numGrade || !numStudentId) {
    return c.json({ error: "subject, grade, and studentId are required." }, 400);
  }

  const db = getDb(c.env.DATABASE_URL);
  if (!(await assertOwnsStudent(db, accountId, numStudentId))) {
    return c.json({ error: "Student not found." }, 404);
  }

  const rows = await db.select({
    id: questions.id, subject: questions.subject, grade: questions.grade, topic: questions.topic,
    questionText: questions.questionText, options: questions.options,
    correctIndex: questions.correctIndex, solution: questions.solution,
    globalCount: sql`count(${questionResponses.id})`.mapWith(Number),
    seenByStudent: sql`bool_or(${questionResponses.studentId} = ${numStudentId})`.mapWith(Boolean),
  })
    .from(questions)
    .leftJoin(questionResponses, eq(questionResponses.questionId, questions.id))
    .where(and(eq(questions.subject, subject), eq(questions.grade, numGrade)))
    .groupBy(questions.id);

  function pickBiased(tier, need) {
    const sorted = [...tier].sort((a, b) => a.globalCount - b.globalCount);
    const bandSize = Math.min(sorted.length, Math.max(need * 4, need + 20));
    return shuffle(sorted.slice(0, bandSize)).slice(0, need);
  }

  const unseen = rows.filter((q) => !q.seenByStudent);
  const seen = rows.filter((q) => q.seenByStudent);
  const picked = [...pickBiased(unseen, numCount), ...pickBiased(seen, numCount)].slice(0, numCount);

  return c.json(picked.map(({ globalCount, seenByStudent, ...q }) => q));
});
