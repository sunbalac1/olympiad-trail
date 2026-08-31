import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

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

// A "this question seems wrong" report raised by a student during review.
export const flags = pgTable("flags", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(), // "wrong" | "no-correct-option"
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
