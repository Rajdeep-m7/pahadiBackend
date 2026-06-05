/**
 * Maps raw orderStatus values to human-readable display labels.
 */
export const sanitizeOrderStatus = (status: string): string => {
  const labels: Record<string, string> = {
    pending_payment: 'Payment Pending',
    payment_failed: 'Payment Failed',
    payment_expired: 'Payment Expired',
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    returned: 'Returned',
  };
  return labels[status] ?? status;
};

/**
 * Maps paymentMethod values to human-readable labels.
 */
export const sanitizePaymentMethod = (method: string): string => {
  const labels: Record<string, string> = {
    razorpay: 'Online (Razorpay)',
    cod: 'Cash on Delivery',
    manual: 'Manual',
  };
  return labels[method] ?? method;
};