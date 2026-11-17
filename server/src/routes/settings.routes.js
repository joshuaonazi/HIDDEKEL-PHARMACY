import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getSettings, settingsSchema, updateSettings } from '../controllers/settings.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(getSettings));
// requireRole() with no roles means admin only
router.put('/', requireRole(), validate(settingsSchema), asyncHandler(updateSettings));

export default router;
