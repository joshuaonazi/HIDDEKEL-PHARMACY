import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createUser,
  createUserSchema,
  listUsers,
  resetPassword,
  updateUser,
  updateUserSchema,
} from '../controllers/users.controller.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole()); // no extra roles listed = admin only

router.get('/', asyncHandler(listUsers));
router.post('/', validate(createUserSchema), asyncHandler(createUser));
router.put('/:id', validate(updateUserSchema), asyncHandler(updateUser));
router.post('/:id/reset-password', asyncHandler(resetPassword));

export default router;
