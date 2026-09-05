import { Hono } from "hono";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { questions, flags, attempts, students, accounts, questionResponses } from "../db/schema.js";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import { hashPassword } from "../lib/password.js";

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
  if (q.optionTags !== undefined && q.optionTags !== null && (!Array.isArray(q.optionTags) || q.optionTags.length !== 4)) {
    return "optionTags, if provided, must be an array of exactly 4 entries.";
  }
  return null;
}

// Optional per-option misconception tags — always an array of 4 (or null if
// nothing was actually tagged), with the correct answer's slot forced to
// null regardless of what was sent, since only a wrong option represents a
// misconception. Never trust the client's correctIndex slot blindly here.
function normalizeOptionTags(tags, correctIndex) {
  if (!Array.isArray(tags)) return null;
  const cleaned = [0, 1, 2, 3].map((i) => (i === correctIndex ? null : (tags[i] ? String(tags[i]) : null)));
  return cleaned.some((t) => t !== null) ? cleaned : null;
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
    optionTags: normalizeOptionTags(body.optionTags, body.correctIndex),
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
      optionTags: normalizeOptionTags(q.optionTags, q.correctIndex),
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

// Reviewing/resolving flags raised by any account — see routes/flags.js for
// where a flag actually gets created (any signed-in account, for their own student).
adminRoutes.get("/flags", async (c) => {
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

adminRoutes.post("/flags/:id/resolve", async (c) => {
  const flagId = Number(c.req.param("id"));
  const db = getDb(c.env.DATABASE_URL);
  const [updated] = await db.update(flags).set({ resolvedAt: new Date() }).where(eq(flags.id, flagId)).returning();
  if (!updated) return c.json({ error: "Flag not found." }, 404);
  return c.json(updated);
});

// Cross-student insight: which topics does everyone tend to get right vs
// wrong, broken down by grade and subject. `answers` doesn't store a topic
// (it's a point-in-time snapshot of the question), so we join against the
// current `questions.topic` here — same pattern the per-student analytics
// screen already uses client-side, just aggregated across every account.
adminRoutes.get("/analytics", async (c) => {
  const db = getDb(c.env.DATABASE_URL);

  const [summary] = await db.select({
    totalAttempts: sql`count(*)`.mapWith(Number),
    totalStudents: sql`count(distinct ${attempts.studentId})`.mapWith(Number),
  }).from(attempts);

  // Grouped directly in Postgres now that question_responses exists, instead
  // of fetching every attempt's answers JSONB and reducing in JS. Grouping by
  // questions.grade/subject (rather than attempts.grade/subject) is
  // equivalent in practice — exam selection always scopes a question's
  // grade/subject to match the attempt it was answered in — and it also
  // means topic always reflects the question's *current* classification,
  // same as the old implementation's live topicById lookup did.
  const topicRows = await db.select({
    grade: questions.grade,
    subject: questions.subject,
    topic: questions.topic,
    total: sql`count(*)`.mapWith(Number),
    correct: sql`count(*) filter (where ${questionResponses.isCorrect})`.mapWith(Number),
  })
    .from(questionResponses)
    .innerJoin(questions, eq(questionResponses.questionId, questions.id))
    .groupBy(questions.grade, questions.subject, questions.topic);

  const topics = topicRows.map((b) => {
    const pct = Math.round((b.correct / b.total) * 100);
    const tier = b.total < 3 ? "learning" : pct >= 75 ? "strong" : pct >= 50 ? "average" : "needs-improvement";
    return { ...b, pct, tier };
  });

  return c.json({ totalAttempts: summary.totalAttempts, totalStudents: summary.totalStudents, topics });
});

// Raw, per-question dump of every response across every account — the
// row-level detail behind the aggregated /analytics numbers above.
// Filtering/searching happens client-side on this full set; the dataset
// this app produces stays small enough that a second round-trip per
// keystroke isn't worth the complexity.
adminRoutes.get("/responses", async (c) => {
  const db = getDb(c.env.DATABASE_URL);

  const [studentRows, attemptRows, allQuestions] = await Promise.all([
    db.select({
      studentId: students.id, studentName: students.name, studentGrade: students.grade,
      accountEmail: accounts.email,
    }).from(students).innerJoin(accounts, eq(students.accountId, accounts.id)),
    db.select({
      id: attempts.id, studentId: attempts.studentId, subject: attempts.subject, grade: attempts.grade,
      answers: attempts.answers, createdAt: attempts.createdAt,
    }).from(attempts),
    db.select({ id: questions.id, topic: questions.topic }).from(questions),
  ]);
  const studentById = new Map(studentRows.map((s) => [s.studentId, s]));
  const topicById = new Map(allQuestions.map((q) => [q.id, q.topic]));

  const rows = [];
  attemptRows.forEach((a) => {
    const student = studentById.get(a.studentId);
    if (!student) return; // defensive: shouldn't happen, FK-enforced
    a.answers.forEach((ans) => {
      rows.push({
        attemptId: a.id, attemptDate: a.createdAt,
        accountEmail: student.accountEmail, studentId: a.studentId,
        studentName: student.studentName, studentGrade: student.studentGrade,
        subject: a.subject, grade: a.grade, topic: topicById.get(ans.id) || "uncategorized",
        question: ans.question,
        selectedText: ans.selected !== null ? ans.options[ans.selected] : null,
        correctText: ans.options[ans.correctIndex],
        isCorrect: ans.selected !== null && ans.selected === ans.correctIndex,
      });
    });
  });

  rows.sort((a, b) => new Date(b.attemptDate) - new Date(a.attemptDate));
  return c.json(rows);
});

// Every family account, with how many student profiles each has — the
// picker list behind the password-reset action below. No password data
// leaves this endpoint, just enough to find the right account.
adminRoutes.get("/accounts", async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const rows = await db.select({
    id: accounts.id, email: accounts.email, isAdmin: accounts.isAdmin, createdAt: accounts.createdAt,
    studentCount: sql`count(${students.id})`.mapWith(Number),
  }).from(accounts)
    .leftJoin(students, eq(students.accountId, accounts.id))
    .groupBy(accounts.id)
    .orderBy(accounts.email);
  return c.json(rows);
});

// Admin-initiated password reset — for a parent locked out of their own
// account. The admin sets (or the UI generates) the new password and relays
// it to the family directly; there's no email infra in this app to send a
// reset link through, so this is the whole flow.
adminRoutes.post("/accounts/:id/reset-password", async (c) => {
  const id = Number(c.req.param("id"));
  const { newPassword } = await c.req.json().catch(() => ({}));
  if (!newPassword || newPassword.length < 8) {
    return c.json({ error: "A new password (8+ characters) is required." }, 400);
  }
  const db = getDb(c.env.DATABASE_URL);
  const passwordHash = await hashPassword(newPassword);
  const [account] = await db.update(accounts).set({ passwordHash })
    .where(eq(accounts.id, id))
    .returning({ id: accounts.id, email: accounts.email });
  if (!account) return c.json({ error: "Account not found." }, 404);
  return c.json({ ok: true, email: account.email });
});
