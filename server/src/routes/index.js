import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import authRoutes from './auth.routes.js';
import categoryRoutes from './categories.routes.js';
import productRoutes from './products.routes.js';
import saleRoutes from './sales.routes.js';
import settingsRoutes from './settings.routes.js';
import userRoutes from './users.routes.js';
import prescriptionRoutes from './prescriptions.routes.js';

const router = Router();

router.get('/health', asyncHandler(async (req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok' });
}));

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/sales', saleRoutes);
router.use('/settings', settingsRoutes);
router.use('/users', userRoutes);
router.use('/prescriptions', prescriptionRoutes);
// Next steps add: sales history and voids, /reports, /purchases

export default router;
