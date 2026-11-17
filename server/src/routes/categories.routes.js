import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  categorySchema,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../controllers/categories.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listCategories));
// Writing needs manager or admin (admin always passes)
router.post('/', requireRole('manager'), validate(categorySchema), asyncHandler(createCategory));
router.put('/:id', requireRole('manager'), validate(categorySchema), asyncHandler(updateCategory));
router.delete('/:id', requireRole('manager'), asyncHandler(deleteCategory));

export default router;
