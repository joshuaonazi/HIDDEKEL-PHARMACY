// Turns user text into a safe ILIKE pattern ("100%" must not act as a wildcard)
export const likePattern = (text) => `%${String(text).replace(/[\\%_]/g, '\\$&')}%`;
