import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Calculator, FlaskConical, BookOpen, Puzzle, Clock, ChevronLeft, ChevronRight,
  Check, X, Plus, Trash2, ArrowLeft, Play, Sparkles, Users, Minus,
  Upload, Download, AlertCircle, GraduationCap,
  Compass, Zap, Star, Trophy, Flame, Lock, Flag, BarChart3, TrendingUp, TrendingDown, Lightbulb,
  Shield, LogOut,
} from "lucide-react";
import { topicsForSubject, topicLabel } from "./topics";
import { api, mapQuestion, mapAttempt } from "./api";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const GRADES = [4, 5, 6, 7, 8];

const SUBJECTS = {
  math:      { label: "Math",      icon: Calculator,   color: "#C4801A", soft: "#FBE9CE" },
  science:   { label: "Science",   icon: FlaskConical, color: "#0E8F82", soft: "#D3F3EE" },
  english:   { label: "English",   icon: BookOpen,     color: "#C6435E", soft: "#FBDEE3" },
  reasoning: { label: "Reasoning", icon: Puzzle,       color: "#6D4FC2", soft: "#E7E0FB" },
};

const AVATARS = ["🦉","🦁","🐯","🐼","🦊","🐢","🐬","🦄","🐸","🦅"];
const COUNT_OPTIONS = [5, 10, 15, 20];

const FLAG_REASONS = [
  { id: "wrong", label: "Wrong question" },
  { id: "no-correct-option", label: "No correct option" },
];
const FLAG_REASON_LABEL = Object.fromEntries(FLAG_REASONS.map((r) => [r.id, r.label]));

/* ------------------------------------------------------------------ */
/*  CSV template                                                        */
/* ------------------------------------------------------------------ */

const CSV_TEMPLATE = `subject,grade,topic,question,optionA,optionB,optionC,optionD,correct,solution
math,5,"Number System & Arithmetic","What is 7 × 8?","54","56","64","48",B,"7 × 8 = 56"
science,6,"Physics","Which planet has rings?","Mars","Venus","Saturn","Jupiter",C,"Saturn is famous for its prominent ring system"
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// strips a leading question-number prefix like "Q1.", "Q95)", "Q 12:" from question text
const QUESTION_PREFIX_RE = /^\s*Q\s*\.?\s*\d+\s*[.):-]?\s*/i;
const stripQuestionPrefix = (text) => (text || "").replace(QUESTION_PREFIX_RE, "");

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleQuestion(q) {
  const order = shuffle(q.options.map((_, i) => i));
  return { ...q, options: order.map((i) => q.options[i]), correct: order.indexOf(q.correct) };
}

function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function tierFor(pct) {
  if (pct >= 90) return { tier: "gold",   label: "Gold"   };
  if (pct >= 70) return { tier: "silver", label: "Silver" };
  if (pct >= 50) return { tier: "bronze", label: "Bronze" };
  return null;
}

// links to a Google search in AI Mode (udm=50) for a deeper explanation of a question's solution
function knowMoreUrl(questionText) {
  const query = `Solution for ${questionText}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=50`;
}

/* ---- XP / levels / badges ---- */

const TIER_XP = { gold: 30, silver: 15, bronze: 5 };

function xpForAttempt(a) {
  const pct = Math.round((a.score / a.total) * 100);
  const tier = tierFor(pct);
  return a.score * 10 + (tier ? TIER_XP[tier.tier] : 0);
}

function totalXP(attempts) {
  return attempts.reduce((sum, a) => sum + xpForAttempt(a), 0);
}

// each level needs 50 more XP than the last: L1=100, L2=150, L3=200 …
function xpToFinishLevel(level) {
  return 100 + (level - 1) * 50;
}

function levelInfo(xp) {
  let level = 1, into = xp;
  while (into >= xpToFinishLevel(level)) { into -= xpToFinishLevel(level); level++; }
  return { level, into, need: xpToFinishLevel(level) };
}

const BADGES = [
  { id: "first-steps", label: "First Steps", icon: Play,
    hint: "Finish your first practice round.",
    test: (s) => s.roundsDone >= 1 },
  { id: "subject-explorer", label: "Subject Explorer", icon: Compass,
    hint: "Try a practice round in all 4 subjects.",
    test: (s) => s.subjectsTried >= 4 },
  { id: "question-crusher", label: "Question Crusher", icon: Zap,
    hint: "Answer 100 questions in total.",
    test: (s) => s.questionsAnswered >= 100 },
  { id: "perfect-round", label: "Perfect Round", icon: Star,
    hint: "Score 100% on any practice round.",
    test: (s) => s.hasPerfect },
  { id: "gold-rush", label: "Gold Rush", icon: Trophy,
    hint: "Earn 5 gold stamps.",
    test: (s) => s.goldCount >= 5 },
  { id: "on-a-roll", label: "On a Roll", icon: Flame,
    hint: "Complete 10 practice rounds.",
    test: (s) => s.roundsDone >= 10 },
];

function badgeStats(attempts) {
  return {
    roundsDone: attempts.length,
    questionsAnswered: attempts.reduce((sum, a) => sum + a.total, 0),
    subjectsTried: new Set(attempts.map((a) => a.subject)).size,
    hasPerfect: attempts.some((a) => a.total > 0 && a.score === a.total),
    goldCount: attempts.filter((a) => tierFor(Math.round((a.score / a.total) * 100))?.tier === "gold").length,
  };
}

function computeBadges(attempts) {
  const stats = badgeStats(attempts);
  return BADGES.map((b) => ({ ...b, unlocked: b.test(stats) }));
}

/* ---- topic analytics ---- */

// per-subject+topic breakdown across a set of attempts, classified strong / average / needs improvement
function computeTopicStats(attempts, allQuestions) {
  const qById = new Map(allQuestions.map((q) => [q.id, q]));
  const buckets = {};
  attempts.forEach((a) => {
    a.answers.forEach((ans) => {
      const topic = qById.get(ans.id)?.topic || "uncategorized";
      const key = `${ans.subject}:${topic}`;
      if (!buckets[key]) buckets[key] = { subject: ans.subject, topic, correct: 0, total: 0, skipped: 0 };
      const b = buckets[key];
      b.total += 1;
      if (ans.selected === null) b.skipped += 1;
      else if (ans.selected === ans.correctIndex) b.correct += 1;
    });
  });
  return Object.values(buckets).map((b) => {
    const pct = Math.round((b.correct / b.total) * 100);
    const tier = b.total < 3 ? "learning" : pct >= 75 ? "strong" : pct >= 50 ? "average" : "needs-improvement";
    return { ...b, pct, tier };
  });
}

const avg = (arr) => arr.reduce((s, n) => s + n, 0) / arr.length;

// simple pattern detection: topics that get skipped a lot, and topics trending up/down over time
function detectPatterns(attempts, allQuestions) {
  const qById = new Map(allQuestions.map((q) => [q.id, q]));
  const patterns = [];

  computeTopicStats(attempts, allQuestions)
    .filter((s) => s.total >= 3 && s.skipped / s.total >= 0.4)
    .forEach((s) => patterns.push(`Often leaves ${topicLabel(s.subject, s.topic)} questions unanswered — may be short on time or unsure of the topic.`));

  const sorted = [...attempts].sort((a, b) => new Date(a.date) - new Date(b.date));
  const sequences = {};
  sorted.forEach((a) => {
    a.answers.forEach((ans) => {
      if (ans.selected === null) return;
      const topic = qById.get(ans.id)?.topic || "uncategorized";
      const key = `${ans.subject}:${topic}`;
      (sequences[key] ||= []).push(ans.selected === ans.correctIndex ? 1 : 0);
    });
  });
  Object.entries(sequences).forEach(([key, seq]) => {
    if (seq.length < 6) return;
    const mid = Math.floor(seq.length / 2);
    const firstPct = avg(seq.slice(0, mid)) * 100;
    const secondPct = avg(seq.slice(mid)) * 100;
    const [subject, topic] = key.split(":");
    if (secondPct - firstPct >= 20) patterns.push(`Improving in ${topicLabel(subject, topic)} — up from ${Math.round(firstPct)}% to ${Math.round(secondPct)}%.`);
    else if (firstPct - secondPct >= 20) patterns.push(`Slipping in ${topicLabel(subject, topic)} — down from ${Math.round(firstPct)}% to ${Math.round(secondPct)}%.`);
  });

  return patterns.slice(0, 6);
}

/* ---- CSV parser ---- */

// accepts either a topic id ("number-system") or its display label
// ("Number System & Arithmetic"), case-insensitively; falls back to "uncategorized"
function resolveTopic(subject, raw) {
  if (!raw) return "uncategorized";
  const norm = raw.trim().toLowerCase();
  const match = topicsForSubject(subject).find((t) => t.id === norm || t.label.toLowerCase() === norm);
  return match ? match.id : "uncategorized";
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { questions: [], errors: ["File appears empty"] };
  const errors = [];
  const questions = [];
  // skip header row (index 0)
  lines.slice(1).forEach((raw, idx) => {
    const row = idx + 2; // 1-based including header
    // handle quoted fields with commas inside
    const cols = [];
    let cur = "", inQ = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());

    if (cols.length < 9) { errors.push(`Row ${row}: need at least 9 columns (got ${cols.length})`); return; }
    // topic is optional: accept the older 9-column layout (no topic) alongside the
    // current 10-column one (subject,grade,topic,question,...)
    const hasTopicCol = cols.length >= 10;
    const [subj, gradeStr, ...rest] = cols;
    const [topicRaw, question, optA, optB, optC, optD, correctLetter, solution] =
      hasTopicCol ? rest : [undefined, ...rest];

    const subject = subj.toLowerCase().trim();
    if (!SUBJECTS[subject]) { errors.push(`Row ${row}: unknown subject '${subj}'. Use math/science/english/reasoning`); return; }

    const grade = parseInt(gradeStr, 10);
    if (!GRADES.includes(grade)) { errors.push(`Row ${row}: grade must be 4–8, got '${gradeStr}'`); return; }

    const correctMap = { A: 0, B: 1, C: 2, D: 3 };
    const correct = correctMap[correctLetter.toUpperCase().trim()];
    if (correct === undefined) { errors.push(`Row ${row}: 'correct' must be A/B/C/D, got '${correctLetter}'`); return; }

    if (!question) { errors.push(`Row ${row}: question text is empty`); return; }

    const topic = resolveTopic(subject, topicRaw);

    questions.push({
      id: uid(),
      subject,
      grade,
      topic,
      q: stripQuestionPrefix(question),
      options: [optA, optB, optC, optD],
      correct,
      solution: solution || "",
    });
  });
  return { questions, errors };
}

/* ------------------------------------------------------------------ */
/*  Small UI atoms                                                      */
/* ------------------------------------------------------------------ */

function Stamp({ subjectKey, tier, label, size = 84 }) {
  const subj = SUBJECTS[subjectKey];
  const col = subj ? subj.color : (tier === "gold" ? "#B8860B" : tier === "silver" ? "#7A7F8A" : "#9C6B2E");
  return (
    <div className="stamp" style={{ width: size, height: size, borderColor: col, color: col }}>
      <div className="stamp-inner" style={{ borderColor: col }}>
        {subj && <subj.icon size={size * 0.26} strokeWidth={2.2} />}
        <span className="stamp-label">{label}</span>
      </div>
    </div>
  );
}


function GradeChips({ selected, onChange, style = {} }) {
  return (
    <div className="chip-row" style={style}>
      {GRADES.map((g) => (
        <button key={g}
          className={`chip ${selected === g ? "chip-active chip-grade" : "chip-grade"}`}
          onClick={() => onChange(g)}>
          Gr {g}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main App                                                            */
/* ------------------------------------------------------------------ */

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [account, setAccount] = useState(null); // { id, email, isAdmin }
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [authError, setAuthError] = useState("");

  const [students, setStudents] = useState([]);
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [screen, setScreen] = useState("profiles");
  const [gradeQuestions, setGradeQuestions] = useState([]); // questions for the current student's grade
  const [attempts, setAttempts] = useState([]);
  const [lastAttempt, setLastAttempt] = useState(null);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [flaggedByQuestion, setFlaggedByQuestion] = useState({}); // { [questionId]: reason } — this session only
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAvatar, setNewProfileAvatar] = useState(AVATARS[0]);
  const [newProfileGrade, setNewProfileGrade] = useState(5);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [setupSubject, setSetupSubject] = useState("math");
  const [setupGrade, setSetupGrade] = useState(null); // always overwritten from profile in openSetup
  const [setupCount, setSetupCount] = useState(10);
  const [setupMinutes, setSetupMinutes] = useState(15);

  const [examQuestions, setExamQuestions] = useState([]);
  const [examIndex, setExamIndex] = useState(0);
  const [examAnswers, setExamAnswers] = useState({});
  const [remaining, setRemaining] = useState(0);
  const [examTotalSec, setExamTotalSec] = useState(0);
  const timerRef = useRef(null);

  const [newQ, setNewQ] = useState({ subject: "math", grade: 5, topic: topicsForSubject("math")[0].id, q: "", options: ["","","",""], correct: 0, solution: "" });
  const [csvImport, setCsvImport] = useState({ status: "idle", errors: [], count: 0 }); // idle | success | error
  const [adminQuestions, setAdminQuestions] = useState([]);
  const [adminFlags, setAdminFlags] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminAnalytics, setAdminAnalytics] = useState({ totalAttempts: 0, totalStudents: 0, topics: [] });
  const [adminAnalyticsLoading, setAdminAnalyticsLoading] = useState(false);

  // on load, check for an existing session before deciding whether to show the auth screen
  useEffect(() => {
    (async () => {
      try {
        const acct = await api.me();
        setAccount(acct);
        setStudents(await api.listStudents());
      } catch {
        setAccount(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  // safety net: never render an admin screen for a non-admin session
  useEffect(() => {
    if ((screen === "admin" || screen === "admin-analytics") && !account?.isAdmin) setScreen("profiles");
  }, [screen, account]);

  // load the full question bank + open flags whenever the admin screen is opened
  useEffect(() => {
    if (screen !== "admin" || !account?.isAdmin) return;
    setAdminLoading(true);
    Promise.all([refreshAdminQuestions(), refreshAdminFlags()]).finally(() => setAdminLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, account?.isAdmin]);

  // load cross-student topic analytics whenever that screen is opened
  useEffect(() => {
    if (screen !== "admin-analytics" || !account?.isAdmin) return;
    setAdminAnalyticsLoading(true);
    refreshAdminAnalytics().finally(() => setAdminAnalyticsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, account?.isAdmin]);

  async function handleAuthSubmit(email, password) {
    setAuthError("");
    try {
      const acct = authMode === "signup" ? await api.signup(email, password) : await api.login(email, password);
      setAccount(acct);
      setStudents(await api.listStudents());
      setScreen("profiles");
    } catch (e) {
      setAuthError(e.message);
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    setAccount(null);
    setStudents([]);
    setCurrentStudentId(null);
    setAttempts([]);
    setGradeQuestions([]);
    setScreen("profiles");
  }

  async function refreshAdminQuestions() {
    const rows = await api.adminListQuestions();
    setAdminQuestions(rows.map(mapQuestion));
  }

  async function refreshAdminFlags() {
    setAdminFlags(await api.adminListFlags());
  }

  async function refreshAdminAnalytics() {
    setAdminAnalytics(await api.adminAnalytics());
  }

  const currentProfile = students.find((p) => p.id === currentStudentId) || null;

  // counts per subject for the setup screen — gradeQuestions is already scoped
  // to the current student's grade, so no separate grade key is needed here.
  const countsBySubject = useMemo(() => {
    const c = {};
    gradeQuestions.forEach((q) => { c[q.subject] = (c[q.subject] || 0) + 1; });
    return c;
  }, [gradeQuestions]);

  function availableFor(subject) {
    return countsBySubject[subject] || 0;
  }

  const bestScoreBySubject = useMemo(() => {
    const best = {};
    attempts.forEach((a) => {
      const pct = Math.round((a.score / a.total) * 100);
      if (!best[a.subject] || pct > best[a.subject]) best[a.subject] = pct;
    });
    return best;
  }, [attempts]);

  const level = useMemo(() => levelInfo(totalXP(attempts)), [attempts]);
  const badges = useMemo(() => computeBadges(attempts), [attempts]);

  // XP/level-up/new-badge summary for the results screen — only meaningful right
  // after a fresh submit, when the attempt being shown is the newest one.
  const resultsMeta = useMemo(() => {
    if (!lastAttempt || attempts[0]?.id !== lastAttempt.id) return null;
    const priorAttempts = attempts.slice(1);
    const priorLevel = levelInfo(totalXP(priorAttempts)).level;
    const priorBadgeIds = new Set(computeBadges(priorAttempts).filter((b) => b.unlocked).map((b) => b.id));
    return {
      xpGained: xpForAttempt(lastAttempt),
      leveledUpTo: level.level > priorLevel ? level.level : null,
      newBadges: badges.filter((b) => b.unlocked && !priorBadgeIds.has(b.id)),
    };
  }, [attempts, lastAttempt, badges, level]);

  /* ---- profile actions ---- */

  async function addProfile() {
    const name = newProfileName.trim();
    if (!name) return;
    const student = await api.addStudent({ name, avatar: newProfileAvatar, grade: newProfileGrade });
    setStudents((s) => [...s, student]);
    setNewProfileName("");
  }

  async function deleteProfile(id) {
    await api.deleteStudent(id);
    setStudents((s) => s.filter((p) => p.id !== id));
    setConfirmDelete(null);
    if (currentStudentId === id) { setCurrentStudentId(null); setScreen("profiles"); }
  }

  async function selectProfile(p) {
    setCurrentStudentId(p.id);
    setSetupGrade(p.grade || 5);
    const [qRows, aRows] = await Promise.all([
      api.listQuestions({ grade: p.grade }),
      api.listAttempts(p.id),
    ]);
    setGradeQuestions(qRows.map(mapQuestion));
    setAttempts(aRows.map(mapAttempt));
    setFlaggedByQuestion({});
    setScreen("dashboard");
  }

  /* ---- exam setup / flow ---- */

  function openSetup(subject) {
    const subj = subject || setupSubject;
    // Always derive grade from the current profile so we never use stale state.
    const profileGrade = currentProfile?.grade || 5;
    setSetupSubject(subj);
    setSetupGrade(profileGrade);
    const avail = availableFor(subj);
    const safeCount = Math.min(setupCount, Math.max(avail, 1));
    setSetupCount(safeCount);
    setSetupMinutes(Math.max(5, Math.round(safeCount * 1.5)));
    setScreen("setup");
  }

  function startExam() {
    const pool = gradeQuestions.filter((q) => q.subject === setupSubject && q.grade === setupGrade);
    // Prefer questions this student hasn't seen yet in this subject, so back-to-back
    // rounds don't repeat — only reusing already-seen ones once the pool runs out.
    const seenIds = new Set(
      attempts.filter((a) => a.subject === setupSubject).flatMap((a) => a.answers.map((ans) => ans.id))
    );
    const unseen = shuffle(pool.filter((q) => !seenIds.has(q.id)));
    const seen = shuffle(pool.filter((q) => seenIds.has(q.id)));
    const picked = [...unseen, ...seen].slice(0, Math.min(setupCount, pool.length)).map(shuffleQuestion);
    setExamQuestions(picked);
    setExamIndex(0);
    setExamAnswers({});
    setExamTotalSec(setupMinutes * 60);
    setRemaining(setupMinutes * 60);
    setScreen("exam");
  }

  const submitExam = useCallback(async () => {
    clearInterval(timerRef.current);
    setExamQuestions((qs) => {
      const answersArr = qs.map((q) => ({
        id: q.id, subject: q.subject, grade: q.grade,
        question: q.q, options: q.options,
        correctIndex: q.correct, solution: q.solution,
        selected: examAnswers[q.id] !== undefined ? examAnswers[q.id] : null,
      }));
      (async () => {
        const submitted = await api.submitAttempt({
          studentId: currentStudentId, subject: setupSubject, grade: setupGrade,
          timeTakenSec: examTotalSec - remaining, answers: answersArr,
        });
        const attempt = mapAttempt(submitted);
        setAttempts((prev) => [attempt, ...prev]);
        setLastAttempt(attempt);
        setReviewFilter("all");
        setScreen("results");
      })();
      return qs;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examAnswers, setupSubject, setupGrade, examTotalSec, remaining, currentStudentId]);

  useEffect(() => {
    if (screen !== "exam") return;
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(timerRef.current); submitExam(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function selectAnswer(qId, idx) {
    setExamAnswers((a) => ({ ...a, [qId]: idx }));
  }

  /* ---- admin: question bank management ---- */

  async function addAdminQuestion() {
    const cleaned = newQ.options.map((o) => o.trim());
    if (!newQ.q.trim() || cleaned.some((o) => !o) || !newQ.solution.trim()) return;
    await api.adminAddQuestion({
      subject: newQ.subject, grade: newQ.grade, topic: newQ.topic,
      questionText: stripQuestionPrefix(newQ.q.trim()), options: cleaned,
      correctIndex: newQ.correct, solution: newQ.solution.trim(),
    });
    await refreshAdminQuestions();
    setNewQ({ ...newQ, q: "", options: ["","","",""], correct: 0, solution: "" });
  }

  async function deleteAdminQuestion(id) {
    await api.adminDeleteQuestion(id);
    await refreshAdminQuestions();
  }

  /* ---- CSV upload ---- */

  async function handleCSVUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const text = await file.text();
    const { questions, errors } = parseCSV(text);
    if (questions.length === 0) {
      setCsvImport({ status: "error", errors: errors.length ? errors : ["No valid rows found"], count: 0 });
      return;
    }
    const payload = questions.map((q) => ({
      subject: q.subject, grade: q.grade, topic: q.topic,
      questionText: q.q, options: q.options, correctIndex: q.correct, solution: q.solution,
    }));
    const result = await api.adminBulkQuestions(payload);
    await refreshAdminQuestions();
    setCsvImport({ status: "success", errors: [...errors, ...result.errors], count: result.inserted });
  }

  /* ---- question flags (report a bad question for review) ---- */

  async function flagQuestion(q, reason) {
    if (!currentStudentId) return;
    await api.flagQuestion({ studentId: currentStudentId, questionId: q.id, reason });
    setFlaggedByQuestion((prev) => ({ ...prev, [q.id]: reason }));
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "olympiad-questions-template.csv";
    a.click();
  }

  /* ---- render ---- */

  if (authLoading) return <Shell><div className="loading">Loading your practice trail…</div></Shell>;

  if (!account) {
    return (
      <Shell>
        <AuthScreen mode={authMode} setMode={setAuthMode} error={authError} onSubmit={handleAuthSubmit} />
        <GlobalStyle />
      </Shell>
    );
  }

  return (
    <Shell>
      <Header profile={currentProfile} level={currentProfile ? level.level : null} isAdmin={screen === "admin"}
        account={account}
        onHome={() => setScreen(currentProfile ? "dashboard" : "profiles")}
        onSwitch={() => setScreen("profiles")}
        onLogout={handleLogout} />

      {screen === "profiles" && (
        <ProfilesScreen
          profiles={students}
          newProfileName={newProfileName} setNewProfileName={setNewProfileName}
          newProfileAvatar={newProfileAvatar} setNewProfileAvatar={setNewProfileAvatar}
          newProfileGrade={newProfileGrade} setNewProfileGrade={setNewProfileGrade}
          addProfile={addProfile} selectProfile={selectProfile}
          confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
          deleteProfile={deleteProfile}
          showAdminEntry={!!account.isAdmin}
          onAdminClick={() => setScreen("admin")}
        />
      )}

      {screen === "dashboard" && currentProfile && (
        <DashboardScreen
          profile={currentProfile}
          allQuestions={gradeQuestions}
          bestScoreBySubject={bestScoreBySubject}
          attempts={attempts}
          level={level}
          badges={badges}
          onStart={openSetup}
          onAnalytics={() => setScreen("analytics")}
          onViewAttempt={(a) => { setLastAttempt(a); setReviewFilter("all"); setScreen("review"); }}
        />
      )}

      {screen === "analytics" && currentProfile && (
        <AnalyticsScreen
          attempts={attempts} allQuestions={gradeQuestions}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {screen === "setup" && (
        <SetupScreen
          subject={setupSubject}
          setSubject={(s) => { setSetupSubject(s); setSetupCount(Math.min(setupCount, Math.max(availableFor(s), 1))); }}
          grade={setupGrade}
          count={setupCount} setCount={setSetupCount}
          minutes={setupMinutes} setMinutes={setSetupMinutes}
          available={availableFor(setupSubject)}
          onBack={() => setScreen("dashboard")}
          onStart={startExam}
        />
      )}

      {screen === "exam" && examQuestions.length > 0 && (
        <ExamScreen
          questions={examQuestions} index={examIndex} setIndex={setExamIndex}
          answers={examAnswers} onSelect={selectAnswer}
          remaining={remaining} onSubmit={submitExam}
        />
      )}

      {screen === "results" && lastAttempt && (
        <ResultsScreen attempt={lastAttempt} meta={resultsMeta} allQuestions={gradeQuestions}
          onReview={() => { setReviewFilter("all"); setScreen("review"); }}
          onDone={() => setScreen("dashboard")} />
      )}

      {screen === "review" && lastAttempt && (
        <ReviewScreen attempt={lastAttempt}
          filter={reviewFilter} setFilter={setReviewFilter}
          flags={flaggedByQuestion} onFlag={flagQuestion}
          onBack={() => setScreen("dashboard")} />
      )}

      {screen === "admin" && account.isAdmin && (
        <ManageScreen
          allQuestions={adminQuestions} loading={adminLoading}
          newQ={newQ} setNewQ={setNewQ}
          onAdd={addAdminQuestion} onDeleteQuestion={deleteAdminQuestion}
          onCSVUpload={handleCSVUpload} onDownloadTemplate={downloadTemplate}
          csvImport={csvImport} setCsvImport={setCsvImport}
          flags={adminFlags}
          onResolveFlag={async (id) => { await api.adminResolveFlag(id); await refreshAdminFlags(); }}
          onViewAnalytics={() => setScreen("admin-analytics")}
          onBack={() => setScreen("profiles")}
        />
      )}

      {screen === "admin-analytics" && account.isAdmin && (
        <AdminAnalyticsScreen
          data={adminAnalytics} loading={adminAnalyticsLoading}
          onBack={() => setScreen("admin")}
        />
      )}

      <GlobalStyle />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/*  Shell / Header                                                      */
/* ------------------------------------------------------------------ */

function Shell({ children }) { return <div className="shell">{children}</div>; }

function Header({ profile, level, isAdmin, account, onHome, onSwitch, onLogout }) {
  return (
    <div className="header">
      <button className="brand" onClick={onHome}>
        <span className="brand-mark">⊙</span>
        <span className="brand-text">
          <span className="brand-title">Olympiad Trail</span>
          <span className="brand-sub">practice · review · improve</span>
        </span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isAdmin ? (
          <button className="profile-pill admin-pill" onClick={onSwitch} title="Exit admin">
            <Shield size={14} /> <span>Admin</span> <LogOut size={13} />
          </button>
        ) : profile && (
          <button className="profile-pill" onClick={onSwitch} title="Switch explorer">
            <span className="profile-avatar">{profile.avatar}</span>
            <span>{profile.name}</span>
            <span className="grade-badge">Gr {profile.grade}</span>
            {level != null && <span className="level-badge">Lv {level}</span>}
            <Users size={14} />
          </button>
        )}
        {account && (
          <button className="mini-btn ghost" onClick={onLogout} title={`Sign out (${account.email})`}>
            <LogOut size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Profiles                                                            */
/* ------------------------------------------------------------------ */

function ProfilesScreen({
  profiles, newProfileName, setNewProfileName,
  newProfileAvatar, setNewProfileAvatar,
  newProfileGrade, setNewProfileGrade,
  addProfile, selectProfile, confirmDelete, setConfirmDelete, deleteProfile,
  showAdminEntry, onAdminClick,
}) {
  return (
    <div className="screen screen-wide fade-in">
      <div className="row-between">
        <div>
          <h1 className="page-title">Who's practicing today?</h1>
          <p className="page-sub">Pick your explorer, or create a new one with their grade to start a personalised trail.</p>
        </div>
        {showAdminEntry && (
          <button className="admin-entry" onClick={onAdminClick}>
            <Shield size={13} /> Admin
          </button>
        )}
      </div>

      {profiles.length > 0 && (
        <p className="hint-text" style={{ margin: "0 0 16px" }}>
          👉 Click your avatar below to start practicing!
        </p>
      )}

      <div className="profile-grid">
        {profiles.map((p) => (
          <div key={p.id} className="profile-card">
            <button className="profile-card-btn" onClick={() => selectProfile(p)}>
              <span className="profile-card-avatar">{p.avatar}</span>
              <span className="profile-card-name">{p.name}</span>
              <span className="profile-card-grade">
                <GraduationCap size={12} /> Grade {p.grade || "?"}
              </span>
            </button>
            {confirmDelete === p.id ? (
              <button className="mini-btn danger" onClick={() => deleteProfile(p.id)}>Confirm remove</button>
            ) : (
              <button className="mini-btn ghost" onClick={() => setConfirmDelete(p.id)}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}

        <div className="profile-card new-card">
          <div className="avatar-picker">
            {AVATARS.map((a) => (
              <button key={a} className={`avatar-opt ${a === newProfileAvatar ? "avatar-opt-selected" : ""}`}
                onClick={() => setNewProfileAvatar(a)}>{a}</button>
            ))}
          </div>
          <input className="text-input" placeholder="Explorer's name" value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProfile()} maxLength={20} />
          <label className="field-label" style={{ marginTop: 4 }}>Grade</label>
          <GradeChips selected={newProfileGrade} onChange={setNewProfileGrade} />
          <button className="btn primary full" style={{ marginTop: 12 }} onClick={addProfile} disabled={!newProfileName.trim()}>
            <Plus size={16} /> Add explorer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Family sign-in / sign-up                                           */
/* ------------------------------------------------------------------ */

function AuthScreen({ mode, setMode, error, onSubmit }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isSignup = mode === "signup";
  const canSubmit = email.trim().length > 3 && password.length >= (isSignup ? 8 : 1);

  return (
    <div className="screen fade-in auth-screen">
      <div className="auth-layout">
        <div className="auth-intro">
          <h1 className="page-title">Olympiad Trail</h1>
          <p className="auth-intro-text">
            Olympiad exams are enrichment tests in Math, Science, English, and
            Reasoning that go beyond the regular school curriculum. Held in
            dozens of countries and taken by millions of students each year,
            they're a globally recognized way to spot and grow strong
            problem-solvers.
          </p>
          <p className="auth-intro-text">
            <strong>Olympiad Trail is a free practice space for Grades 4–8</strong> —
            no cost, no limits.
          </p>
          <ul className="auth-highlights">
            <li><Clock size={15} /> Timed practice rounds</li>
            <li><Check size={15} /> Instant scoring & worked solutions</li>
            <li><BarChart3 size={15} /> Analytics to spot exactly what to improve</li>
          </ul>
        </div>

        <div className="auth-form-col">
          <p className="page-sub center" style={{ marginTop: 0 }}>
            {isSignup ? "Create a family account to get started." : "Sign in to your family account."}
          </p>

          <div className="setup-card" style={{ maxWidth: 380, width: "100%" }}>
            <label className="field-label" style={{ marginTop: 0 }}>Email</label>
            <input type="email" className="text-input" value={email} autoFocus
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && onSubmit(email, password)} />

            <label className="field-label">Password</label>
            <input type="password" className="text-input" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && onSubmit(email, password)} />
            {isSignup && <p className="hint-text">Use at least 8 characters.</p>}

            {error && <p className="hint-text" style={{ color: "#C6435E" }}>{error}</p>}

            <button className="btn primary full lg" style={{ marginTop: 16 }} disabled={!canSubmit}
              onClick={() => onSubmit(email, password)}>
              {isSignup ? "Create account & continue" : "Sign in"}
            </button>

            <button className="link-btn center" style={{ marginTop: 12 }}
              onClick={() => setMode(isSignup ? "login" : "signup")}>
              {isSignup ? "Already have an account? Sign in" : "New family? Create an account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                           */
/* ------------------------------------------------------------------ */

function DashboardScreen({ profile, allQuestions, bestScoreBySubject, attempts, level, badges, onStart, onAnalytics, onViewAttempt }) {
  const grade = profile.grade || 5;

  const countsBySubject = useMemo(() => {
    const c = {};
    Object.keys(SUBJECTS).forEach((k) => (c[k] = 0));
    allQuestions.filter((q) => q.grade === grade).forEach((q) => { c[q.subject] = (c[q.subject] || 0) + 1; });
    return c;
  }, [allQuestions, grade]);

  const stamps = attempts
    .map((a) => ({ a, tier: tierFor(Math.round((a.score / a.total) * 100)) }))
    .filter((x) => x.tier).slice(0, 10);

  return (
    <div className="screen fade-in">
      <h1 className="page-title">Welcome back, {profile.name} {profile.avatar}</h1>
      <p className="page-sub">Grade {grade} questions ready. Choose a subject to start.</p>

      <div className="level-card">
        <div className="level-badge-lg">Lv {level.level}</div>
        <div className="level-bar-wrap">
          <div className="level-bar-top">
            <span>Level {level.level}</span>
            <span>{level.into} / {level.need} XP</span>
          </div>
          <div className="level-bar"><div className="level-bar-fill" style={{ width: `${Math.min(100, (level.into / level.need) * 100)}%` }} /></div>
        </div>
      </div>

      {attempts.length > 0 && (
        <button className="link-btn analytics-link" onClick={onAnalytics}>
          <BarChart3 size={13} /> See topic-by-topic analytics →
        </button>
      )}

      <div className="subject-grid">
        {Object.entries(SUBJECTS).map(([key, s]) => (
          <button key={key} className="subject-card" style={{ "--accent": s.color, "--accent-soft": s.soft }} onClick={() => onStart(key)}>
            <div className="subject-icon"><s.icon size={26} strokeWidth={2} /></div>
            <div className="subject-name">{s.label}</div>
            <div className="subject-meta">{countsBySubject[key] || 0} Gr {grade} questions</div>
            {bestScoreBySubject[key] !== undefined && (
              <div className="subject-best">Best: {bestScoreBySubject[key]}%</div>
            )}
          </button>
        ))}
      </div>

      <h2 className="section-title">Stamp collection</h2>

      {stamps.length === 0 ? (
        <div className="empty-box">No stamps yet — score 50%+ to earn one.</div>
      ) : (
        <div className="stamp-row">
          {stamps.map(({ a, tier }) => (
            <div key={a.id} className="stamp-item" onClick={() => onViewAttempt(a)}>
              <Stamp subjectKey={a.subject} tier={tier.tier} label={tier.label} size={68} />
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Badges</h2>
      <div className="badge-grid">
        {badges.map((b) => (
          <div key={b.id} className={`badge-item ${b.unlocked ? "badge-unlocked" : "badge-locked"}`} title={b.hint}>
            <div className="badge-icon">{b.unlocked ? <b.icon size={22} /> : <Lock size={16} />}</div>
            <span className="badge-label">{b.label}</span>
          </div>
        ))}
      </div>

      <h2 className="section-title">Recent attempts</h2>
      {attempts.length === 0 ? (
        <div className="empty-box">No attempts yet. Start your first practice round above!</div>
      ) : (
        <div className="attempt-list">
          {attempts.slice(0, 8).map((a) => {
            const subj = SUBJECTS[a.subject];
            const pct = Math.round((a.score / a.total) * 100);
            return (
              <button key={a.id} className="attempt-row" onClick={() => onViewAttempt(a)} style={{ "--accent": subj.color }}>
                <span className="attempt-subject"><subj.icon size={16} /> {subj.label}</span>
                <span className="attempt-grade-tag">Gr {a.grade || "?"}</span>
                <span className="attempt-score">{a.score}/{a.total} · {pct}%</span>
                <span className="attempt-date">{new Date(a.date).toLocaleDateString()}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Setup                                                               */
/* ------------------------------------------------------------------ */

function SetupScreen({ subject, setSubject, grade, count, setCount, minutes, setMinutes, available, onBack, onStart }) {
  const s = SUBJECTS[subject];
  return (
    <div className="screen fade-in">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back</button>
      <h1 className="page-title">Set up your practice round</h1>
      <p className="page-sub">Grade {grade} practice — pick a subject below.</p>

      <div className="setup-card setup-card-narrow">
        <label className="field-label">Subject</label>
        <div className="chip-row">
          {Object.entries(SUBJECTS).map(([key, sub]) => (
            <button key={key} className={`chip ${subject === key ? "chip-active" : ""}`}
              style={{ "--accent": sub.color, "--accent-soft": sub.soft }} onClick={() => setSubject(key)}>
              <sub.icon size={15} /> {sub.label}
            </button>
          ))}
        </div>

        <label className="field-label">Questions ({available} available for Grade {grade})</label>
        <div className="chip-row">
          {COUNT_OPTIONS.filter((c) => c <= Math.max(available, 1) || c === COUNT_OPTIONS[0]).map((c) => (
            <button key={c} className={`chip ${count === c ? "chip-active" : ""}`}
              style={{ "--accent": s.color, "--accent-soft": s.soft }}
              onClick={() => setCount(Math.min(c, Math.max(available, 1)))}>
              {Math.min(c, available) || c}
            </button>
          ))}
        </div>

        <label className="field-label">Time limit</label>
        <div className="stepper">
          <button className="stepper-btn" onClick={() => setMinutes((m) => Math.max(5, m - 1))}><Minus size={15} /></button>
          <span className="stepper-value">{minutes} min</span>
          <button className="stepper-btn" onClick={() => setMinutes((m) => Math.min(90, m + 1))}><Plus size={15} /></button>
        </div>

        <button className="btn primary full lg" onClick={onStart} disabled={available === 0} style={{ marginTop: 20 }}>
          <Play size={17} /> Start exam
        </button>
        {available === 0 && (
          <p className="hint-text">No Grade {grade} questions for {SUBJECTS[subject].label} yet — upload a CSV or add one manually in the question bank.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exam                                                                */
/* ------------------------------------------------------------------ */

function ExamScreen({ questions, index, setIndex, answers, onSelect, remaining, onSubmit }) {
  const q = questions[index];
  const s = SUBJECTS[q.subject];
  const isLast = index === questions.length - 1;
  const answeredCount = Object.keys(answers).length;
  const low = remaining <= 30;

  // tracks every question index the learner has looked at, so we can tell
  // "skipped" (visited, left unanswered) apart from "not visited yet"
  const [visited, setVisited] = useState(() => new Set([index]));
  useEffect(() => {
    setVisited((v) => (v.has(index) ? v : new Set(v).add(index)));
  }, [index]);

  const statuses = questions.map((qq, i) => {
    if (i === index) return "current";
    if (answers[qq.id] !== undefined) return "answered";
    if (visited.has(i)) return "skipped";
    return "unvisited";
  });
  const skippedCount = statuses.filter((st) => st === "skipped").length;
  const unvisitedCount = statuses.filter((st) => st === "unvisited").length;

  return (
    <div className="screen screen-wide fade-in exam-screen" style={{ "--accent": s.color }}>
      <div className="exam-top">
        <span className="exam-subject"><s.icon size={16} /> {s.label} · Gr {q.grade}</span>
        <span className={`exam-timer ${low ? "exam-timer-low" : ""}`}><Clock size={15} /> {formatTime(remaining)}</span>
      </div>

      <div className="dots">
        {statuses.map((st, i) => (
          <button key={i} className={`dot dot-${st}`} onClick={() => setIndex(i)} aria-label={`Q${i + 1}`} />
        ))}
      </div>

      <div className="exam-layout">
        <div className="exam-main">
          <div className="question-card">
            <div className="question-count">Question {index + 1} of {questions.length}</div>
            <div className="question-text">{q.q}</div>
            <div className="option-list">
              {q.options.map((opt, i) => (
                <button key={i} className={`option-row ${answers[q.id] === i ? "option-selected" : ""}`}
                  onClick={() => onSelect(q.id, i)}>
                  <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="exam-nav">
            <button className="btn ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="exam-progress-text">{answeredCount}/{questions.length} answered</span>
            {isLast
              ? <button className="btn primary" onClick={onSubmit}>Submit <Check size={16} /></button>
              : <button className="btn primary" onClick={() => setIndex((i) => i + 1)}>Next <ChevronRight size={16} /></button>}
          </div>
          {!isLast && <button className="link-btn center" onClick={onSubmit}>Submit now instead →</button>}
        </div>

        <aside className="exam-tracker">
          <div className="exam-tracker-title">Question tracker</div>
          <div className="exam-tracker-grid">
            {statuses.map((st, i) => (
              <button key={i} className={`tracker-cell tracker-${st}`} onClick={() => setIndex(i)} aria-label={`Go to question ${i + 1}`}>
                {i + 1}
              </button>
            ))}
          </div>
          <div className="exam-tracker-legend">
            <span><i className="legend-dot legend-answered" /> Answered ({answeredCount})</span>
            <span><i className="legend-dot legend-skipped" /> Skipped ({skippedCount})</span>
            <span><i className="legend-dot legend-unvisited" /> Not visited ({unvisitedCount})</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Results                                                             */
/* ------------------------------------------------------------------ */

function ResultsScreen({ attempt, meta, allQuestions, onReview, onDone }) {
  const pct = Math.round((attempt.score / attempt.total) * 100);
  const t = tierFor(pct);
  const unanswered = attempt.answers.filter((a) => a.selected === null).length;
  const topicStats = useMemo(() => computeTopicStats([attempt], allQuestions), [attempt, allQuestions]);
  return (
    <div className="screen fade-in center-col">
      {t ? (
        <div className="stamp-reveal">
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const dx = Math.round(Math.cos(angle) * 65);
            const dy = Math.round(Math.sin(angle) * 65);
            return <span key={i} className="confetti-piece" style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, animationDelay: `${i * 18}ms` }} />;
          })}
          <Stamp subjectKey={attempt.subject} tier={t.tier} label={t.label} size={140} />
        </div>
      ) : (
        <div className="try-again-badge"><Sparkles size={30} /></div>
      )}
      <h1 className="page-title center">{pct}% correct</h1>
      <p className="page-sub center">
        {attempt.score} of {attempt.total} correct{unanswered > 0 ? ` · ${unanswered} skipped` : ""} · {formatTime(attempt.timeTakenSec)} used
      </p>
      {!t && <p className="hint-text center">Score 50%+ to earn a stamp — review and try again!</p>}

      {meta && (
        <div className="xp-summary">
          <span className="xp-gained"><Zap size={14} /> +{meta.xpGained} XP</span>
          {meta.leveledUpTo != null && <div className="level-up-banner">🎉 Level up! You're now Level {meta.leveledUpTo}.</div>}
          {meta.newBadges.map((b) => (
            <div key={b.id} className="badge-unlock-banner"><b.icon size={16} /> New badge: {b.label}</div>
          ))}
        </div>
      )}

      {topicStats.length > 0 && (
        <div className="round-topics">
          <div className="round-topics-title">Topics in this round</div>
          <div className="round-topic-chips">
            {topicStats.map((s) => (
              <span key={s.topic} className={`round-topic-chip tier-${s.tier}`}>
                {topicLabel(s.subject, s.topic)} · {s.correct}/{s.total}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="btn-col">
        <button className="btn primary lg" onClick={onReview}>Review answers</button>
        <button className="btn ghost lg" onClick={onDone}>Back to dashboard</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Review                                                              */
/* ------------------------------------------------------------------ */

function ReviewScreen({ attempt, filter, setFilter, flags, onFlag, onBack }) {
  const subj = SUBJECTS[attempt.subject];
  const filtered = attempt.answers.filter((a) => {
    if (filter === "correct") return a.selected === a.correctIndex;
    if (filter === "wrong") return a.selected !== a.correctIndex;
    return true;
  });
  return (
    <div className="screen fade-in">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back</button>
      <h1 className="page-title">
        <subj.icon size={22} style={{ verticalAlign: "-4px", marginRight: 6 }} />
        {subj.label} · Grade {attempt.grade} · Review
      </h1>
      <p className="page-sub">{attempt.score}/{attempt.total} correct · {new Date(attempt.date).toLocaleString()}</p>
      <div className="chip-row" style={{ marginBottom: 20 }}>
        {["all","wrong","correct"].map((f) => (
          <button key={f} className={`chip ${filter === f ? "chip-active" : ""}`}
            style={{ "--accent": subj.color, "--accent-soft": subj.soft }} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "wrong" ? "Wrong only" : "Correct only"}
          </button>
        ))}
      </div>
      <div className="review-list">
        {filtered.map((a, i) => {
          const isCorrect = a.selected === a.correctIndex;
          const isSkipped = a.selected === null;
          return (
            <div key={a.id + i} className={`review-card ${isCorrect ? "review-correct" : isSkipped ? "review-skipped" : "review-wrong"}`}>
              <div className="review-head">
                <span className="review-number">Q{i + 1}</span>
                {isCorrect
                  ? <span className="tag tag-correct"><Check size={12} /> Correct</span>
                  : isSkipped ? <span className="tag tag-skipped">Skipped</span>
                  : <span className="tag tag-wrong"><X size={12} /> Incorrect</span>}
              </div>
              <div className="review-question">{a.question}</div>
              <div className="option-list">
                {a.options.map((opt, oi) => {
                  const isRight = oi === a.correctIndex, isPicked = oi === a.selected;
                  let cls = "review-option";
                  if (isRight) cls += " review-option-correct";
                  else if (isPicked && !isRight) cls += " review-option-wrong";
                  return (
                    <div key={oi} className={cls}>
                      <span className="option-letter">{String.fromCharCode(65 + oi)}</span>
                      <span>{opt}</span>
                      {isRight && <Check size={14} className="option-icon" />}
                      {isPicked && !isRight && <X size={14} className="option-icon" />}
                    </div>
                  );
                })}
              </div>
              <div className="solution-box">
                <span className="solution-label">Why</span>
                <div className="solution-content">
                  <span>{a.solution}</span>
                  <a className="know-more-link" href={knowMoreUrl(a.question)} target="_blank" rel="noopener noreferrer">
                    Know more →
                  </a>
                </div>
              </div>
              {flags[a.id] ? (
                <div className="flag-row flag-row-flagged">
                  <Flag size={12} /> Flagged: {FLAG_REASON_LABEL[flags[a.id]]}
                </div>
              ) : (
                <div className="flag-row">
                  <span className="flag-prompt">Something wrong with this question?</span>
                  {FLAG_REASONS.map((r) => (
                    <button key={r.id} className="flag-btn"
                      onClick={() => onFlag({ id: a.id, subject: a.subject, grade: a.grade, q: a.question }, r.id)}>
                      <Flag size={12} /> {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Analytics                                                           */
/* ------------------------------------------------------------------ */

const TIER_META = {
  strong: { label: "Strong", className: "tier-strong" },
  average: { label: "Average", className: "tier-average" },
  "needs-improvement": { label: "Needs Improvement", className: "tier-needs-improvement" },
  learning: { label: "Still Learning", className: "tier-learning" },
};

function AnalyticsScreen({ attempts, allQuestions, onBack }) {
  const stats = useMemo(() => computeTopicStats(attempts, allQuestions), [attempts, allQuestions]);
  const patterns = useMemo(() => detectPatterns(attempts, allQuestions), [attempts, allQuestions]);

  const bySubject = useMemo(() => {
    const grouped = {};
    stats.forEach((s) => { (grouped[s.subject] ||= []).push(s); });
    Object.values(grouped).forEach((list) => list.sort((a, b) => a.pct - b.pct));
    return grouped;
  }, [stats]);

  if (attempts.length === 0) {
    return (
      <div className="screen fade-in">
        <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back</button>
        <h1 className="page-title">Analytics</h1>
        <div className="empty-box">Complete a practice round to see topic-by-topic analytics here.</div>
      </div>
    );
  }

  return (
    <div className="screen fade-in">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back</button>
      <h1 className="page-title">Analytics</h1>
      <p className="page-sub">Topic-by-topic strengths, based on every practice round so far.</p>

      {patterns.length > 0 && (
        <div className="pattern-card">
          <div className="pattern-card-title"><Lightbulb size={15} /> Patterns we noticed</div>
          <ul className="pattern-list">
            {patterns.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {Object.entries(SUBJECTS).map(([key, s]) => {
        const list = bySubject[key];
        if (!list || list.length === 0) return null;
        return (
          <div key={key} className="topic-subject-block">
            <h2 className="section-title subject-topic-title" style={{ "--accent": s.color }}>
              <s.icon size={17} /> {s.label}
            </h2>
            <div className="topic-list">
              {list.map((t) => {
                const meta = TIER_META[t.tier];
                return (
                  <div key={t.topic} className="topic-row">
                    <div className="topic-row-top">
                      <span className="topic-name">{topicLabel(t.subject, t.topic)}</span>
                      <span className={`topic-tier-tag ${meta.className}`}>{meta.label}</span>
                    </div>
                    <div className="topic-bar"><div className={`topic-bar-fill ${meta.className}`} style={{ width: `${t.pct}%` }} /></div>
                    <div className="topic-row-bottom">
                      {t.correct}/{t.total} correct{t.skipped > 0 ? ` · ${t.skipped} skipped` : ""}
                      {t.total < 3 ? " · more practice needed for a confident read" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Admin: cross-student analytics                                     */
/* ------------------------------------------------------------------ */

function AdminAnalyticsScreen({ data, loading, onBack }) {
  const [gradeFilter, setGradeFilter] = useState("all");

  const topics = useMemo(() => {
    return gradeFilter === "all" ? data.topics : data.topics.filter((t) => String(t.grade) === gradeFilter);
  }, [data.topics, gradeFilter]);

  const bySubject = useMemo(() => {
    const grouped = {};
    topics.forEach((t) => { (grouped[t.subject] ||= []).push(t); });
    Object.values(grouped).forEach((list) => list.sort((a, b) => a.pct - b.pct));
    return grouped;
  }, [topics]);

  // strongest/weakest standouts, ignoring topics with too little data for a confident read
  const confident = topics.filter((t) => t.tier !== "learning");
  const weakest = confident.length ? [...confident].sort((a, b) => a.pct - b.pct)[0] : null;
  const strongest = confident.length ? [...confident].sort((a, b) => b.pct - a.pct)[0] : null;

  return (
    <div className="screen fade-in">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back</button>
      <h1 className="page-title"><BarChart3 size={22} style={{ verticalAlign: "-4px", marginRight: 6 }} />Student analytics</h1>
      <p className="page-sub">
        Topic-by-topic strengths across every family's practice rounds — {data.totalAttempts} attempt{data.totalAttempts === 1 ? "" : "s"} from {data.totalStudents} student{data.totalStudents === 1 ? "" : "s"} so far.
      </p>
      {loading && <p className="hint-text">Loading analytics…</p>}

      <div className="chip-row" style={{ marginBottom: 20 }}>
        <select className="filter-select" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
          <option value="all">All grades</option>
          {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
        </select>
      </div>

      {topics.length === 0 ? (
        <div className="empty-box">No completed practice rounds yet{gradeFilter !== "all" ? ` for Grade ${gradeFilter}` : ""}.</div>
      ) : (
        <>
          {(strongest || weakest) && (
            <div className="analytics-summary-row">
              {strongest && (
                <div className="summary-card summary-strong">
                  <div className="summary-label">💪 Strongest topic</div>
                  <div className="summary-topic">{topicLabel(strongest.subject, strongest.topic)}</div>
                  <div className="summary-meta">Grade {strongest.grade} · {SUBJECTS[strongest.subject].label} · {strongest.pct}% correct</div>
                </div>
              )}
              {weakest && (
                <div className="summary-card summary-weak">
                  <div className="summary-label">⚠️ Needs the most work</div>
                  <div className="summary-topic">{topicLabel(weakest.subject, weakest.topic)}</div>
                  <div className="summary-meta">Grade {weakest.grade} · {SUBJECTS[weakest.subject].label} · {weakest.pct}% correct</div>
                </div>
              )}
            </div>
          )}

          {Object.entries(SUBJECTS).map(([key, s]) => {
            const list = bySubject[key];
            if (!list || list.length === 0) return null;
            return (
              <div key={key} className="topic-subject-block">
                <h2 className="section-title subject-topic-title" style={{ "--accent": s.color }}>
                  <s.icon size={17} /> {s.label}
                </h2>
                <div className="topic-list">
                  {list.map((t) => {
                    const meta = TIER_META[t.tier];
                    return (
                      <div key={`${t.grade}:${t.topic}`} className="topic-row">
                        <div className="topic-row-top">
                          <span className="topic-name">{gradeFilter === "all" ? `Gr ${t.grade} · ` : ""}{topicLabel(t.subject, t.topic)}</span>
                          <span className={`topic-tier-tag ${meta.className}`}>{meta.label}</span>
                        </div>
                        <div className="topic-bar"><div className={`topic-bar-fill ${meta.className}`} style={{ width: `${t.pct}%` }} /></div>
                        <div className="topic-row-bottom">
                          {t.correct}/{t.total} correct across all students
                          {t.total < 3 ? " · more attempts needed for a confident read" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  All questions (admin) — full table with grade / subject / topic filters */
/* ------------------------------------------------------------------ */

const ROW_CAP = 300;

function AllQuestionsTable({ allQuestions, onDelete }) {
  const [gradeFilter, setGradeFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [search, setSearch] = useState("");

  const topicOptions = subjectFilter === "all" ? [] : topicsForSubject(subjectFilter);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allQuestions.filter((q) => {
      if (gradeFilter !== "all" && String(q.grade) !== gradeFilter) return false;
      if (subjectFilter !== "all" && q.subject !== subjectFilter) return false;
      if (topicFilter !== "all" && (q.topic || "uncategorized") !== topicFilter) return false;
      if (term && !q.q.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [allQuestions, gradeFilter, subjectFilter, topicFilter, search]);

  const shown = filtered.slice(0, ROW_CAP);

  return (
    <div className="setup-card" style={{ marginBottom: 24 }}>
      <div className="field-label" style={{ margin: "0 0 12px" }}>All questions ({filtered.length})</div>

      <div className="chip-row" style={{ marginBottom: 10 }}>
        <select className="filter-select" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
          <option value="all">All grades</option>
          {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
        </select>
        <select className="filter-select" value={subjectFilter}
          onChange={(e) => { setSubjectFilter(e.target.value); setTopicFilter("all"); }}>
          <option value="all">All subjects</option>
          {Object.entries(SUBJECTS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
        </select>
        <select className="filter-select" value={topicFilter} disabled={subjectFilter === "all"}
          onChange={(e) => setTopicFilter(e.target.value)}>
          <option value="all">All topics</option>
          {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <input className="text-input" placeholder="Search question text…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="all-q-table-wrap">
        <table className="all-q-table">
          <thead>
            <tr><th>Subject</th><th>Gr</th><th>Topic</th><th>Question</th><th>Answer</th>{onDelete && <th></th>}</tr>
          </thead>
          <tbody>
            {shown.map((q) => (
              <tr key={q.id}>
                <td><span className="tag" style={{ background: SUBJECTS[q.subject]?.soft, color: SUBJECTS[q.subject]?.color }}>{SUBJECTS[q.subject]?.label}</span></td>
                <td className="all-q-grade">{q.grade}</td>
                <td className="all-q-topic">{topicLabel(q.subject, q.topic)}</td>
                <td className="all-q-text" title={q.q}>{q.q}</td>
                <td className="all-q-answer" title={q.options[q.correct]}>{q.options[q.correct]}</td>
                {onDelete && (
                  <td>
                    <button className="mini-btn ghost" onClick={() => onDelete(q.id)} title="Delete question">
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="empty-box">No questions match those filters.</div>}
      {filtered.length > ROW_CAP && (
        <p className="hint-text">Showing first {ROW_CAP} of {filtered.length} — narrow your filters to see more.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Manage                                                              */
/* ------------------------------------------------------------------ */

function ManageScreen({ allQuestions, loading, newQ, setNewQ, onAdd, onDeleteQuestion,
  onCSVUpload, onDownloadTemplate, csvImport, setCsvImport,
  flags, onResolveFlag, onViewAnalytics, onBack }) {

  const fileRef = useRef(null);

  // counts per grade+subject for entire bank
  const gradeSubjectCounts = useMemo(() => {
    const c = {};
    allQuestions.forEach((q) => {
      const k = `${q.grade}:${q.subject}`;
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [allQuestions]);

  return (
    <div className="screen screen-wide fade-in">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back</button>
      <div className="row-between">
        <div>
          <h1 className="page-title"><Shield size={22} style={{ verticalAlign: "-4px", marginRight: 6 }} />Admin · Question bank</h1>
          <p className="page-sub">Manage questions, review flags, and add or bulk-upload new ones.</p>
        </div>
        <button className="admin-entry" onClick={onViewAnalytics}>
          <BarChart3 size={13} /> Student analytics
        </button>
      </div>
      {loading && <p className="hint-text">Loading question bank…</p>}

      {/* grade × subject matrix */}
      <div className="bank-table-wrap">
        <table className="bank-table">
          <thead>
            <tr>
              <th>Grade</th>
              {Object.values(SUBJECTS).map((s) => <th key={s.label}>{s.label}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {GRADES.map((g) => {
              const rowTotal = Object.keys(SUBJECTS).reduce((acc, k) => acc + (gradeSubjectCounts[`${g}:${k}`] || 0), 0);
              return (
                <tr key={g}>
                  <td className="bank-grade-cell">Gr {g}</td>
                  {Object.keys(SUBJECTS).map((k) => (
                    <td key={k} className="bank-count-cell">
                      {gradeSubjectCounts[`${g}:${k}`] || <span className="zero">—</span>}
                    </td>
                  ))}
                  <td className="bank-total-cell">{rowTotal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AllQuestionsTable allQuestions={allQuestions} onDelete={onDeleteQuestion} />

      {/* flagged questions */}
      {flags.length > 0 && (
        <>
          <h2 className="section-title">Flagged questions ({flags.length})</h2>
          <div className="review-list" style={{ marginBottom: 24 }}>
            {flags.map((flag) => {
              const s = SUBJECTS[flag.subject];
              return (
                <div key={flag.id} className="custom-q-row">
                  <span className="tag" style={{ background: s.soft, color: s.color }}><s.icon size={12} /> {s.label}</span>
                  <span className="tag" style={{ background: "#EEF1F6", color: "#5B6478", fontFamily: "monospace" }}>Gr {flag.grade}</span>
                  <span className="tag tag-wrong">{FLAG_REASON_LABEL[flag.reason]}</span>
                  <span className="custom-q-text">{flag.questionText}</span>
                  <button className="mini-btn" onClick={() => onResolveFlag(flag.id)} title="Clear flag"><Check size={12} /> Clear</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* CSV section */}
      <div className="setup-card" style={{ marginBottom: 24 }}>
        <div className="row-between" style={{ alignItems: "center" }}>
          <div>
            <div className="field-label" style={{ margin: 0 }}>Bulk upload via CSV</div>
            <p className="hint-text" style={{ marginTop: 4 }}>Columns: subject, grade, topic, question, optionA–D, correct (A/B/C/D), solution — topic is optional (leave blank for "Uncategorized"); use a topic name like "Number System &amp; Arithmetic" or its id like "number-system"</p>
          </div>
          <button className="btn ghost" onClick={onDownloadTemplate} style={{ flexShrink: 0 }}>
            <Download size={15} /> Template
          </button>
        </div>

        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCSVUpload} />
        <button className="btn primary full" style={{ marginTop: 12 }} onClick={() => { setCsvImport({ status: "idle", errors: [], count: 0 }); fileRef.current.click(); }}>
          <Upload size={16} /> Choose CSV file
        </button>

        {csvImport.status === "success" && (
          <div className="csv-feedback success">
            <Check size={15} /> {csvImport.count} question{csvImport.count !== 1 ? "s" : ""} imported successfully.
            {csvImport.errors.length > 0 && <span> ({csvImport.errors.length} row{csvImport.errors.length > 1 ? "s" : ""} skipped)</span>}
          </div>
        )}
        {csvImport.status === "error" && (
          <div className="csv-feedback error">
            <AlertCircle size={15} /> Import failed:
            <ul className="csv-error-list">{csvImport.errors.slice(0,5).map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
        {csvImport.status === "success" && csvImport.errors.length > 0 && (
          <ul className="csv-error-list" style={{ marginTop: 6 }}>
            {csvImport.errors.map((e, i) => <li key={i} className="csv-err-row"><AlertCircle size={12} />{e}</li>)}
          </ul>
        )}
      </div>

      {/* Manual add form */}
      <div className="setup-card">
        <div className="field-label" style={{ margin: "0 0 12px" }}>Add a single question</div>

        <label className="field-label">Subject</label>
        <div className="chip-row">
          {Object.entries(SUBJECTS).map(([key, sub]) => (
            <button key={key} className={`chip ${newQ.subject === key ? "chip-active" : ""}`}
              style={{ "--accent": sub.color, "--accent-soft": sub.soft }}
              onClick={() => setNewQ({ ...newQ, subject: key, topic: topicsForSubject(key)[0].id })}>
              <sub.icon size={14} /> {sub.label}
            </button>
          ))}
        </div>

        <label className="field-label">Grade</label>
        <GradeChips selected={newQ.grade} onChange={(g) => setNewQ({ ...newQ, grade: g })} />

        <label className="field-label">Topic</label>
        <div className="chip-row">
          {topicsForSubject(newQ.subject).map((t) => (
            <button key={t.id} className={`chip ${newQ.topic === t.id ? "chip-active" : ""}`}
              style={{ "--accent": SUBJECTS[newQ.subject].color, "--accent-soft": SUBJECTS[newQ.subject].soft }}
              onClick={() => setNewQ({ ...newQ, topic: t.id })}>
              {t.label}
            </button>
          ))}
        </div>

        <label className="field-label" style={{ marginTop: 14 }}>Question</label>
        <textarea className="text-input textarea" rows={2} value={newQ.q}
          onChange={(e) => setNewQ({ ...newQ, q: e.target.value })} placeholder="Type the question here" />

        <label className="field-label">Options (click the circle to mark correct)</label>
        {newQ.options.map((opt, i) => (
          <div className="option-input-row" key={i}>
            <button className={`radio-btn ${newQ.correct === i ? "radio-btn-selected" : ""}`}
              onClick={() => setNewQ({ ...newQ, correct: i })}>
              {newQ.correct === i && <Check size={12} />}
            </button>
            <input className="text-input" placeholder={`Option ${String.fromCharCode(65 + i)}`} value={opt}
              onChange={(e) => { const opts = [...newQ.options]; opts[i] = e.target.value; setNewQ({ ...newQ, options: opts }); }} />
          </div>
        ))}

        <label className="field-label">Solution / explanation</label>
        <textarea className="text-input textarea" rows={2} value={newQ.solution}
          onChange={(e) => setNewQ({ ...newQ, solution: e.target.value })} placeholder="Explain why the correct answer is right" />

        <button className="btn primary full lg" onClick={onAdd}>
          <Plus size={16} /> Add question
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                              */
/* ------------------------------------------------------------------ */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

      .shell {
        --bg: #EEF1F6; --card: #FFFFFF; --ink: #1B2436; --ink-soft: #5B6478; --line: #DBE0EA;
        --brand-a: #F3A73E; --brand-b: #E6486B;
        --brand-grad: linear-gradient(135deg, var(--brand-a), var(--brand-b));
        font-family: 'Inter', sans-serif; color: var(--ink);
        background:
          radial-gradient(900px 480px at 8% -8%, rgba(243,167,62,.14), transparent 60%),
          radial-gradient(800px 460px at 100% 0%, rgba(109,79,194,.12), transparent 55%),
          radial-gradient(760px 420px at 45% 105%, rgba(14,143,130,.10), transparent 55%),
          var(--bg);
        min-height: 100%; padding-bottom: 48px;
      }
      .shell * { box-sizing: border-box; }
      .loading { padding: 60px 20px; text-align: center; color: var(--ink-soft); font-family: 'IBM Plex Mono', monospace; }

      /* header */
      .header { display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid var(--line); background:var(--card); position:sticky; top:0; z-index:5; }
      .brand { display:flex; align-items:center; gap:10px; background:none; border:none; cursor:pointer; padding:0; }
      .brand-mark { width:34px; height:34px; border-radius:11px; background:var(--brand-grad); color:#fff; font-size:18px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(230,72,107,.35); flex-shrink:0; }
      .brand-text { display:flex; flex-direction:column; align-items:flex-start; }
      .brand-title { font-family:'Fraunces',serif; font-weight:700; font-size:18px; color:var(--ink); }
      .brand-sub { font-size:10.5px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:.08em; }
      .profile-pill { display:flex; align-items:center; gap:7px; background:var(--bg); border:1px solid var(--line); border-radius:999px; padding:7px 14px 7px 8px; cursor:pointer; font-weight:600; font-size:13px; color:var(--ink); }
      .profile-avatar { font-size:16px; }
      .grade-badge { background:#E7E0FB; color:#6D4FC2; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; }
      .level-badge { background:#FBE9CE; color:#C4801A; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; font-family:'IBM Plex Mono',monospace; }
      .admin-entry { display:inline-flex; align-items:center; gap:6px; background:var(--card); border:1px solid var(--line); border-radius:999px; padding:8px 16px; font-size:12.5px; font-weight:700; color:var(--ink-soft); cursor:pointer; flex-shrink:0; transition:transform .15s ease,color .15s ease,border-color .15s ease; }
      .admin-entry:hover { transform:translateY(-1px); color:var(--ink); border-color:var(--ink-soft); }
      .admin-pill { background:#1B2436; color:#fff; border-color:#1B2436; }
      .admin-pill:hover { background:#2A3550; }

      /* layout */
      .screen { max-width:760px; margin:0 auto; padding:32px 22px 0; }
      .screen-wide { max-width:1080px; }
      .fade-in { animation:fadeIn .35s ease; }
      @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

      .page-title { font-family:'Fraunces',serif; font-weight:600; font-size:26px; margin:0 0 6px; }
      .page-title.center { text-align:center; }
      .page-sub { color:var(--ink-soft); font-size:14.5px; margin:0 0 22px; }
      .page-sub.center { text-align:center; }
      .section-title { font-family:'Fraunces',serif; font-weight:600; font-size:17px; margin:30px 0 12px; }
      .row-between { display:flex; align-items:baseline; justify-content:space-between; }
      .hint-text { font-size:13px; color:var(--ink-soft); margin-top:8px; }
      .hint-text.center { text-align:center; }

      /* buttons */
      .btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; font-family:'Inter',sans-serif; font-weight:600; font-size:14px; border-radius:12px; padding:10px 18px; cursor:pointer; border:1px solid transparent; transition:transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s ease,opacity .15s ease; }
      .btn:active { transform:scale(.97); }
      .btn:disabled { opacity:.45; cursor:not-allowed; transform:none !important; box-shadow:none !important; }
      .btn.primary { background:var(--brand-grad); color:#fff; box-shadow:0 4px 14px rgba(230,72,107,.3); }
      .btn.primary:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 7px 18px rgba(230,72,107,.4); }
      .btn.ghost { background:var(--card); color:var(--ink); border-color:var(--line); }
      .btn.ghost:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 5px 14px rgba(27,36,54,.1); }
      .btn.full { width:100%; }
      .btn.lg { padding:13px 20px; font-size:15px; }
      .btn-col { display:flex; flex-direction:column; gap:10px; width:100%; max-width:280px; margin-top:26px; }
      .link-btn { background:none; border:none; color:var(--ink-soft); font-size:13px; font-weight:600; cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
      .link-btn.center { display:block; margin:14px auto 0; }
      .back-link { display:inline-flex; align-items:center; gap:5px; background:none; border:none; color:var(--ink-soft); font-size:13px; font-weight:600; cursor:pointer; margin-bottom:14px; padding:0; }

      /* inputs */
      .text-input { width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 13px; font-family:'Inter',sans-serif; font-size:14px; color:var(--ink); background:var(--card); margin-bottom:12px; }
      .text-input:focus { outline:2px solid #C4801A; outline-offset:1px; }
      .textarea { resize:vertical; }

      /* profiles */
      .profile-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(155px,1fr)); gap:14px; }
      .profile-card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:16px; display:flex; flex-direction:column; align-items:center; gap:8px; position:relative; transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease; }
      .profile-card:hover { transform:translateY(-3px); box-shadow:0 10px 22px rgba(27,36,54,.1); }
      .profile-card-btn { background:none; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:6px; width:100%; }
      .profile-card-avatar { font-size:40px; display:inline-block; transition:transform .2s ease; }
      .profile-card:hover .profile-card-avatar { transform:rotate(-8deg) scale(1.08); }
      .profile-card-name { font-weight:600; font-size:14.5px; }
      .profile-card-grade { display:flex; align-items:center; gap:4px; font-size:12px; color:var(--ink-soft); }
      .mini-btn { border:none; background:var(--bg); border-radius:8px; padding:5px 10px; font-size:11.5px; font-weight:600; cursor:pointer; color:var(--ink-soft); }
      .mini-btn.danger { background:#FBDEE3; color:#C6435E; }
      .mini-btn.ghost { position:absolute; top:10px; right:10px; padding:5px; }
      .new-card { border-style:dashed; gap:10px; }
      .avatar-picker { display:flex; flex-wrap:wrap; gap:5px; justify-content:center; margin-bottom:6px; }
      .avatar-opt { background:var(--bg); border:1px solid transparent; border-radius:8px; font-size:17px; padding:3px 6px; cursor:pointer; transition:transform .15s ease; }
      .avatar-opt:hover { transform:scale(1.15) rotate(-6deg); }
      .avatar-opt-selected { border-color:#C4801A; background:#FBE9CE; }

      /* grade chips */
      .chip-grade { font-family:'IBM Plex Mono',monospace; font-size:12px; padding:7px 12px; }

      /* dashboard */
      .level-card { display:flex; align-items:center; gap:16px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 18px; margin-bottom:20px; }
      .level-badge-lg { font-family:'Fraunces',serif; font-weight:700; font-size:20px; color:#C4801A; background:#FBE9CE; border-radius:12px; padding:8px 14px; flex-shrink:0; }
      .level-bar-wrap { flex:1; }
      .level-bar-top { display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:var(--ink-soft); margin-bottom:6px; }
      .level-bar { height:8px; border-radius:999px; background:var(--bg); overflow:hidden; }
      .level-bar-fill { height:100%; border-radius:999px; background:var(--brand-grad); transition:width .3s ease; }
      .badge-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:12px; margin-bottom:8px; }
      .badge-item { display:flex; flex-direction:column; align-items:center; gap:6px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px 10px; text-align:center; transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease; }
      .badge-item.badge-unlocked:hover { transform:translateY(-3px) scale(1.03); box-shadow:0 10px 20px rgba(243,167,62,.25); }
      .badge-icon { width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
      .badge-unlocked .badge-icon { background:#FBE9CE; color:#C4801A; }
      .badge-unlocked .badge-label { color:var(--ink); font-weight:600; }
      .badge-locked { opacity:.55; }
      .badge-locked .badge-icon { background:var(--bg); color:var(--ink-soft); }
      .badge-label { font-size:11.5px; color:var(--ink-soft); line-height:1.3; }
      .subject-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; margin-bottom:8px; }
      .subject-card { background:var(--card); border:1px solid var(--line); border-top:3px solid var(--accent); border-radius:18px; padding:18px 16px; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:4px; transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease; }
      .subject-card:hover { transform:translateY(-4px); box-shadow:0 12px 22px -4px color-mix(in srgb, var(--accent) 40%, transparent); }
      .subject-icon { width:38px; height:38px; border-radius:10px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; margin-bottom:6px; transition:transform .2s ease; }
      .subject-card:hover .subject-icon { transform:scale(1.12) rotate(-6deg); }
      .subject-name { font-family:'Fraunces',serif; font-weight:600; font-size:16px; }
      .subject-meta { font-size:12.5px; color:var(--ink-soft); }
      .subject-best { font-size:12px; font-weight:700; color:var(--accent); margin-top:2px; }
      .empty-box { border:1px dashed var(--line); border-radius:12px; padding:18px; color:var(--ink-soft); font-size:13.5px; text-align:center; }
      .stamp-row { display:flex; gap:12px; overflow-x:auto; padding:6px 2px 14px; }
      .stamp-item { cursor:pointer; flex-shrink:0; }
      .attempt-list { display:flex; flex-direction:column; gap:8px; }
      .attempt-row { display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:10px; padding:11px 14px; cursor:pointer; font-family:'Inter',sans-serif; font-size:13px; text-align:left; width:100%; transition:transform .15s ease,box-shadow .15s ease; }
      .attempt-row:hover { transform:translateX(3px); box-shadow:0 4px 12px rgba(27,36,54,.08); }
      .attempt-subject { display:flex; align-items:center; gap:6px; font-weight:600; flex:1; }
      .attempt-grade-tag { background:#EEF1F6; color:var(--ink-soft); font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; padding:2px 7px; border-radius:6px; flex-shrink:0; }
      .attempt-score { font-family:'IBM Plex Mono',monospace; font-weight:600; }
      .attempt-date { color:var(--ink-soft); font-size:11.5px; }

      /* setup */
      .setup-card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:22px; }
      .field-label { display:block; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-soft); margin:18px 0 8px; }
      .field-hint { font-size:11px; text-transform:none; letter-spacing:0; font-weight:400; }
      .field-label:first-child { margin-top:0; }
      .chip-row { display:flex; flex-wrap:wrap; gap:8px; }
      .chip { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:999px; border:1.5px solid var(--line); background:var(--card); font-size:13px; font-weight:600; cursor:pointer; color:var(--ink); transition:transform .15s ease; }
      .chip:hover { transform:translateY(-1px); }
      .chip-active { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); }
      .stepper { display:flex; align-items:center; gap:16px; }
      .stepper-btn { width:34px; height:34px; border-radius:9px; border:1px solid var(--line); background:var(--card); cursor:pointer; display:flex; align-items:center; justify-content:center; }
      .stepper-value { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:16px; min-width:64px; text-align:center; }

      /* exam */
      .exam-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
      .exam-subject { display:flex; align-items:center; gap:6px; font-weight:700; color:var(--accent); font-size:14px; }
      .exam-timer { display:flex; align-items:center; gap:6px; font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:15px; background:var(--card); border:1px solid var(--line); border-radius:999px; padding:6px 13px; }
      .exam-timer-low { color:#C6435E; border-color:#C6435E; background:#FBDEE3; }
      .dots { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:20px; }
      .dot { width:10px; height:10px; border-radius:50%; background:var(--line); border:none; cursor:pointer; padding:0; }
      .dot-answered { background:var(--accent); opacity:.6; }
      .dot-skipped { background:#C4801A; opacity:.7; }
      .dot-current { background:var(--accent); opacity:1; transform:scale(1.4); }

      /* exam layout: single column by default, question + tracker side-by-side on desktop */
      .exam-layout { display:block; }
      .exam-tracker { display:none; }
      .question-card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px; margin-bottom:18px; }
      .question-count { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-soft); margin-bottom:10px; }
      .question-text { font-family:'Fraunces',serif; font-size:19px; font-weight:500; line-height:1.4; margin-bottom:20px; }
      .option-list { display:flex; flex-direction:column; gap:9px; }
      .option-row { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:12px; border:1.5px solid var(--line); background:var(--bg); cursor:pointer; text-align:left; font-family:'Inter',sans-serif; font-size:14.5px; color:var(--ink); transition:transform .15s ease,border-color .15s ease; }
      .option-row:hover { transform:translateX(2px); border-color:var(--accent); }
      .option-selected { border-color:var(--accent); background:var(--accent-soft); }
      .option-letter { width:24px; height:24px; border-radius:7px; background:var(--card); border:1px solid var(--line); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0; }
      .exam-nav { display:flex; align-items:center; justify-content:space-between; }
      .exam-progress-text { font-size:12.5px; color:var(--ink-soft); font-family:'IBM Plex Mono',monospace; }

      .exam-tracker-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-soft); margin-bottom:14px; }
      .exam-tracker-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:20px; }
      .tracker-cell { aspect-ratio:1; border-radius:9px; border:1.5px solid var(--line); background:var(--bg); font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:13px; color:var(--ink-soft); cursor:pointer; transition:transform .15s ease; }
      .tracker-cell:hover { transform:scale(1.08); }
      .tracker-answered { background:#D3F3EE; border-color:#0E8F82; color:#0E8F82; }
      .tracker-skipped { background:#FBE9CE; border-color:#C4801A; color:#C4801A; }
      .tracker-unvisited { background:var(--card); }
      .tracker-current { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
      .exam-tracker-legend { display:flex; flex-direction:column; gap:8px; font-size:12px; color:var(--ink-soft); }
      .legend-dot { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:7px; vertical-align:-1px; }
      .legend-answered { background:#0E8F82; }
      .legend-skipped { background:#C4801A; }
      .legend-unvisited { background:var(--line); }

      /* auth (sign in / sign up) */
      .auth-screen { padding-top:32px; }
      .auth-layout { display:flex; flex-direction:column; gap:32px; }
      .auth-intro { text-align:center; }
      .auth-intro .page-title { text-align:center; }
      .auth-intro-text { color:var(--ink-soft); font-size:14px; line-height:1.6; max-width:460px; margin:0 auto 10px; }
      .auth-intro-text strong { color:var(--ink); }
      .auth-highlights { list-style:none; margin:16px auto 0; padding:0; display:flex; flex-direction:column; gap:8px; max-width:300px; }
      .auth-highlights li { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--ink); background:var(--card); border:1px solid var(--line); border-radius:10px; padding:9px 13px; }
      .auth-highlights li svg { flex-shrink:0; color:var(--brand-a); }
      .auth-form-col { display:flex; flex-direction:column; align-items:center; }

      /* results */
      .center-col { display:flex; flex-direction:column; align-items:center; text-align:center; padding-top:40px; }
      .stamp-reveal { position:relative; animation:stampIn .5s cubic-bezier(.34,1.56,.64,1); margin-bottom:20px; }
      @keyframes stampIn { from{transform:scale(.4) rotate(-25deg);opacity:0} to{transform:scale(1) rotate(-6deg);opacity:1} }
      .confetti-piece { position:absolute; top:50%; left:50%; width:7px; height:7px; margin:-3.5px; border-radius:2px; animation:confettiFly .7s ease-out forwards; }
      .confetti-piece:nth-child(4n+1) { background:var(--brand-a); }
      .confetti-piece:nth-child(4n+2) { background:var(--brand-b); }
      .confetti-piece:nth-child(4n+3) { background:#0E8F82; }
      .confetti-piece:nth-child(4n) { background:#6D4FC2; }
      @keyframes confettiFly { from{transform:translate(0,0) rotate(0deg);opacity:1;} to{transform:translate(var(--dx),var(--dy)) rotate(220deg);opacity:0;} }
      .try-again-badge { width:100px; height:100px; border-radius:50%; background:#E7E0FB; color:#6D4FC2; display:flex; align-items:center; justify-content:center; margin-bottom:20px; }
      .stamp { border-radius:50%; border:3px solid; display:flex; align-items:center; justify-content:center; transform:rotate(-6deg); background:#fff; box-shadow:0 0 0 4px rgba(0,0,0,.02); }
      .stamp-inner { width:84%; height:84%; border-radius:50%; border:1.5px dashed; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
      .stamp-label { font-family:'Fraunces',serif; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:.08em; }

      .xp-summary { display:flex; flex-direction:column; align-items:center; gap:8px; margin-top:18px; }
      .xp-gained { display:inline-flex; align-items:center; gap:6px; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:13px; color:#C4801A; background:#FBE9CE; border-radius:999px; padding:6px 14px; }
      .level-up-banner { font-weight:700; font-size:14px; color:#6D4FC2; background:#E7E0FB; border-radius:12px; padding:8px 16px; }
      .badge-unlock-banner { display:inline-flex; align-items:center; gap:6px; font-weight:600; font-size:13px; color:#0E8F82; background:#D3F3EE; border-radius:12px; padding:7px 14px; }

      .round-topics { width:100%; max-width:420px; margin-top:22px; text-align:center; }
      .round-topics-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-soft); margin-bottom:10px; }
      .round-topic-chips { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
      .round-topic-chip { font-size:12px; font-weight:600; padding:6px 12px; border-radius:999px; }

      /* analytics */
      .analytics-link { display:inline-flex; align-items:center; gap:6px; margin-bottom:20px; }
      .pattern-card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:18px 20px; margin-bottom:26px; }
      .pattern-card-title { display:flex; align-items:center; gap:7px; font-weight:700; font-size:14px; color:var(--ink); margin-bottom:10px; }
      .pattern-list { margin:0; padding-left:20px; display:flex; flex-direction:column; gap:6px; font-size:13.5px; color:var(--ink-soft); line-height:1.4; }
      .analytics-summary-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:28px; }
      .summary-card { border-radius:16px; padding:18px 20px; border:1px solid var(--line); }
      .summary-strong { background:#D3F3EE; border-color:#9FDDCF; }
      .summary-weak { background:#FBDEE3; border-color:#F0AABB; }
      .summary-label { font-size:12.5px; font-weight:700; color:var(--ink-soft); margin-bottom:6px; }
      .summary-topic { font-family:'Fraunces',serif; font-weight:600; font-size:18px; color:var(--ink); margin-bottom:4px; }
      .summary-meta { font-size:12.5px; color:var(--ink-soft); }
      @media(max-width:560px){ .analytics-summary-row{ grid-template-columns:1fr; } }
      .topic-subject-block { margin-bottom:26px; }
      .subject-topic-title { display:flex; align-items:center; gap:8px; color:var(--accent); }
      .topic-list { display:flex; flex-direction:column; gap:14px; }
      .topic-row { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
      .topic-row-top { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
      .topic-name { font-weight:600; font-size:14px; }
      .topic-bar { height:8px; border-radius:999px; background:var(--bg); overflow:hidden; margin-bottom:8px; }
      .topic-bar-fill { height:100%; border-radius:999px; }
      .topic-row-bottom { font-size:12px; color:var(--ink-soft); }

      .tier-strong { color:#0E8F82; background:#D3F3EE; }
      .tier-average { color:#C4801A; background:#FBE9CE; }
      .tier-needs-improvement { color:#C6435E; background:#FBDEE3; }
      .tier-learning { color:#6B7280; background:#EDEEF1; }
      .topic-tier-tag { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; padding:4px 10px; border-radius:999px; flex-shrink:0; }
      .topic-bar-fill.tier-strong { background:#0E8F82; }
      .topic-bar-fill.tier-average { background:#C4801A; }
      .topic-bar-fill.tier-needs-improvement { background:#C6435E; }
      .topic-bar-fill.tier-learning { background:#9CA3AF; }

      /* review */
      .review-list { display:flex; flex-direction:column; gap:14px; }
      .review-card { background:var(--card); border:1px solid var(--line); border-left:4px solid var(--line); border-radius:14px; padding:18px; }
      .review-correct { border-left-color:#0E8F82; }
      .review-wrong { border-left-color:#C6435E; }
      .review-skipped { border-left-color:#A8AAAD; }
      .review-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
      .review-number { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:12.5px; color:var(--ink-soft); }
      .tag { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:4px 9px; border-radius:999px; }
      .tag-correct { background:#D3F3EE; color:#0E8F82; }
      .tag-wrong { background:#FBDEE3; color:#C6435E; }
      .tag-skipped { background:#EDEEF1; color:#6B7280; }
      .review-question { font-family:'Fraunces',serif; font-size:16px; font-weight:500; margin-bottom:14px; line-height:1.4; }
      .review-option { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:9px; border:1px solid var(--line); font-size:13.5px; margin-bottom:6px; }
      .review-option-correct { border-color:#0E8F82; background:#D3F3EE; }
      .review-option-wrong { border-color:#C6435E; background:#FBDEE3; }
      .option-icon { margin-left:auto; }
      .solution-box { margin-top:12px; background:var(--bg); border-radius:10px; padding:12px 14px; font-size:13.5px; line-height:1.5; display:flex; gap:8px; }
      .solution-label { font-weight:700; color:var(--ink-soft); text-transform:uppercase; font-size:11px; letter-spacing:.05em; flex-shrink:0; margin-top:1px; }
      .solution-content { display:flex; flex-direction:column; gap:6px; }
      .know-more-link { align-self:flex-start; font-size:12px; font-weight:600; color:#6D4FC2; text-decoration:underline; text-underline-offset:2px; }
      .know-more-link:hover { color:#5638A0; }

      .flag-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:12px; padding-top:12px; border-top:1px dashed var(--line); }
      .flag-prompt { font-size:12px; color:var(--ink-soft); margin-right:2px; }
      .flag-btn { display:inline-flex; align-items:center; gap:5px; background:var(--bg); border:1px solid var(--line); border-radius:999px; padding:5px 11px; font-size:11.5px; font-weight:600; color:var(--ink-soft); cursor:pointer; transition:transform .15s ease,color .15s ease,border-color .15s ease; }
      .flag-btn:hover { transform:translateY(-1px); color:#C6435E; border-color:#C6435E; }
      .flag-row-flagged { display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#C6435E; }
      .flag-undo { background:none; border:none; color:var(--ink-soft); font-size:11.5px; font-weight:600; text-decoration:underline; cursor:pointer; margin-left:4px; }

      /* manage / bank table */
      .bank-table-wrap { overflow-x:auto; margin-bottom:22px; }
      .bank-table { width:100%; border-collapse:collapse; font-size:13px; }
      .bank-table th { background:var(--card); border:1px solid var(--line); padding:8px 12px; text-align:center; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-soft); }
      .bank-table th:first-child { text-align:left; }
      .bank-table td { border:1px solid var(--line); padding:8px 12px; text-align:center; background:var(--card); }
      .bank-grade-cell { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:12px; text-align:left; color:var(--ink-soft); }
      .bank-count-cell { font-family:'IBM Plex Mono',monospace; font-weight:600; }
      .bank-total-cell { font-family:'IBM Plex Mono',monospace; font-weight:700; background:var(--bg) !important; }
      .zero { color:var(--line); }

      /* admin: all-questions filter table */
      .filter-select { border:1.5px solid var(--line); border-radius:999px; background:var(--card); padding:8px 14px; font-size:13px; font-weight:600; color:var(--ink); cursor:pointer; }
      .filter-select:disabled { opacity:.5; cursor:not-allowed; }
      .all-q-table-wrap { overflow-x:auto; margin-top:14px; max-height:480px; overflow-y:auto; border:1px solid var(--line); border-radius:12px; }
      .all-q-table { width:100%; min-width:640px; table-layout:fixed; border-collapse:collapse; font-size:13px; }
      .all-q-table th { position:sticky; top:0; background:var(--card); border-bottom:1px solid var(--line); padding:9px 12px; text-align:left; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-soft); z-index:1; }
      .all-q-table td { border-bottom:1px solid var(--line); padding:9px 12px; vertical-align:top; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .all-q-table tr:last-child td { border-bottom:none; }
      .all-q-table th:nth-child(1), .all-q-table td:nth-child(1) { width:14%; }
      .all-q-table th:nth-child(2), .all-q-table td:nth-child(2) { width:6%; }
      .all-q-table th:nth-child(3), .all-q-table td:nth-child(3) { width:20%; }
      .all-q-table th:nth-child(4), .all-q-table td:nth-child(4) { width:42%; }
      .all-q-table th:nth-child(5), .all-q-table td:nth-child(5) { width:18%; }
      .all-q-grade { font-family:'IBM Plex Mono',monospace; font-weight:600; }
      .all-q-topic { color:var(--ink-soft); }
      .all-q-answer { color:#0E8F82; font-weight:600; }
      .option-input-row { display:flex; align-items:center; gap:10px; }
      .radio-btn { width:22px; height:22px; border-radius:50%; border:1.5px solid var(--line); background:var(--card); cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:#0E8F82; }
      .radio-btn-selected { border-color:#0E8F82; background:#D3F3EE; }
      .custom-q-row { display:flex; align-items:center; gap:8px; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 14px; }
      .custom-q-text { flex:1; font-size:13.5px; }

      /* csv feedback */
      .csv-feedback { display:flex; align-items:flex-start; gap:8px; margin-top:12px; padding:10px 14px; border-radius:10px; font-size:13px; font-weight:600; }
      .csv-feedback.success { background:#D3F3EE; color:#0E8F82; }
      .csv-feedback.error { background:#FBDEE3; color:#C6435E; }
      .csv-error-list { margin:6px 0 0 18px; padding:0; font-size:12px; font-weight:400; color:var(--ink-soft); list-style:disc; }
      .csv-err-row { display:flex; align-items:center; gap:5px; font-size:12px; color:#C6435E; margin-top:4px; }

      .file-sync-row { margin-top:12px; }
      .file-sync-connected-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
      .file-sync-status { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; }
      .file-sync-connected { color:#0E8F82; }
      .file-sync-error { display:block; margin-top:4px; color:#C6435E; }
      .file-sync-message { margin-top:6px; font-size:12px; color:var(--ink-soft); }

      @media(max-width:480px){
        .screen{padding:22px 16px 0;}
        .header{padding:14px 16px;}
        .bank-table{font-size:11px;}
      }

      /* ---- desktop: wider layout, bigger icons/cards, side-by-side exam tracker ---- */
      @media(min-width:900px){
        .screen{ max-width:980px; }
        .screen-wide{ max-width:1080px; }
        .page-title{ font-size:30px; }
        .screen-wide .page-title{font-size:34px;}
        .screen-wide .page-sub{font-size:16.5px;}
        .section-title{ font-size:19px; }

        .subject-grid{ grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:18px; }
        .subject-card{ padding:22px 20px; }
        .subject-icon{ width:52px; height:52px; border-radius:14px; margin-bottom:10px; }
        .subject-icon svg{ width:30px; height:30px; }
        .subject-name{ font-size:18px; }

        .setup-card{ padding:28px; }
        .setup-card-narrow{ max-width:640px; }
        .question-card{ padding:32px; }
        .question-text{ font-size:22px; }
        .option-row{ padding:14px 16px; font-size:15.5px; }
        .option-letter{ width:28px; height:28px; font-size:13px; }

        .level-card{ padding:18px 24px; }
        .badge-grid{ grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); }

        .profile-grid{grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:22px;}
        .profile-card{padding:26px;gap:12px;border-radius:20px;}
        .profile-card-avatar{font-size:60px;}
        .profile-card-name{font-size:18px;}
        .profile-card-grade{font-size:13.5px;}
        .avatar-picker{gap:7px;}
        .avatar-opt{font-size:21px;padding:5px 8px;}
        .mini-btn.ghost{padding:7px;}

        .auth-screen{ max-width:900px; padding-top:56px; }
        .auth-layout{ flex-direction:row; align-items:center; gap:64px; }
        .auth-intro{ flex:1; text-align:left; }
        .auth-intro .page-title{ text-align:left; font-size:34px; }
        .auth-intro-text{ margin:0 0 10px; }
        .auth-highlights{ margin:18px 0 0; align-items:flex-start; }
        .auth-form-col{ flex:0 0 380px; }

        /* question + tracker side by side; the tracker replaces the compact dot row */
        .exam-screen.screen-wide{ max-width:1180px; }
        .exam-layout{ display:grid; grid-template-columns:1fr 260px; gap:28px; align-items:start; }
        .exam-tracker{ display:block; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; position:sticky; top:92px; }
        .exam-screen .dots{ display:none; }
      }

      @media(min-width:1280px){
        .screen{ max-width:1120px; }
        .screen-wide{ max-width:1220px; }
      }
    `}</style>
  );
}

