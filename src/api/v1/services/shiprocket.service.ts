import env from '@/config/env';
import {
  ShiprocketAddress,
  ShiprocketPickupPayload,
} from '@/api/v1/interfaces/shiprocket.interface';
import mongoose from 'mongoose';

class ShiprocketService {
  private readonly email = env.SHIPROCKET_EMAIL;
  private readonly password = env.SHIPROCKET_PASSWORD;
  private readonly apiUrl = 'https://apiv2.shiprocket.in/v1/external';

  private token: string | null = null;
  private tokenExpiry: number | null = null;

  /**
   * Authenticates with Shiprocket and caches the JWT token.
   */
  private async getToken(): Promise<string> {
    if (env.SHIPROCKET_MOCK_MODE) return 'mock-token';

    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.token;
    }

    if (!this.email || !this.password) {
      throw new Error('SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD is not configured');
    }

    try {
      const response = await fetch(`${this.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email, password: this.password }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`Shiprocket Auth Error: ${response.status} - ${JSON.stringify(data)}`);
      }

      this.token = data.token;
      this.tokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
      return this.token as string;
    } catch (error) {
      throw new Error(`Failed to authenticate with Shiprocket: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Registers a new warehouse/pickup location with Shiprocket.
   */
  async addPickupLocation(payload: ShiprocketPickupPayload): Promise<ShiprocketAddress> {
    if (env.SHIPROCKET_MOCK_MODE) return { ...payload, country: payload.country || 'India' } as any;
    const token = await this.getToken();

    try {
      const response = await fetch(`${this.apiUrl}/settings/company/addpickup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...payload, country: payload.country || 'India' }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.status_code >= 400 || data?.success === false) {
        const errorMessage = data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Shiprocket validation failed';
        throw new Error(`Shiprocket Validation Error: ${errorMessage}`);
      }

      return data?.data?.address || data?.data?.shipping_address?.[0] || data?.data;
    } catch (error) {
      throw new Error(`Failed to add pickup location to Shiprocket: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetches all registered pickup locations/warehouses from Shiprocket.
   */
  async getPickupLocations(): Promise<ShiprocketAddress[]> {
    if (env.SHIPROCKET_MOCK_MODE) return [];
    const token = await this.getToken();

    try {
      const response = await fetch(`${this.apiUrl}/settings/company/pickup`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.status_code >= 400 || data?.success === false) {
        const errorMessage = data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Failed to fetch Shiprocket locations';
        throw new Error(`Shiprocket Fetch Error: ${errorMessage}`);
      }

      return data?.data?.shipping_address || [];
    } catch (error) {
      throw new Error(`Failed to retrieve pickup locations from Shiprocket: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Schedules a courier pickup for a specific shipment.
   */
  async schedulePickup(shipmentId: number | string): Promise<{
    pickupId?: string;
    pickupStatus?: number;
    message?: string;
  }> {
    if (env.SHIPROCKET_MOCK_MODE) return { pickupId: 'MOCK-P-123', pickupStatus: 1 };
    const token = await this.getToken();

    try {
      const response = await fetch(`${this.apiUrl}/courier/generate/pickup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shipment_id: [shipmentId] }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.pickup_status === 0) {
        const errorMessage = data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Pickup scheduling failed';
        throw new Error(`Shiprocket Pickup Error: ${errorMessage}`);
      }

      return {
        pickupId: data?.pickup_id,
        pickupStatus: data?.pickup_status,
        message: data?.message,
      };
    } catch (error) {
      throw new Error(`Failed to schedule pickup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Reschedules a pickup for an existing AWB.
   */
  async reschedulePickup(awb: string, storedShipmentId?: number): Promise<{
    shipmentId: number;
    pickupId?: string;
    pickupStatus?: number;
    message?: string;
  }> {
    let shipmentId = storedShipmentId;

    if (!shipmentId) {
      const tracking = await this.trackShipment(awb);
      shipmentId = tracking?.trackingData?.tracking_data?.shipment_track?.[0]?.shipment_id;

      if (!shipmentId) {
        throw new Error(`Could not recover Shiprocket shipment_id for AWB ${awb}`);
      }
    }

    const result = await this.schedulePickup(shipmentId);
    return { shipmentId, ...result };
  }

  /**
   * Cancels a Shiprocket shipment by AWB.
   */
  async cancelShipment(awb: string, storedShipmentId?: number): Promise<{
    shipmentId: number;
    status: number;
    message?: string;
    raw: unknown;
  }> {
    if (env.SHIPROCKET_MOCK_MODE) return { shipmentId: 0, status: 200, message: 'Cancelled', raw: {} };
    const token = await this.getToken();

    let shipmentId = storedShipmentId;
    if (!shipmentId) {
      const tracking = await this.trackShipment(awb);
      shipmentId = tracking?.trackingData?.tracking_data?.shipment_track?.[0]?.shipment_id;
      if (!shipmentId) throw new Error(`Could not recover shipment_id for AWB ${awb}`);
    }

    try {
      const response = await fetch(`${this.apiUrl}/orders/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: [shipmentId] }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || (data && data.status >= 400)) {
        throw new Error(data?.message || `Shiprocket cancel failed: HTTP ${response.status}`);
      }

      return {
        shipmentId,
        status: data?.status ?? response.status,
        message: data?.message,
        raw: data,
      };
    } catch (error) {
      throw new Error(`Failed to cancel Shiprocket shipment ${shipmentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates a forward shipment AWB.
   */
  async createPickup(payload: {
    orderId: string;
    pickupLocation: string;
    customerEmail?: string;
    shippingAddress: {
      fullName: string;
      phone: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state: string;
      postalCode: string;
      country?: string;
    };
    items: Array<{
      variantId: string;
      title: string;
      sku: string;
      quantity: number;
      sellingPrice: number;
      lineTotal: number;
    }>;
    weight: number;
    length: number;
    breadth: number;
    height: number;
  }): Promise<{
    shipmentId?: number;
    shiprocketOrderId?: number;
    courierName?: string;
    trackingNumber?: string;
    shippingLabelUrl?: string;
    pickupId?: string;
  }> {
    if (env.SHIPROCKET_MOCK_MODE) {
      return {
        shipmentId: Math.floor(Math.random() * 1000000),
        shiprocketOrderId: Math.floor(Math.random() * 1000000),
        courierName: 'Mock Express',
        trackingNumber: `MOCK-${Math.random().toString(36).substring(7).toUpperCase()}`,
        shippingLabelUrl: 'https://example.com/mock-label.pdf',
        pickupId: 'MOCK-P-123',
      };
    }

    const token = await this.getToken();

    const shiprocketItems = payload.items.map((item) => ({
      name: item.title.substring(0, 100),
      sku: item.sku,
      units: item.quantity,
      selling_price: item.sellingPrice,
    }));

    const nameParts = payload.shippingAddress.fullName.trim().split(' ');
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Customer';

    const shiprocketPayload = {
      order_id: `ORDER-${payload.orderId}`,
      order_date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      pickup_location: payload.pickupLocation,
      billing_customer_name: firstName,
      billing_last_name: lastName,
      billing_address: payload.shippingAddress.addressLine1,
      billing_address_2: payload.shippingAddress.addressLine2 || '',
      billing_city: payload.shippingAddress.city,
      billing_state: payload.shippingAddress.state,
      billing_country: payload.shippingAddress.country || 'India',
      billing_pincode: payload.shippingAddress.postalCode.toString(),
      billing_email: payload.customerEmail || 'contact@mscliq.com',
      billing_phone: payload.shippingAddress.phone.replace(/\D/g, ''),
      shipping_is_billing: true,
      order_items: shiprocketItems,
      payment_method: 'Prepaid',
      sub_total: payload.items.reduce((sum, i) => sum + i.lineTotal, 0),
      weight: payload.weight,
      length: payload.length,
      breadth: payload.breadth,
      height: payload.height,
    };

    try {
      // Step 1: Create order
      const orderResponse = await fetch(`${this.apiUrl}/orders/create/adhoc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(shiprocketPayload),
      });

      const orderData = await orderResponse.json().catch(() => null);
      if (!orderResponse.ok || orderData?.success === false) {
        throw new Error(`Order creation failed: ${orderData?.message || orderResponse.statusText}`);
      }

      const shipmentId = orderData?.shipment_id;
      if (!shipmentId) throw new Error('No shipment ID returned from Shiprocket');

      // Step 2: Assign AWB
      const awbResponse = await fetch(`${this.apiUrl}/courier/assign/awb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shipment_id: shipmentId }),
      });

      const awbData = await awbResponse.json().catch(() => null);
      if (!awbResponse.ok || awbData?.status === 0 || awbData?.awb_assign_status === 0) {
        throw new Error(`AWB Assignment failed: ${awbData?.message || awbResponse.statusText}`);
      }

      const trackingNumber = awbData?.response?.data?.awb_code;
      const courierName = awbData?.response?.data?.courier_name;

      // Step 3: Generate label
      const labelResponse = await fetch(`${this.apiUrl}/courier/generate/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shipment_id: [shipmentId] }),
      });

      const labelData = await labelResponse.json().catch(() => null);
      
      // Step 4: Schedule pickup
      let pickupId;
      try {
        const pResult = await this.schedulePickup(shipmentId);
        pickupId = pResult.pickupId;
      } catch (pErr) {
        console.error('[Shiprocket] Pickup scheduling failed:', pErr);
      }

      return {
        shipmentId,
        shiprocketOrderId: orderData?.order_id,
        courierName,
        trackingNumber,
        shippingLabelUrl: labelData?.label_url,
        pickupId,
      };
    } catch (error) {
      throw new Error(`Failed to create Shiprocket pickup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates a reverse shipment AWB.
   */
  async createReversePickup(payload: {
    orderId: string;
    returnRequestId: string;
    returnLocation: string;
    pickupAddress: {
      fullName: string;
      phone: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state: string;
      postalCode: string;
      country?: string;
    };
    items: Array<{
      variantId: string;
      title: string;
      sku: string;
      quantity: number;
    }>;
  }): Promise<{
    reverseAwb?: string;
    pickupScheduledDate?: string;
  }> {
    if (env.SHIPROCKET_MOCK_MODE) return { reverseAwb: 'MOCK-R-123', pickupScheduledDate: new Date().toISOString() };
    const token = await this.getToken();

    const reversePayload = {
      order_id: `RET-${payload.orderId}-${payload.returnRequestId}`,
      date: new Date().toISOString().split('T')[0],
      pickup_postcode: payload.pickupAddress.postalCode,
      pickup_location: payload.returnLocation,
      pickup_name: payload.pickupAddress.fullName,
      pickup_mobile: payload.pickupAddress.phone,
      pickup_address1: payload.pickupAddress.addressLine1,
      pickup_address2: payload.pickupAddress.addressLine2 || '',
      pickup_city: payload.pickupAddress.city,
      pickup_state: payload.pickupAddress.state,
      pickup_country: payload.pickupAddress.country || 'India',
      order_items: payload.items.map(i => ({ name: i.title, sku: i.sku, units: i.quantity })),
      weight: 0.5,
      length: 10,
      breadth: 10,
      height: 10,
    };

    try {
      const response = await fetch(`${this.apiUrl}/reverse-mu/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(reversePayload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.success === false) {
        throw new Error(`Reverse pickup failed: ${data?.message || response.statusText}`);
      }

      return {
        reverseAwb: data?.data?.awb_code,
        pickupScheduledDate: data?.data?.pickup_scheduled_date,
      };
    } catch (error) {
      throw new Error(`Failed to create reverse pickup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates invoice for order IDs.
   */
  async generateInvoice(orderIds: number[]): Promise<string> {
    if (env.SHIPROCKET_MOCK_MODE) return 'https://example.com/mock-invoice.pdf';
    const token = await this.getToken();

    try {
      const response = await fetch(`${this.apiUrl}/orders/print/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: orderIds }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.is_success) {
        throw new Error(data?.message || 'Invoice generation failed');
      }

      return data.invoice_url;
    } catch (error) {
      throw new Error(`Failed to generate Shiprocket invoice: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Checks courier serviceability between two postcodes.
   */
  async checkServiceability(params: {
    pickupPostcode: string;
    deliveryPostcode: string;
    weight: number;
    cod: 0 | 1;
  }): Promise<any> {
    const token = await this.getToken();

    const queryParams = new URLSearchParams({
      pickup_postcode: params.pickupPostcode,
      delivery_postcode: params.deliveryPostcode,
      weight: params.weight.toString(),
      cod: params.cod.toString(),
    });

    try {
      const response = await fetch(`${this.apiUrl}/courier/serviceability/?${queryParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || data?.status >= 400 || data?.success === false) {
        const errorMessage = data?.errors
          ? Object.values(data.errors).flat().join(', ')
          : data?.message || 'Shiprocket serviceability check failed';
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      throw new Error(
        `Failed to check courier serviceability: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Tracks a shipment using AWB number.
   */
  async trackShipment(awb: string): Promise<{
    trackingData: any;
    trackUrl: string;
    timeline: Array<{
      date: string;
      time: string;
      activity: string;
      location: string;
      isCompleted: boolean;
      isPredicted?: boolean;
    }>;
    currentStatus: string;
    estimatedDelivery: string | null;
    trackingStatus: number;
  }> {
    if (env.SHIPROCKET_MOCK_MODE) {
      return {
        trackingData: {},
        trackUrl: `https://shiprocket.co/tracking/${awb}`,
        timeline: this.generatePredictedTimeline(new Date(Date.now() + 86400000 * 3).toISOString()),
        currentStatus: 'Shipped',
        estimatedDelivery: '3 days from now',
        trackingStatus: 1,
      };
    }

    const token = await this.getToken();

    try {
      const response = await fetch(`${this.apiUrl}/courier/track/awb/${awb}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`Tracking failed: ${data?.message || response.statusText}`);
      }

      const trackingData = data?.tracking_data;
      const shipmentTrack = trackingData?.shipment_track?.[0];
      const activities = trackingData?.shipment_track_activities || [];

      const timeline = activities.map((event: any, index: number, arr: any[]) => ({
        date: event.date || '',
        time: event.time || '',
        activity: event.status || event.activity || 'Unknown',
        location: event.location || event.city || 'Unknown',
        isCompleted: index === 0, // newest first
        isPredicted: false,
      }));

      const currentStatus = shipmentTrack?.current_status || 'unknown';
      const estimatedDelivery = trackingData?.etd || shipmentTrack?.edd || null;
      const trackingStatus = trackingData?.track_status || 0;

      const finalTimeline = timeline.length > 0 ? timeline : this.generatePredictedTimeline(estimatedDelivery);

      return {
        trackingData: data,
        trackUrl: `https://shiprocket.co/tracking/${awb}`,
        timeline: finalTimeline,
        currentStatus,
        estimatedDelivery,
        trackingStatus,
      };
    } catch (error) {
      throw new Error(`Failed to track shipment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates a predicted timeline based on estimated delivery date.
   */
  private generatePredictedTimeline(estimatedDeliveryDate: string | null): any[] {
    const today = new Date();
    const edd = estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : new Date(today.getTime() + 86400000 * 5);
    
    const formatDate = (date: Date) => date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    return [
      { date: formatDate(today), time: '09:00 AM', activity: 'Packed & Dispatched', location: 'Warehouse', isCompleted: true, isPredicted: true },
      { date: formatDate(new Date(today.getTime() + 86400000)), time: '11:00 AM', activity: 'In Transit', location: 'Hub', isCompleted: false, isPredicted: true },
      { date: formatDate(edd), time: '06:00 PM', activity: 'Delivered', location: 'Destination', isCompleted: false, isPredicted: true },
    ];
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private mapStatusToActivity(status: string): string {
    const mapping: Record<string, string> = {
      'Order Created': 'Order Placed',
      'Payment Successful': 'Payment Confirmed',
      'Confirmed & Dispatched': 'Order Dispatched',
      'Delivered': 'Delivered',
      'Cancelled': 'Cancelled',
    };
    return mapping[status] || status;
  }
}

export const shiprocketService = new ShiprocketService();
