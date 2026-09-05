import { pgTable, serial, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";

// A "family" — signs up with email/password, owns a set of student profiles.
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A kid profile — always owned by exactly one account. Every query for a
// student's data must go through this account_id to enforce isolation.
export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  grade: integer("grade").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// The shared question bank — same content for every account, editable only
// by is_admin accounts. Mirrors the shape of src/questions.js entries.
export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(), // "math" | "science" | "english" | "reasoning"
  grade: integer("grade").notNull(),
  topic: text("topic").notNull().default("uncategorized"),
  questionText: text("question_text").notNull(),
  options: jsonb("options").notNull(), // string[4]
  correctIndex: integer("correct_index").notNull(),
  solution: text("solution").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A completed exam attempt. `answers` stays a JSONB snapshot (id, subject,
// grade, question, options, correctIndex, solution, selected) — the same
// denormalized shape the app already produces — so a later edit to a
// question never changes what a past review screen shows.
export const attempts = pgTable("attempts", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  grade: integer("grade").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  timeTakenSec: integer("time_taken_sec").notNull(),
  answers: jsonb("answers").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per question answered within an attempt — a queryable, indexable
// event log. This is deliberately separate from attempts.answers (which stays
// a JSONB point-in-time snapshot powering review/results screens): this table
// exists to make "how many times has question X been attempted" and "has this
// student already seen question X" fast, indexed queries instead of requiring
// a JSONB unnest over every attempt. studentId is denormalized off attemptId
// (same pattern as flags.studentId alongside flags.questionId) since it's
// fixed forever at insert time and is exactly what the seen-by-this-student
// check needs without a join. No unique constraint on (student_id,
// question_id) — a student can legitimately see the same question again once
// their unseen pool for a subject is exhausted (see startExam in
// OlympiadTrail.jsx), so a duplicate here is expected, not an error.
export const questionResponses = pgTable("question_responses", {
  id: serial("id").primaryKey(),
  attemptId: integer("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  selectedIndex: integer("selected_index"), // nullable = skipped
  isCorrect: boolean("is_correct").notNull(), // snapshot from the answer's own correctIndex, not a live join to questions
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  questionIdx: index("question_responses_question_id_idx").on(table.questionId),
  studentQuestionIdx: index("question_responses_student_question_idx").on(table.studentId, table.questionId),
  attemptIdx: index("question_responses_attempt_id_idx").on(table.attemptId),
}));

// A "this question seems wrong" report raised by a student during review.
export const flags = pgTable("flags", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(), // "wrong" | "no-correct-option"
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
