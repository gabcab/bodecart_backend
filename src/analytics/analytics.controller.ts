import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BODEGA_OWNER, UserRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard/:bodegaId')
  @ApiOperation({ summary: 'Get dashboard statistics for a bodega' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard stats retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalOrders: { type: 'number', example: 150 },
        totalRevenue: { type: 'number', example: 5250.5 },
        todayOrders: { type: 'number', example: 8 },
        todayRevenue: { type: 'number', example: 320.0 },
        pendingOrders: { type: 'number', example: 3 },
        totalProducts: { type: 'number', example: 45 },
        lowStockProducts: { type: 'number', example: 5 },
      },
    },
  })
  async getDashboardStats(@Param('bodegaId') bodegaId: string) {
    return this.analyticsService.getDashboardStats(bodegaId);
  }

  @Get('sales-chart/:bodegaId')
  @ApiOperation({ summary: 'Get sales chart data for a bodega' })
  @ApiQuery({ name: 'startDate', required: true, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: true, example: '2024-12-31' })
  @ApiResponse({
    status: 200,
    description: 'Sales chart data retrieved successfully',
  })
  async getSalesChartData(
    @Param('bodegaId') bodegaId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getSalesChartData(bodegaId, startDate, endDate);
  }

  @Get('top-products/:bodegaId')
  @ApiOperation({ summary: 'Get top selling products for a bodega' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Top products retrieved successfully',
  })
  async getTopProducts(@Param('bodegaId') bodegaId: string, @Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10;
    return this.analyticsService.getTopProducts(bodegaId, limitNum);
  }

  @Get('export/:bodegaId')
  @ApiOperation({ summary: 'Export sales report for a bodega' })
  @ApiQuery({ name: 'startDate', required: true, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: true, example: '2024-12-31' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'pdf'], example: 'csv' })
  @ApiResponse({
    status: 200,
    description: 'Sales report exported successfully',
  })
  async exportSalesReport(
    @Param('bodegaId') bodegaId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('format') format: 'csv' | 'pdf' = 'csv',
    @Res() res: Response,
  ) {
    const report = await this.analyticsService.exportSalesReport(
      bodegaId,
      startDate,
      endDate,
      format,
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=sales-report-${bodegaId}-${startDate}-${endDate}.csv`,
      );
      res.send(report);
    } else {
      res.json(report);
    }
  }
}
