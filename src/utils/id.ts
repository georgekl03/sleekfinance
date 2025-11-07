let counter = 0;

export const generateId = (prefix: string) => {
  counter += 1;
  const uniquePart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uniquePart}_${counter}`;
};
