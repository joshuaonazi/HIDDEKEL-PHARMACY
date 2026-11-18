import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  cancellationSchema,
  cancelPrescription,
  createPrescription,
  getPrescription,
  getCustomerHistory,
  listPrescriptions,
  prescriptionSchema,
  repeatPrescription,
  updatePrescription,
} from '../controllers/prescriptions.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listPrescriptions));
router.get('/customer/history', asyncHandler(getCustomerHistory));
router.post('/', validate(prescriptionSchema), asyncHandler(createPrescription));
router.get('/:id', asyncHandler(getPrescription));
router.put('/:id', validate(prescriptionSchema), asyncHandler(updatePrescription));
router.post('/:id/cancel', validate(cancellationSchema), asyncHandler(cancelPrescription));
router.post('/:id/repeat', asyncHandler(repeatPrescription));

export default router;
