import env from '@/config/env';
import { EApplicationEnvironment } from '@/constant';

class WABridgeService {
  private readonly appKey = env.WA_APP_KEY;
  private readonly authKey = env.WA_AUTH_KEY;
  private readonly deviceId = env.WA_DEVICE_ID;
  private readonly apiUrl = env.WA_API_URL;
  private readonly templateId = env.WA_TEMPLATE_ID;
  private readonly welcomeTemplateId = env.WA_WELCOME_TEMPLATE_ID;

  /**
   * Formats phone number for WhatsApp API (Removes +, spaces, and ensures country code)
   */
  private formatPhoneNumber(phone: string): string {
    let cleanPhone = phone.replace(/[^0-9]/g, '');

    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    return cleanPhone;
  }

  /**
   * Sends an OTP using the WABridge Template API
   */
  async sendOtpTemplate(phone: string, otp: string): Promise<void> {
    const formattedPhone = this.formatPhoneNumber(phone);

    if (!this.templateId) {
      throw new Error('WA_TEMPLATE_ID is not configured in environment variables');
    }

    // Formatted exactly to your WABridge provider's specifications
    const payload = {
      'auth-key': this.authKey,
      'app-key': this.appKey,
      destination_number: formattedPhone,
      template_id: this.templateId,
      device_id: this.deviceId,
      language: 'en',
      variables: [otp, '7044076603'],
    };

    const isDev = env.ENV === EApplicationEnvironment.DEVELOPMENT;
    try {
      if (!isDev) {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          console.log(response);
          throw new Error(`WABridge API Error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
      } else {
        await new Promise((res, rej) => {
          res(true);
        });
      }
    } catch (error) {
      throw new Error(
        `Failed to send WhatsApp template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }

  /**
   * Sends a Welcome message using the WABridge Template API
   */
  async sendWelcomeTemplate(phone: string): Promise<void> {
    const formattedPhone = this.formatPhoneNumber(phone);

    if (!this.welcomeTemplateId) {
      throw new Error('WA_WELCOME_TEMPLATE_ID is not configured in environment variables');
    }

    const payload = {
      'auth-key': this.authKey,
      'app-key': this.appKey,
      destination_number: formattedPhone,
      template_id: this.welcomeTemplateId,
      device_id: this.deviceId,
      language: 'en',
      variables: [], // Add variables if required by the template
    };

    const isDev = env.ENV === EApplicationEnvironment.DEVELOPMENT;
    try {
      if (!isDev) {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(`WABridge API Error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
      } else {
        console.log(`[WABridge] Dev Mode: Welcome message would be sent to ${formattedPhone}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to send WhatsApp welcome template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }
}

export const waBridgeService = new WABridgeService();
