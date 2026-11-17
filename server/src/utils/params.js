import { HttpError } from './httpError.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads a UUID from the URL, or rejects with 400 instead of a database error
export function idParam(req, name = 'id') {
  const value = req.params[name];
  if (!UUID.test(value || '')) throw new HttpError(400, 'Invalid id');
  return value;
}
