import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface PayPalAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

interface PayPalCaptureResponse {
  id: string;
  status: string;
  purchase_units: Array<{
    payments: {
      captures: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
}

@Injectable()
export class PayPalProvider {
  private readonly logger = new Logger(PayPalProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET') || '';
    const mode = this.configService.get<string>('PAYPAL_MODE') || 'sandbox';
    this.baseUrl =
      mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('PayPal credentials not configured');
    }
  }

  private async getAccessToken(): Promise<string> {
    try {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const response = await axios.post<PayPalAuthResponse>(
        `${this.baseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      return response.data.access_token;
    } catch (error) {
      this.logger.error(`Failed to get PayPal access token: ${error.message}`);
      throw new BadRequestException('Failed to authenticate with PayPal');
    }
  }

  /**
   * Create a PayPal order for checkout
   */
  async createOrder(
    amount: number,
    currency: string = 'USD',
    orderId: string,
    returnUrl: string,
    cancelUrl: string,
  ): Promise<{ orderId: string; approvalUrl: string }> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.post<PayPalOrderResponse>(
        `${this.baseUrl}/v2/checkout/orders`,
        {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: orderId,
              amount: {
                currency_code: currency,
                value: amount.toFixed(2),
              },
              description: `Order ${orderId}`,
            },
          ],
          application_context: {
            return_url: returnUrl,
            cancel_url: cancelUrl,
            brand_name: 'BodeCart',
            user_action: 'PAY_NOW',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const approvalLink = response.data.links.find((link) => link.rel === 'approve');
      if (!approvalLink) {
        throw new BadRequestException('PayPal approval URL not found');
      }

      this.logger.log(`PayPal order created: ${response.data.id}`);
      return {
        orderId: response.data.id,
        approvalUrl: approvalLink.href,
      };
    } catch (error) {
      this.logger.error(`Failed to create PayPal order: ${error.message}`);
      throw new BadRequestException('Failed to create PayPal order');
    }
  }

  /**
   * Capture a PayPal order after user approval
   */
  async captureOrder(paypalOrderId: string): Promise<{
    captureId: string;
    status: string;
    amount: number;
  }> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.post<PayPalCaptureResponse>(
        `${this.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const capture = response.data.purchase_units[0]?.payments?.captures[0];
      if (!capture) {
        throw new BadRequestException('PayPal capture not found');
      }

      this.logger.log(`PayPal order captured: ${response.data.id}`);
      return {
        captureId: capture.id,
        status: capture.status,
        amount: parseFloat(capture.amount.value),
      };
    } catch (error) {
      this.logger.error(`Failed to capture PayPal order: ${error.message}`);
      throw new BadRequestException('Failed to capture PayPal order');
    }
  }

  /**
   * Get order details
   */
  async getOrderDetails(paypalOrderId: string): Promise<PayPalOrderResponse> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.get<PayPalOrderResponse>(
        `${this.baseUrl}/v2/checkout/orders/${paypalOrderId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get PayPal order details: ${error.message}`);
      throw new BadRequestException('Failed to get PayPal order details');
    }
  }
}
