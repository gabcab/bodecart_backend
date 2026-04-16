import { Controller, Get, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { MapsService } from './maps.service';

@ApiTags('Maps')
@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Get('geocode')
  @ApiOperation({ summary: 'Geocode an address to coordinates' })
  @ApiQuery({ name: 'address', required: true, example: '1600 Amphitheatre Pkwy, Mountain View, CA' })
  @ApiResponse({ status: 200, description: 'Coordinates returned' })
  async geocode(@Query('address') address?: string) {
    if (!address || !address.trim()) {
      throw new BadRequestException('address query param is required');
    }

    const results = await this.mapsService.geocode(address);
    if (!results.length) {
      throw new NotFoundException('No geocoding results found');
    }

    const top = results[0];
    return {
      latitude: top.latitude,
      longitude: top.longitude,
      displayName: top.displayName,
      address: top.address,
    };
  }

  @Get('reverse')
  @ApiOperation({ summary: 'Reverse geocode coordinates to address' })
  @ApiQuery({ name: 'latitude', required: true, example: 37.422 })
  @ApiQuery({ name: 'longitude', required: true, example: -122.084 })
  @ApiResponse({ status: 200, description: 'Address returned' })
  async reverse(@Query('latitude') latitude?: string, @Query('longitude') longitude?: string) {
    const lat = latitude ? Number(latitude) : NaN;
    const lng = longitude ? Number(longitude) : NaN;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new BadRequestException('latitude and longitude query params are required');
    }

    return this.mapsService.reverseGeocode(lat, lng);
  }
}
