// Topic taxonomy, derived from the Grade 4 / Grade 6 Olympiad syllabus.
// Used to tag questions (see questions.js) and to power the analytics screen.

export const TOPICS_BY_SUBJECT = {
  math: [
    { id: "number-system", label: "Number System & Arithmetic" },
    { id: "ratio-commercial-math", label: "Ratio, Percentages & Commercial Math" },
    { id: "algebra", label: "Algebra" },
    { id: "geometry-shapes", label: "Geometry & Shapes" },
    { id: "mensuration", label: "Mensuration" },
    { id: "measurement-time-money", label: "Measurement, Time & Money" },
    { id: "data-handling", label: "Data Handling" },
  ],
  science: [
    { id: "physics", label: "Physics" },
    { id: "chemistry-materials", label: "Chemistry & Materials" },
    { id: "biology-plants-animals", label: "Plants & Animals" },
    { id: "biology-human-body", label: "Food, Health & Human Body" },
    { id: "earth-environment", label: "Earth, Environment & Universe" },
  ],
  english: [
    { id: "grammar", label: "Grammar & Mechanics" },
    { id: "vocabulary", label: "Vocabulary & Idioms" },
    { id: "comprehension", label: "Reading Comprehension" },
    { id: "functional-english", label: "Spoken & Functional English" },
  ],
  reasoning: [
    { id: "verbal-reasoning", label: "Verbal Reasoning" },
    { id: "non-verbal-reasoning", label: "Non-Verbal Reasoning" },
  ],
};

export const UNCATEGORIZED_TOPIC = { id: "uncategorized", label: "Uncategorized" };

export function topicsForSubject(subject) {
  return TOPICS_BY_SUBJECT[subject] || [];
}

export function topicLabel(subject, topicId) {
  if (!topicId) return UNCATEGORIZED_TOPIC.label;
  const found = topicsForSubject(subject).find((t) => t.id === topicId);
  return found ? found.label : UNCATEGORIZED_TOPIC.label;
}
