import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
}

export interface RouteStep {
  distance: number; // meters
  duration: number; // seconds
  instruction: string;
}

export interface Route {
  distance: number; // total distance in meters
  duration: number; // total duration in seconds
  geometry: [number, number][]; // array of [lng, lat] coordinates
  steps?: RouteStep[];
}

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);

  // Photon API (Komoot) - for geocoding
  private readonly PHOTON_BASE_URL = 'https://photon.komoot.io';

  // OSRM API (Project-OSRM) - for routing
  private readonly OSRM_BASE_URL = 'https://router.project-osrm.org';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Forward geocoding: convert address to coordinates
   * Uses Photon (Komoot) API
   */
  async geocode(address: string): Promise<GeocodingResult[]> {
    try {
      const url = `${this.PHOTON_BASE_URL}/api`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            q: address,
            limit: 5,
          },
          headers: {
            'User-Agent': 'BodeCart/1.0',
          },
        }),
      );

      const features = response.data.features || [];
      return features.map((feature: any) => ({
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        displayName: feature.properties.name || '',
        address: {
          street: feature.properties.street,
          city: feature.properties.city,
          state: feature.properties.state,
          country: feature.properties.country,
          postalCode: feature.properties.postcode,
        },
      }));
    } catch (error) {
      this.logger.error('Geocoding error:', error.message);
      throw new Error('Failed to geocode address');
    }
  }

  /**
   * Reverse geocoding: convert coordinates to address
   * Uses Photon (Komoot) API
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult> {
    try {
      const url = `${this.PHOTON_BASE_URL}/reverse`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            lat: latitude,
            lon: longitude,
          },
          headers: {
            'User-Agent': 'BodeCart/1.0',
          },
        }),
      );

      const feature = response.data.features[0];
      if (!feature) {
        throw new Error('No results found');
      }

      return {
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        displayName: feature.properties.name || '',
        address: {
          street: feature.properties.street,
          city: feature.properties.city,
          state: feature.properties.state,
          country: feature.properties.country,
          postalCode: feature.properties.postcode,
        },
      };
    } catch (error) {
      this.logger.error('Reverse geocoding error:', error.message);
      throw new Error('Failed to reverse geocode coordinates');
    }
  }

  /**
   * Calculate route between two points
   * Uses OSRM (Project-OSRM) API
   */
  async getRoute(
    from: Coordinates,
    to: Coordinates,
    profile: 'car' | 'bike' | 'foot' = 'car',
  ): Promise<Route> {
    try {
      const url = `${this.OSRM_BASE_URL}/route/v1/${profile}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;

      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            overview: 'full',
            geometries: 'geojson',
            steps: true,
          },
          headers: {
            'User-Agent': 'BodeCart/1.0',
          },
        }),
      );

      const route = response.data.routes[0];
      if (!route) {
        throw new Error('No route found');
      }

      // Parse steps
      const steps: RouteStep[] = [];
      if (route.legs && route.legs[0] && route.legs[0].steps) {
        for (const step of route.legs[0].steps) {
          steps.push({
            distance: step.distance,
            duration: step.duration,
            instruction: step.maneuver?.instruction || '',
          });
        }
      }

      return {
        distance: route.distance,
        duration: route.duration,
        geometry: route.geometry.coordinates,
        steps,
      };
    } catch (error) {
      this.logger.error('Routing error:', error.message);
      throw new Error('Failed to calculate route');
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in kilometers
   */
  calculateDistance(from: Coordinates, to: Coordinates): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(to.latitude - from.latitude);
    const dLon = this.toRad(to.longitude - from.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.latitude)) *
        Math.cos(this.toRad(to.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Check if a point is within a certain radius of another point
   */
  isWithinRadius(center: Coordinates, point: Coordinates, radiusKm: number): boolean {
    const distance = this.calculateDistance(center, point);
    return distance <= radiusKm;
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }
}
