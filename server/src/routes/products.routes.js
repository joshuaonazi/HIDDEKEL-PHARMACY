import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createProduct,
  deleteProduct,
  getByBarcode,
  getProduct,
  listProducts,
  productSchema,
  updateProduct,
} from '../controllers/products.controller.js';
import { importProducts } from '../controllers/import.controller.js';
import { stockImport } from '../controllers/stockImport.controller.js';

const router = Router();
router.use(requireAuth);

// Everyone signed in may look products up (cashiers need this to sell). Cost prices are removed for cashiers.
router.get('/', asyncHandler(listProducts));
router.get('/barcode/:code', asyncHandler(getByBarcode));
router.get('/:id', asyncHandler(getProduct));

// Changing the catalogue needs manager or admin
router.post('/import', requireRole('manager'), asyncHandler(importProducts));
// Adds batches (opening stock or a restock) to products that already exist
router.post('/stock-import', requireRole('manager'), asyncHandler(stockImport));
router.post('/', requireRole('manager'), validate(productSchema), asyncHandler(createProduct));
router.put('/:id', requireRole('manager'), validate(productSchema), asyncHandler(updateProduct));
router.delete('/:id', requireRole('manager'), asyncHandler(deleteProduct));

export default router;
