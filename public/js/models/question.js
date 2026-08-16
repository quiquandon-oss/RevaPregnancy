// Factory + validation for Question (data-model.md, FR-017). Independent of any appointment.

export function validateQuestionInput({ text }) {
  const errors = [];
  if (!text || !text.trim()) errors.push("Write down what you'd like to ask.");
  return errors;
}

export function createQuestion(text) {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    asked: false,
    createdAt: new Date().toISOString(),
  };
}
