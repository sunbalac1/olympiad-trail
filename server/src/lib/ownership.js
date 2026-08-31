import { and, eq } from "drizzle-orm";
import { students } from "../db/schema.js";

// Confirms `studentId` belongs to `accountId` before any attempt/flag write
// or read touches that student's data. Every route that takes a studentId
// from the client must call this first — the studentId in a request body is
// just a claim until it's checked against the authenticated account.
export async function assertOwnsStudent(db, accountId, studentId) {
  const [row] = await db.select({ id: students.id }).from(students)
    .where(and(eq(students.id, studentId), eq(students.accountId, accountId)))
    .limit(1);
  return !!row;
}
