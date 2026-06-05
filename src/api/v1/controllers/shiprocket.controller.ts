import { Request, Response, NextFunction } from 'express';
import { shiprocketService } from '@/api/v1/services/shiprocket.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';

// ==========================================
// CHECK COURIER SERVICEABILITY
// ==========================================
export const checkCourierServiceability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pickup_postcode, delivery_postcode, weight, cod } = req.query;

    const result = await shiprocketService.checkServiceability({
      pickupPostcode: pickup_postcode as string,
      deliveryPostcode: delivery_postcode as string,
      weight: parseFloat(weight as string),
      cod: parseInt(cod as string) as 0 | 1,
    });

    return httpResponse(req, res, 200, 'Courier serviceability checked successfully', result);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// HANDLE SHIPROCKET WEBHOOK
// ==========================================
export const handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body;
    const { awb, current_status, status, shipment_id } = payload;

    if (!awb) {
      return res.status(200).json({ message: 'No AWB found in payload' });
    }

    const Order = (await import('../models/order.model')).Order;
    
    // Find order by tracking number
    const order = await Order.findOne({ 'shipments.trackingNumber': awb });

    if (order) {
      const shipmentIndex = order.shipments.findIndex(s => s.trackingNumber === awb);
      if (shipmentIndex !== -1) {
        order.shipments[shipmentIndex].deliveryStatus = current_status || status;
        order.shipments[shipmentIndex].trackingData = payload;
        
        // Update order status if delivered
        if (status?.toLowerCase() === 'delivered') {
          order.orderStatus = 'delivered';
          order.statusHistory.push({
            status: 'delivered',
            comment: 'Order delivered via Shiprocket',
            timestamp: new Date()
          });
        }

        await order.save();
      }
    }

    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    console.error('Shiprocket Webhook Error:', error);
    // Always return 200 to Shiprocket to acknowledge receipt
    return res.status(200).json({ success: false, error: 'Internal Server Error' });
  }
};

// ==========================================
// GET ORDER INVOICE
// ==========================================
export const getOrderInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const Order = (await import('../models/order.model')).Order;
    const order = await Order.findById(id);

    if (!order) {
      throw new Error('Order not found');
    }

    const shiprocketOrderIds = order.shipments
      .map(s => s.shiprocketOrderId)
      .filter((id): id is number => !!id);

    if (shiprocketOrderIds.length === 0) {
      throw new Error('No Shiprocket order ID associated with this order');
    }

    const invoiceUrl = await shiprocketService.generateInvoice(shiprocketOrderIds);

    return httpResponse(req, res, 200, 'Invoice fetched successfully', { invoiceUrl });
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};
