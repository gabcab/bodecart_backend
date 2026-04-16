import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CurrencyService implements OnModuleInit {
  private readonly logger = new Logger(CurrencyService.name);
  private rates: Record<string, number> = {};
  private lastFetch: Date | null = null;

  /** Country code (ISO 3166 alpha-2, alpha-3) or full country name to currency code mapping */
  static readonly COUNTRY_CURRENCY_MAP: Record<string, string> = {
    // North America
    US: 'USD', USA: 'USD',
    CA: 'CAD', CAN: 'CAD',
    MX: 'MXN', MEX: 'MXN',
    PR: 'USD', PRI: 'USD',

    // Caribbean & Central America
    DO: 'DOP', DOM: 'DOP',
    CR: 'CRC', CRI: 'CRC',
    PA: 'USD', PAN: 'USD',
    GT: 'GTQ', GTM: 'GTQ',
    HN: 'HNL', HND: 'HNL',
    SV: 'USD', SLV: 'USD',
    NI: 'NIO', NIC: 'NIO',
    CU: 'CUP', CUB: 'CUP',
    JM: 'JMD', JAM: 'JMD',
    HT: 'HTG', HTI: 'HTG',
    TT: 'TTD', TTO: 'TTD',

    // South America
    CO: 'COP', COL: 'COP',
    PE: 'PEN', PER: 'PEN',
    CL: 'CLP', CHL: 'CLP',
    AR: 'ARS', ARG: 'ARS',
    BR: 'BRL', BRA: 'BRL',
    VE: 'VES', VEN: 'VES',
    EC: 'USD', ECU: 'USD',
    BO: 'BOB', BOL: 'BOB',
    PY: 'PYG', PRY: 'PYG',
    UY: 'UYU', URY: 'UYU',

    // Europe
    ES: 'EUR', ESP: 'EUR',
    FR: 'EUR', FRA: 'EUR',
    DE: 'EUR', DEU: 'EUR',
    IT: 'EUR', ITA: 'EUR',
    PT: 'EUR', PRT: 'EUR',
    NL: 'EUR', NLD: 'EUR',
    BE: 'EUR', BEL: 'EUR',
    AT: 'EUR', AUT: 'EUR',
    IE: 'EUR', IRL: 'EUR',
    GB: 'GBP', GBR: 'GBP',
    CH: 'CHF', CHE: 'CHF',
    SE: 'SEK', SWE: 'SEK',
    NO: 'NOK', NOR: 'NOK',
    DK: 'DKK', DNK: 'DKK',
    PL: 'PLN', POL: 'PLN',

    // Full country names (English, Spanish, with and without accents)
    'DOMINICAN REPUBLIC': 'DOP',
    'REPUBLICA DOMINICANA': 'DOP',
    'REPÚBLICA DOMINICANA': 'DOP',
    'SPAIN': 'EUR',
    'ESPAÑA': 'EUR',
    'ESPANA': 'EUR',
    'UNITED STATES': 'USD',
    'ESTADOS UNIDOS': 'USD',
    'MEXICO': 'MXN',
    'MÉXICO': 'MXN',
    'COLOMBIA': 'COP',
    'PERU': 'PEN',
    'PERÚ': 'PEN',
    'CHILE': 'CLP',
    'ARGENTINA': 'ARS',
    'BRAZIL': 'BRL',
    'BRASIL': 'BRL',
    'UNITED KINGDOM': 'GBP',
    'REINO UNIDO': 'GBP',
    'PUERTO RICO': 'USD',
    'CANADA': 'CAD',
    'CANADÁ': 'CAD',
    'FRANCE': 'EUR',
    'FRANCIA': 'EUR',
    'GERMANY': 'EUR',
    'ALEMANIA': 'EUR',
  };

  /** Hardcoded fallback rates (units of currency per 1 USD) */
  private static readonly FALLBACK_RATES: Record<string, number> = {
    USD: 1.0,
    DOP: 58.5,
    EUR: 0.92,
    MXN: 17.15,
    COP: 3950.0,
    PEN: 3.72,
    CLP: 900.0,
    ARS: 870.0,
    BRL: 4.97,
    GBP: 0.79,
    CAD: 1.36,
    CRC: 520.0,
    GTQ: 7.82,
    HNL: 24.7,
    NIO: 36.6,
    CUP: 24.0,
    JMD: 155.0,
    HTG: 132.0,
    TTD: 6.78,
    VES: 36.5,
    BOB: 6.91,
    PYG: 7280.0,
    UYU: 39.2,
    CHF: 0.88,
    SEK: 10.5,
    NOK: 10.6,
    DKK: 6.87,
    PLN: 4.0,
  };

  private static readonly REDIS_KEY = 'currency:rates';
  private static readonly REDIS_TTL = 86400; // 24 hours in seconds
  private static readonly API_URL = 'https://open.er-api.com/v6/latest/USD';

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    await this.loadRates();
  }

  /**
   * Cron job to refresh rates every 12 hours
   */
  @Cron('0 */12 * * *')
  async handleRateRefresh() {
    this.logger.log('Scheduled exchange rate refresh triggered');
    await this.fetchRates();
  }

  /**
   * Load rates from Redis cache first, then fetch from API if needed
   */
  private async loadRates(): Promise<void> {
    try {
      const cached = await this.redisService.get<{
        rates: Record<string, number>;
        fetchedAt: string;
      }>(CurrencyService.REDIS_KEY);

      if (cached && cached.rates && Object.keys(cached.rates).length > 0) {
        this.rates = cached.rates;
        this.lastFetch = new Date(cached.fetchedAt);
        this.logger.log(
          `Loaded ${Object.keys(this.rates).length} exchange rates from Redis cache ` +
          `(fetched at ${this.lastFetch.toISOString()})`,
        );

        // If cache is older than 12 hours, refresh in background
        const cacheAge = Date.now() - this.lastFetch.getTime();
        if (cacheAge > 12 * 60 * 60 * 1000) {
          this.fetchRates().catch((err) =>
            this.logger.error('Background rate refresh failed', err),
          );
        }
        return;
      }
    } catch (err) {
      this.logger.warn('Could not load rates from Redis, will fetch from API');
    }

    await this.fetchRates();
  }

  /**
   * Fetch exchange rates from the free API.
   * Falls back to hardcoded rates if the API call fails.
   */
  async fetchRates(): Promise<void> {
    try {
      // Dynamic import to avoid issues if fetch is not available in all envs
      const response = await fetch(CurrencyService.API_URL, {
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();

      if (data.result !== 'success' || !data.rates) {
        throw new Error('Invalid API response format');
      }

      this.rates = data.rates as Record<string, number>;
      this.lastFetch = new Date();

      this.logger.log(
        `Fetched ${Object.keys(this.rates).length} exchange rates from API`,
      );

      // Cache in Redis
      await this.redisService.set(
        CurrencyService.REDIS_KEY,
        { rates: this.rates, fetchedAt: this.lastFetch.toISOString() },
        CurrencyService.REDIS_TTL,
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch exchange rates: ${error.message}. Using fallback rates.`,
      );

      // Only use fallback if we have no rates at all
      if (Object.keys(this.rates).length === 0) {
        this.rates = { ...CurrencyService.FALLBACK_RATES };
        this.lastFetch = new Date();
        this.logger.warn(
          `Using ${Object.keys(this.rates).length} hardcoded fallback rates`,
        );
      }
    }
  }

  /**
   * Get the exchange rate for a currency (units per 1 USD).
   * Returns 1.0 for USD or unknown currencies.
   */
  getRate(currency: string): number {
    const code = currency.toUpperCase();
    if (code === 'USD') return 1.0;
    return this.rates[code] ?? CurrencyService.FALLBACK_RATES[code] ?? 1.0;
  }

  /**
   * Convert an amount from a local currency to USD.
   * Example: toUsd(585, 'DOP') => 10.0 (if rate is 58.5)
   */
  toUsd(amount: number, fromCurrency: string): number {
    const code = fromCurrency.toUpperCase();
    if (code === 'USD') return amount;
    const rate = this.getRate(code);
    return parseFloat((amount / rate).toFixed(2));
  }

  /**
   * Convert an amount from USD to a local currency.
   * Example: fromUsd(10, 'DOP') => 585.0 (if rate is 58.5)
   */
  fromUsd(amountUsd: number, toCurrency: string): number {
    const code = toCurrency.toUpperCase();
    if (code === 'USD') return amountUsd;
    const rate = this.getRate(code);
    return parseFloat((amountUsd * rate).toFixed(2));
  }

  /**
   * Map a country code (ISO 3166 alpha-2, alpha-3) or full country name to a currency code.
   * Accepts English and Spanish names, with or without accents.
   * Returns 'USD' if the country is not found in the mapping.
   */
  static getCurrencyForCountry(countryCode: string): string {
    if (!countryCode) return 'USD';
    const code = countryCode.toUpperCase().trim();
    return CurrencyService.COUNTRY_CURRENCY_MAP[code] ?? 'USD';
  }

  /**
   * Get all currently loaded rates plus metadata.
   */
  getRatesInfo(): {
    rates: Record<string, number>;
    lastFetch: Date | null;
    source: 'api' | 'fallback';
    count: number;
  } {
    const isFromApi = Object.keys(this.rates).length > Object.keys(CurrencyService.FALLBACK_RATES).length;
    return {
      rates: { ...this.rates },
      lastFetch: this.lastFetch,
      source: isFromApi ? 'api' : 'fallback',
      count: Object.keys(this.rates).length,
    };
  }

  /**
   * Get a subset of rates for commonly used currencies
   */
  getCommonRates(): Record<string, number> {
    const commonCurrencies = [
      'USD', 'DOP', 'EUR', 'MXN', 'COP', 'PEN', 'CLP',
      'ARS', 'BRL', 'GBP', 'CAD',
    ];
    const result: Record<string, number> = {};
    for (const code of commonCurrencies) {
      result[code] = this.getRate(code);
    }
    return result;
  }
}
