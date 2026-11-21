import { Injectable, Logger } from '@nestjs/common';

// OpenStreetMap's free place-name service. It refuses requests without a
// User-Agent naming the app, which is why the phone can't call it directly.
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'WorkPool/1.0 (university capstone project)';
const REQUEST_TIMEOUT_MS = 6000;

export interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
}

interface NominatimReverseResponse {
  address?: NominatimAddress;
}

// an area name, not a street address, e.g. "Near Bambalapitiya, Colombo"
export function approxLabel(address: NominatimAddress): string | null {
  const area =
    address.neighbourhood ??
    address.suburb ??
    address.quarter ??
    address.city_district;
  const place =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.state;

  if (area && place) return `Near ${area}, ${place}`;
  if (place) return `Near ${place}`;
  if (area) return `Near ${area}`;
  return null;
}

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);

  // null when the name can't be found; the app then shows the coordinates
  async reverse(lat: number, lng: number): Promise<{ label: string | null }> {
    const url = `${NOMINATIM_REVERSE_URL}?format=json&zoom=14&lat=${lat}&lon=${lng}`;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`Place name lookup failed: HTTP ${response.status}`);
        return { label: null };
      }
      const data = (await response.json()) as NominatimReverseResponse;
      return { label: data.address ? approxLabel(data.address) : null };
    } catch (err) {
      this.logger.warn(`Place name lookup failed: ${String(err)}`);
      return { label: null };
    }
  }
}
