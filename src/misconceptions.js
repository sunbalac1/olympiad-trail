// Misconception taxonomy for tagging wrong answer options. A small, extensible
// starting set — same pattern as TOPICS_BY_SUBJECT in topics.js. The server
// never needs to know what a tag *means*, only stores/counts the id strings;
// this label mapping only matters for the tagging UI and the focus-plan text.

export const MISCONCEPTIONS = {
  generic: [
    { id: "misread-question", label: "Misread what was asked" },
    { id: "careless-slip", label: "Careless slip (right method, wrong number)" },
  ],
  math: [
    { id: "wrong-operation", label: "Used the wrong operation (+/-/*/÷)" },
    { id: "formula-misapplication", label: "Applied the wrong formula" },
    { id: "unit-or-scale-error", label: "Unit or scale conversion error" },
    { id: "sign-error", label: "Sign or direction error" },
    { id: "off-by-one", label: "Off-by-one / boundary error" },
    { id: "place-value-error", label: "Place value error" },
    { id: "order-of-operations-error", label: "Order of operations error" },
  ],
  science: [
    { id: "definition-confusion", label: "Confused two similar terms" },
    { id: "cause-effect-reversal", label: "Reversed cause and effect" },
    { id: "fact-confusion", label: "Mixed up two similar facts" },
  ],
  english: [
    { id: "grammar-rule-confusion", label: "Confused a grammar rule" },
    { id: "word-meaning-confusion", label: "Confused word meaning" },
    { id: "tense-confusion", label: "Confused verb tense" },
  ],
  reasoning: [
    { id: "pattern-misidentification", label: "Misidentified the pattern" },
    { id: "logic-reversal", label: "Reversed the logic" },
  ],
};

export function misconceptionsFor(subject) {
  return [...MISCONCEPTIONS.generic, ...(MISCONCEPTIONS[subject] || [])];
}

export function misconceptionLabel(id) {
  if (!id) return null;
  const all = Object.values(MISCONCEPTIONS).flat();
  return all.find((m) => m.id === id)?.label || id;
}
