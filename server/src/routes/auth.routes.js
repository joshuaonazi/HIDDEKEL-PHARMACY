import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { allowPasswordChange, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { changePassword, changePasswordSchema, login, me } from '../controllers/auth.controller.js';

const router = Router();

// Slow down password guessing: 30 FAILED attempts per 15 minutes per IP.
// Successful sign-ins are not counted, so a whole shift logging in from one shared
// internet connection can never lock each other out.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed login attempts. Try again in a few minutes.' },
});

// Guessing the current password through the change form is limited the same way
const changeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(login));
router.get('/me', allowPasswordChange, requireAuth, me);
router.post('/change-password', allowPasswordChange, requireAuth, changeLimiter, validate(changePasswordSchema), asyncHandler(changePassword));

export default router;
