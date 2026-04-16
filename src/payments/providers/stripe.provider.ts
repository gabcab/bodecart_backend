import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeProvider {
  private readonly logger = new Logger(StripeProvider.name);
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('Stripe secret key not configured');
    }
    this.stripe = new Stripe(secretKey || '', {
      apiVersion: '2023-10-16',
    });
  }

  async createPaymentIntent(
    amount: number,
    currency: string = 'usd',
    metadata?: any,
  ): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        metadata: metadata || {},
        automatic_payment_methods: {
          enabled: true,
        },
      });

      this.logger.log(`Payment intent created: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error) {
      this.logger.error(`Failed to create payment intent: ${error.message}`);
      throw new BadRequestException('Failed to create payment intent');
    }
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodId: string,
  ): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });

      this.logger.log(`Payment confirmed: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error) {
      this.logger.error(`Failed to confirm payment: ${error.message}`);
      throw new BadRequestException('Failed to confirm payment');
    }
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      this.logger.error(`Failed to retrieve payment intent: ${error.message}`);
      throw new BadRequestException('Failed to retrieve payment intent');
    }
  }

  async createRefund(
    paymentIntentId: string,
    amount?: number,
    reason?: string,
  ): Promise<Stripe.Refund> {
    try {
      const refundData: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100); // Convert to cents
      }

      if (reason) {
        refundData.metadata = { reason };
      }

      const refund = await this.stripe.refunds.create(refundData);

      this.logger.log(`Refund created: ${refund.id}`);
      return refund;
    } catch (error) {
      this.logger.error(`Failed to create refund: ${error.message}`);
      throw new BadRequestException('Failed to create refund');
    }
  }

  async createCustomer(email: string, name: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
      });

      this.logger.log(`Customer created: ${customer.id}`);
      return customer;
    } catch (error) {
      this.logger.error(`Failed to create customer: ${error.message}`);
      throw new BadRequestException('Failed to create customer');
    }
  }

  /**
   * Retrieve a customer by ID
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      return customer;
    } catch (error) {
      this.logger.error(`Failed to retrieve customer: ${error.message}`);
      throw new BadRequestException('Failed to retrieve customer');
    }
  }

  /**
   * Set the default payment method for a customer
   */
  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      this.logger.log(`Default payment method set for customer ${customerId}`);
      return customer;
    } catch (error) {
      this.logger.error(`Failed to set default payment method: ${error.message}`);
      throw new BadRequestException('Failed to set default payment method');
    }
  }

  /**
   * Create a PaymentIntent with a customer and optional payment method
   */
  async createPaymentIntentWithCustomer(
    amount: number,
    currency: string = 'usd',
    customerId: string,
    paymentMethodId?: string,
    metadata?: any,
  ): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency,
        customer: customerId,
        payment_method: paymentMethodId,
        metadata: metadata || {},
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
      });

      this.logger.log(`Payment intent created with customer: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error) {
      this.logger.error(`Failed to create payment intent with customer: ${error.message}`);
      throw new BadRequestException('Failed to create payment intent');
    }
  }

  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string,
  ): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      this.logger.log(`Payment method attached: ${paymentMethod.id}`);
      return paymentMethod;
    } catch (error) {
      this.logger.error(`Failed to attach payment method: ${error.message}`);
      throw new BadRequestException('Failed to attach payment method');
    }
  }

  /**
   * Get the Stripe publishable key for client-side initialization
   */
  getPublishableKey(): string {
    const publishableKey = this.configService.get<string>('STRIPE_PUBLISHABLE_KEY');
    if (!publishableKey) {
      throw new BadRequestException('Stripe publishable key not configured');
    }
    return publishableKey;
  }

  /**
   * Create a SetupIntent for saving card without immediate payment
   */
  async createSetupIntent(customerId?: string): Promise<Stripe.SetupIntent> {
    try {
      const setupIntent = await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      });

      this.logger.log(`Setup intent created: ${setupIntent.id}`);
      return setupIntent;
    } catch (error) {
      this.logger.error(`Failed to create setup intent: ${error.message}`);
      throw new BadRequestException('Failed to create setup intent');
    }
  }

  /**
   * List customer's saved payment methods
   */
  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });
      return paymentMethods.data;
    } catch (error) {
      this.logger.error(`Failed to list payment methods: ${error.message}`);
      throw new BadRequestException('Failed to list payment methods');
    }
  }

  /**
   * Detach a payment method from customer
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.detach(paymentMethodId);
      this.logger.log(`Payment method detached: ${paymentMethod.id}`);
      return paymentMethod;
    } catch (error) {
      this.logger.error(`Failed to detach payment method: ${error.message}`);
      throw new BadRequestException('Failed to detach payment method');
    }
  }

  /**
   * Get Stripe account balance
   */
  async getBalance(): Promise<Stripe.Balance> {
    // Return empty data if Stripe is not configured
    if (!this.isConfigured()) {
      this.logger.warn('Stripe is not configured - returning empty balance');
      return {
        available: [],
        pending: [],
        livemode: false,
        object: 'balance',
      } as Stripe.Balance;
    }

    try {
      const balance = await this.stripe.balance.retrieve();
      this.logger.log('Balance retrieved successfully');
      return balance;
    } catch (error) {
      this.logger.error(`Failed to retrieve balance: ${error.message}`);
      throw new BadRequestException('Failed to retrieve balance');
    }
  }

  /**
   * Get balance transactions (successful charges, refunds, etc.)
   */
  async getBalanceTransactions(params?: {
    limit?: number;
    starting_after?: string;
    ending_before?: string;
    created?: { gte?: number; lte?: number };
    type?: string;
  }): Promise<Stripe.ApiList<Stripe.BalanceTransaction>> {
    try {
      const transactions = await this.stripe.balanceTransactions.list({
        limit: params?.limit || 100,
        starting_after: params?.starting_after,
        ending_before: params?.ending_before,
        created: params?.created,
        type: params?.type,
      });
      this.logger.log(`Retrieved ${transactions.data.length} balance transactions`);
      return transactions;
    } catch (error) {
      this.logger.error(`Failed to retrieve balance transactions: ${error.message}`);
      throw new BadRequestException('Failed to retrieve balance transactions');
    }
  }

  /**
   * Get all charges (payments)
   */
  async getCharges(params?: {
    limit?: number;
    starting_after?: string;
    ending_before?: string;
    created?: { gte?: number; lte?: number };
  }): Promise<Stripe.ApiList<Stripe.Charge>> {
    // Return empty data if Stripe is not configured
    if (!this.isConfigured()) {
      this.logger.warn('Stripe is not configured - returning empty charges list');
      return {
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/charges',
      } as Stripe.ApiList<Stripe.Charge>;
    }

    try {
      const charges = await this.stripe.charges.list({
        limit: params?.limit || 100,
        starting_after: params?.starting_after,
        ending_before: params?.ending_before,
        created: params?.created,
      });
      this.logger.log(`Retrieved ${charges.data.length} charges`);
      return charges;
    } catch (error) {
      this.logger.error(`Failed to retrieve charges: ${error.message}`);
      throw new BadRequestException('Failed to retrieve charges');
    }
  }

  /**
   * Get payment intents with optional filters
   */
  async getPaymentIntents(params?: {
    limit?: number;
    starting_after?: string;
    ending_before?: string;
    created?: { gte?: number; lte?: number };
  }): Promise<Stripe.ApiList<Stripe.PaymentIntent>> {
    try {
      const paymentIntents = await this.stripe.paymentIntents.list({
        limit: params?.limit || 100,
        starting_after: params?.starting_after,
        ending_before: params?.ending_before,
        created: params?.created,
      });
      this.logger.log(`Retrieved ${paymentIntents.data.length} payment intents`);
      return paymentIntents;
    } catch (error) {
      this.logger.error(`Failed to retrieve payment intents: ${error.message}`);
      throw new BadRequestException('Failed to retrieve payment intents');
    }
  }

  /**
   * Check if Stripe is properly configured
   */
  isConfigured(): boolean {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    return !!secretKey && secretKey.length > 0;
  }

  /**
   * Get total revenue from successful charges
   */
  async getTotalRevenue(): Promise<{
    totalRevenue: number;
    totalCharges: number;
    currency: string;
  }> {
    // Return empty data if Stripe is not configured
    if (!this.isConfigured()) {
      this.logger.warn('Stripe is not configured - returning empty revenue data');
      return {
        totalRevenue: 0,
        totalCharges: 0,
        currency: 'usd',
      };
    }

    try {
      let totalRevenue = 0;
      let totalCharges = 0;
      let hasMore = true;
      let startingAfter: string | undefined;

      // Paginate through all charges to calculate total
      while (hasMore) {
        const charges = await this.stripe.charges.list({
          limit: 100,
          starting_after: startingAfter,
        });

        for (const charge of charges.data) {
          // Only count successful charges that are not refunded
          if (charge.status === 'succeeded' && !charge.refunded) {
            totalRevenue += charge.amount - (charge.amount_refunded || 0);
            totalCharges++;
          }
        }

        hasMore = charges.has_more;
        if (hasMore && charges.data.length > 0) {
          startingAfter = charges.data[charges.data.length - 1].id;
        }
      }

      // Convert from cents to dollars
      return {
        totalRevenue: totalRevenue / 100,
        totalCharges,
        currency: 'usd',
      };
    } catch (error) {
      this.logger.error(`Failed to calculate total revenue: ${error.message}`);
      throw new BadRequestException('Failed to calculate total revenue');
    }
  }

  // ==================== STRIPE CONNECT METHODS ====================

  /**
   * Countries where Stripe Connect is available and the applicable TOS agreement type.
   * 'full' = domestic Stripe accounts (US, CA, etc.)
   * 'recipient' = cross-border recipient accounts (DO, etc.)
   */
  private static readonly COUNTRY_TOS_MAP: Record<string, 'full' | 'recipient'> = {
    US: 'full',
    CA: 'full',
    MX: 'recipient',
    PR: 'full', // Puerto Rico uses US Stripe
    DO: 'recipient', // Dominican Republic
    ES: 'full',
    GB: 'full',
    FR: 'full',
    DE: 'full',
    BR: 'recipient',
    CO: 'recipient',
    CL: 'recipient',
    PE: 'recipient',
    AR: 'recipient',
  };

  /**
   * Map common country names (in Spanish / English) to ISO 3166-1 alpha-2 codes.
   */
  static normalizeCountryCode(input: string): string {
    if (!input) return 'US';

    const upper = input.trim().toUpperCase();

    // Already a 2-letter ISO code
    if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) {
      return upper;
    }

    const NAME_MAP: Record<string, string> = {
      'USA': 'US',
      'UNITED STATES': 'US',
      'ESTADOS UNIDOS': 'US',
      'CANADA': 'CA',
      'CANADÁ': 'CA',
      'MEXICO': 'MX',
      'MÉXICO': 'MX',
      'PUERTO RICO': 'PR',
      'DOMINICAN REPUBLIC': 'DO',
      'REPÚBLICA DOMINICANA': 'DO',
      'REPUBLICA DOMINICANA': 'DO',
      'SPAIN': 'ES',
      'ESPAÑA': 'ES',
      'ESPANA': 'ES',
      'UNITED KINGDOM': 'GB',
      'REINO UNIDO': 'GB',
      'FRANCE': 'FR',
      'FRANCIA': 'FR',
      'GERMANY': 'DE',
      'ALEMANIA': 'DE',
      'BRAZIL': 'BR',
      'BRASIL': 'BR',
      'COLOMBIA': 'CO',
      'CHILE': 'CL',
      'PERU': 'PE',
      'PERÚ': 'PE',
      'ARGENTINA': 'AR',
    };

    return NAME_MAP[upper] || upper;
  }

  /**
   * Create a Stripe Connect Express account for a seller/delivery person.
   * Supports multiple countries with proper TOS agreement handling.
   */
  async createConnectedAccount(params: {
    email: string;
    type: 'bodeguero' | 'repartidor';
    businessName?: string;
    firstName?: string;
    lastName?: string;
    country?: string;
  }): Promise<Stripe.Account> {
    try {
      const country = StripeProvider.normalizeCountryCode(params.country || 'US');
      const tosType = StripeProvider.COUNTRY_TOS_MAP[country] || 'recipient';

      this.logger.log(
        `Creating connected account for ${params.type} in country=${country} (TOS=${tosType})`,
      );

      const accountData: Stripe.AccountCreateParams = {
        type: 'express',
        country,
        email: params.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: params.type === 'bodeguero' ? 'company' : 'individual',
        business_profile: {
          name: params.businessName,
          product_description:
            params.type === 'bodeguero'
              ? 'Bodega/convenience store selling products through BodeCart'
              : 'Delivery services for BodeCart platform',
        },
        metadata: {
          platform: 'bodecart',
          userType: params.type,
          country,
        },
      };

      // Full Stripe countries support card_payments
      if (tosType === 'full') {
        accountData.capabilities!.card_payments = { requested: true };
      }

      // Cross-border (recipient) accounts require explicit TOS acceptance type
      if (tosType === 'recipient') {
        accountData.tos_acceptance = {
          service_agreement: 'recipient',
        };
      }

      const account = await this.stripe.accounts.create(accountData);

      this.logger.log(
        `Connected account created: ${account.id} for ${params.type} (country=${country})`,
      );
      return account;
    } catch (error) {
      this.logger.error(`Failed to create connected account: ${error.message}`);
      throw new BadRequestException(`Failed to create connected account: ${error.message}`);
    }
  }

  /**
   * Generate an account link for onboarding (Stripe Connect Express)
   */
  async createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<Stripe.AccountLink> {
    try {
      const accountLink = await this.stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      this.logger.log(`Account link created for: ${accountId}`);
      return accountLink;
    } catch (error) {
      this.logger.error(`Failed to create account link: ${error.message}`);
      throw new BadRequestException('Failed to create account link');
    }
  }

  /**
   * Create a login link for an existing connected account (access Express Dashboard)
   */
  async createLoginLink(accountId: string): Promise<Stripe.LoginLink> {
    try {
      const loginLink = await this.stripe.accounts.createLoginLink(accountId);
      this.logger.log(`Login link created for: ${accountId}`);
      return loginLink;
    } catch (error) {
      this.logger.error(`Failed to create login link: ${error.message}`);
      throw new BadRequestException('Failed to create login link');
    }
  }

  /**
   * Retrieve a connected account's details and status
   */
  async getConnectedAccount(accountId: string): Promise<Stripe.Account> {
    try {
      const account = await this.stripe.accounts.retrieve(accountId);
      return account;
    } catch (error) {
      this.logger.error(`Failed to retrieve connected account: ${error.message}`);
      throw new BadRequestException('Failed to retrieve connected account');
    }
  }

  /**
   * Check if a connected account has completed onboarding and can receive payouts
   */
  async isAccountReady(accountId: string): Promise<{
    isReady: boolean;
    detailsSubmitted: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requirements: string[];
  }> {
    try {
      const account = await this.stripe.accounts.retrieve(accountId);

      const requirements = [
        ...(account.requirements?.currently_due || []),
        ...(account.requirements?.eventually_due || []),
      ];

      return {
        isReady: account.details_submitted && account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        requirements,
      };
    } catch (error) {
      this.logger.error(`Failed to check account status: ${error.message}`);
      throw new BadRequestException('Failed to check account status');
    }
  }

  /**
   * Create a transfer to a connected account
   * This moves funds from the platform's Stripe balance to the connected account
   */
  async createTransfer(
    amount: number, // in dollars
    connectedAccountId: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.Transfer> {
    try {
      const transfer = await this.stripe.transfers.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        destination: connectedAccountId,
        metadata: metadata || {},
      });

      this.logger.log(`Transfer created: ${transfer.id} to ${connectedAccountId} for $${amount}`);
      return transfer;
    } catch (error) {
      this.logger.error(`Failed to create transfer: ${error.message}`);
      throw new BadRequestException(`Failed to create transfer: ${error.message}`);
    }
  }

  /**
   * Get transfers to a connected account
   */
  async getTransfers(params?: {
    destination?: string;
    limit?: number;
    startingAfter?: string;
  }): Promise<Stripe.ApiList<Stripe.Transfer>> {
    try {
      const transfers = await this.stripe.transfers.list({
        destination: params?.destination,
        limit: params?.limit || 100,
        starting_after: params?.startingAfter,
      });
      return transfers;
    } catch (error) {
      this.logger.error(`Failed to retrieve transfers: ${error.message}`);
      throw new BadRequestException('Failed to retrieve transfers');
    }
  }

  /**
   * Get all connected accounts
   */
  async getConnectedAccounts(params?: {
    limit?: number;
    startingAfter?: string;
  }): Promise<Stripe.ApiList<Stripe.Account>> {
    try {
      const accounts = await this.stripe.accounts.list({
        limit: params?.limit || 100,
        starting_after: params?.startingAfter,
      });
      return accounts;
    } catch (error) {
      this.logger.error(`Failed to retrieve connected accounts: ${error.message}`);
      throw new BadRequestException('Failed to retrieve connected accounts');
    }
  }

  /**
   * Get balance of a connected account
   */
  async getConnectedAccountBalance(accountId: string): Promise<Stripe.Balance> {
    try {
      const balance = await this.stripe.balance.retrieve({
        stripeAccount: accountId,
      });
      return balance;
    } catch (error) {
      this.logger.error(`Failed to retrieve connected account balance: ${error.message}`);
      throw new BadRequestException('Failed to retrieve connected account balance');
    }
  }

  /**
   * Create an instant payout for a connected account
   * (requires account to have instant payout capability)
   */
  async createInstantPayout(
    amount: number,
    accountId: string,
  ): Promise<Stripe.Payout> {
    try {
      const payout = await this.stripe.payouts.create(
        {
          amount: Math.round(amount * 100),
          currency: 'usd',
          method: 'instant',
        },
        {
          stripeAccount: accountId,
        },
      );

      this.logger.log(`Instant payout created: ${payout.id} for $${amount}`);
      return payout;
    } catch (error) {
      this.logger.error(`Failed to create instant payout: ${error.message}`);
      throw new BadRequestException(`Failed to create instant payout: ${error.message}`);
    }
  }

  /**
   * Update payout schedule for a connected account
   */
  async updatePayoutSchedule(
    accountId: string,
    schedule: {
      interval: 'daily' | 'weekly' | 'monthly' | 'manual';
      weeklyAnchor?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';
      monthlyAnchor?: number;
    },
  ): Promise<Stripe.Account> {
    try {
      const account = await this.stripe.accounts.update(accountId, {
        settings: {
          payouts: {
            schedule: {
              interval: schedule.interval,
              weekly_anchor: schedule.weeklyAnchor,
              monthly_anchor: schedule.monthlyAnchor,
            },
          },
        },
      });

      this.logger.log(`Payout schedule updated for: ${accountId}`);
      return account;
    } catch (error) {
      this.logger.error(`Failed to update payout schedule: ${error.message}`);
      throw new BadRequestException('Failed to update payout schedule');
    }
  }

  /**
   * Delete/deauthorize a connected account
   */
  async deleteConnectedAccount(accountId: string): Promise<Stripe.DeletedAccount> {
    try {
      const deleted = await this.stripe.accounts.del(accountId);
      this.logger.log(`Connected account deleted: ${accountId}`);
      return deleted;
    } catch (error) {
      this.logger.error(`Failed to delete connected account: ${error.message}`);
      throw new BadRequestException('Failed to delete connected account');
    }
  }
}
