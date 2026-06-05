import express from 'express';
import * as shiprocketController from '../controllers/shiprocket.controller';
import { validateRequest } from '../middlewares/validateRequest.middleware';
import { checkServiceabilitySchema } from '../validations/shiprocket.validation';

const router = express.Router();

/**
 * @route   GET /api/v1/shiprocket/serviceability
 * @desc    Check courier serviceability between two postcodes
 * @access  Public
 */
router.get(
  '/serviceability',
  validateRequest(checkServiceabilitySchema),
  shiprocketController.checkCourierServiceability
);

/**
 * @route   POST /api/v1/shiprocket/webhook
 * @desc    Handle Shiprocket tracking webhooks
 * @access  Public (Shiprocket IP whitelist recommended in production)
 */
router.post('/webhook', shiprocketController.handleWebhook);

/**
 * @route   GET /api/v1/shiprocket/orders/:id/invoice
 * @desc    Get Shiprocket generated invoice URL for an order
 * @access  Private (Admin/Owner)
 */
router.get('/orders/:id/invoice', shiprocketController.getOrderInvoice);

export default router;
