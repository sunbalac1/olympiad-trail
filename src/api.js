const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// Server rows use questionText/correctIndex; the app's screens were built
// around q/correct — map at the API boundary so no screen component needs to change.
export function mapQuestion(row) {
  return {
    id: row.id, subject: row.subject, grade: row.grade, topic: row.topic,
    q: row.questionText, options: row.options, correct: row.correctIndex, solution: row.solution,
  };
}

export function mapAttempt(row) {
  return {
    id: row.id, subject: row.subject, grade: row.grade, date: row.createdAt,
    score: row.score, total: row.total, timeTakenSec: row.timeTakenSec, answers: row.answers,
  };
}

function qs(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : "";
}

export const api = {
  signup: (email, password) => request("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),

  listStudents: () => request("/students"),
  addStudent: (student) => request("/students", { method: "POST", body: JSON.stringify(student) }),
  deleteStudent: (id) => request(`/students/${id}`, { method: "DELETE" }),

  listQuestions: (params) => request(`/questions${qs(params)}`),
  pickExamQuestions: (params) => request(`/questions/exam${qs(params)}`),

  submitAttempt: (attempt) => request("/attempts", { method: "POST", body: JSON.stringify(attempt) }),
  listAttempts: (studentId) => request(`/attempts/student/${studentId}`),
  studentInsights: (studentId) => request(`/students/${studentId}/insights`),

  flagQuestion: (body) => request("/flags", { method: "POST", body: JSON.stringify(body) }),

  adminListQuestions: (params) => request(`/admin/questions${qs(params)}`),
  adminAddQuestion: (q) => request("/admin/questions", { method: "POST", body: JSON.stringify(q) }),
  adminBulkQuestions: (questions) => request("/admin/questions/bulk", { method: "POST", body: JSON.stringify({ questions }) }),
  adminDeleteQuestion: (id) => request(`/admin/questions/${id}`, { method: "DELETE" }),
  adminListFlags: () => request("/admin/flags"),
  adminResolveFlag: (id) => request(`/admin/flags/${id}/resolve`, { method: "POST" }),
  adminAnalytics: () => request("/admin/analytics"),
  adminListResponses: () => request("/admin/responses"),
};
