import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createSale, getSale, quote, quoteSchema, saleSchema } from '../controllers/sales.controller.js';
import { listSales, voidSale, voidSchema } from '../controllers/salesHistory.controller.js';

const router = Router();
router.use(requireAuth);

// Every signed-in role may sell. Cashiers only see their own sales.
router.get('/', asyncHandler(listSales));
router.post('/quote', validate(quoteSchema), asyncHandler(quote));
router.post('/', validate(saleSchema), asyncHandler(createSale));
router.get('/:id', asyncHandler(getSale));

// Voiding needs a manager or admin
router.post('/:id/void', requireRole('manager'), validate(voidSchema), asyncHandler(voidSale));

export default router;