import { ZodError } from 'zod';
import { env } from '../config/env.js';

export const notFound = (req, res) => res.status(404).json({ error: 'Not found' });

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid input',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large' });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 && env.nodeEnv === 'production' ? 'Something went wrong' : err.message,
    ...(err.code ? { code: err.code } : {}),
  });
};
