import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CurrencyService } from './currency.service';

@ApiTags('Currency')
@Controller('currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get('rates')
  @ApiOperation({
    summary: 'Get current exchange rates',
    description:
      'Returns exchange rates relative to USD. Rates are refreshed every 12 hours from the open.er-api.com service.',
  })
  @ApiResponse({
    status: 200,
    description: 'Exchange rates returned successfully',
    schema: {
      example: {
        rates: {
          USD: 1,
          DOP: 58.5,
          EUR: 0.92,
          MXN: 17.15,
          COP: 3950,
        },
        lastFetch: '2026-03-23T10:00:00.000Z',
        source: 'api',
        count: 160,
      },
    },
  })
  @ApiQuery({
    name: 'common',
    required: false,
    description: 'If "true", returns only the most common currencies for the platform',
    example: 'true',
  })
  getRates(@Query('common') common?: string) {
    if (common === 'true') {
      return {
        rates: this.currencyService.getCommonRates(),
        lastFetch: this.currencyService.getRatesInfo().lastFetch,
      };
    }
    return this.currencyService.getRatesInfo();
  }

  @Get('convert')
  @ApiOperation({
    summary: 'Convert an amount between currencies',
    description: 'Converts an amount from one currency to another using current rates.',
  })
  @ApiQuery({ name: 'amount', required: true, example: 100 })
  @ApiQuery({ name: 'from', required: true, example: 'DOP' })
  @ApiQuery({ name: 'to', required: true, example: 'USD' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        amount: 100,
        from: 'DOP',
        to: 'USD',
        result: 1.71,
        rate: 58.5,
      },
    },
  })
  convert(
    @Query('amount') amount: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      return { error: 'Invalid amount' };
    }

    const fromUpper = from?.toUpperCase() || 'USD';
    const toUpper = to?.toUpperCase() || 'USD';

    // Convert: from -> USD -> to
    const inUsd = this.currencyService.toUsd(numAmount, fromUpper);
    const result = this.currencyService.fromUsd(inUsd, toUpper);
    const fromRate = this.currencyService.getRate(fromUpper);
    const toRate = this.currencyService.getRate(toUpper);

    return {
      amount: numAmount,
      from: fromUpper,
      to: toUpper,
      result,
      fromRatePerUsd: fromRate,
      toRatePerUsd: toRate,
    };
  }

  @Get('country')
  @ApiOperation({
    summary: 'Get currency for a country code',
    description: 'Maps an ISO 3166 country code (2 or 3 letter) to its currency code.',
  })
  @ApiQuery({ name: 'code', required: true, example: 'DO' })
  @ApiResponse({
    status: 200,
    schema: {
      example: { country: 'DO', currency: 'DOP', rate: 58.5 },
    },
  })
  getCurrencyForCountry(@Query('code') code: string) {
    const currency = CurrencyService.getCurrencyForCountry(code);
    return {
      country: code?.toUpperCase(),
      currency,
      rate: this.currencyService.getRate(currency),
    };
  }
}
