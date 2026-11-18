import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createSale, getSale, quote, quoteSchema, saleSchema } from '../controllers/sales.controller.js';
import { listSales, voidSale, voidSchema } from '../controllers/salesHistory.controller.js';

const router = Router();
router.use(requireAuth);

// Cashiers and managers sell; admins also pass via requireRole. Pharmacists must not operate POS.
router.get('/', requireRole('cashier', 'manager'), asyncHandler(listSales));
router.post('/quote', requireRole('cashier', 'manager'), validate(quoteSchema), asyncHandler(quote));
router.post('/', requireRole('cashier', 'manager'), validate(saleSchema), asyncHandler(createSale));
router.get('/:id', requireRole('cashier', 'manager'), asyncHandler(getSale));

// Voiding needs a manager or admin
router.post('/:id/void', requireRole('manager'), validate(voidSchema), asyncHandler(voidSale));

export default router;