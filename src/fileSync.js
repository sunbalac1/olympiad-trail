// Optional: write newly-added questions directly into questions.js on disk,
// using the File System Access API (Chromium-only — Edge/Chrome, which is
// exactly what the desktop launcher already uses). This makes CSV/manual
// uploads permanent and independent of the browser's localStorage, which is
// scoped per-origin (e.g. questions added while running `npm run dev` on
// port 5173 aren't visible from the desktop app on port 4173, and vice
// versa — localStorage doesn't get "lost", it's just tied to whichever
// port/origin you used at the time).

const DB_NAME = "olympiad-trail-fs";
const STORE = "handles";
const KEY = "questionsFile";

export function fileSyncSupported() {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveFileHandle(handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSavedFileHandle() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function hasReadWritePermission(handle) {
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
}

// must be called from a user gesture (click handler) — the browser requires it
export async function requestReadWritePermission(handle) {
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

// must be called from a user gesture (click handler)
export async function pickQuestionsFile() {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: "questions.js", accept: { "text/javascript": [".js"] } }],
    excludeAcceptAllOption: false,
    multiple: false,
  });
  if (!(await hasReadWritePermission(handle)) && !(await requestReadWritePermission(handle))) {
    throw new Error("Write permission was not granted.");
  }
  await saveFileHandle(handle);
  return handle;
}

function formatQuestionLine(q) {
  const opts = q.options.map((o) => JSON.stringify(o)).join(",");
  return `  { id:${JSON.stringify(q.id)}, subject:${JSON.stringify(q.subject)}, grade:${q.grade}, topic:${JSON.stringify(q.topic || "uncategorized")}, q:${JSON.stringify(q.q)}, options:[${opts}], correct:${q.correct}, solution:${JSON.stringify(q.solution)} },`;
}

// appends questions just before the closing `];` of `export const STARTER_QUESTIONS = [`,
// leaving all existing content (including comments) untouched
export async function appendQuestionsToFile(handle, questions) {
  if (questions.length === 0) return;
  const file = await handle.getFile();
  const text = await file.text();
  const marker = "\n];";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) throw new Error("Couldn't find the end of STARTER_QUESTIONS in that file — is it the right questions.js?");

  const stamp = new Date().toISOString().slice(0, 10);
  const insertion = `\n  // ── added via question bank on ${stamp} ──\n` + questions.map(formatQuestionLine).join("\n") + "\n";
  const newText = text.slice(0, idx) + insertion + text.slice(idx);

  const writable = await handle.createWritable();
  await writable.write(newText);
  await writable.close();
}
