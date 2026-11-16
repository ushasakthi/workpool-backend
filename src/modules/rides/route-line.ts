import { GeoPoint } from '../../common/schemas/geo-point.schema';

export interface GeoJsonLineString {
  type: 'LineString';
  // [lng, lat] pairs, GeoJSON order
  coordinates: number[][];
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

const KM_PER_DEGREE_LAT = 111.32;

// start → via → destination as a GeoJSON line; Mongo rejects two identical
// points in a row, so repeats (e.g. a via placed on the start) are dropped
export function toRouteLine(points: GeoPoint[]): GeoJsonLineString {
  const coordinates: number[][] = [];
  for (const point of points) {
    const last = coordinates[coordinates.length - 1];
    if (!last || last[0] !== point.lng || last[1] !== point.lat) {
      coordinates.push([point.lng, point.lat]);
    }
  }
  return { type: 'LineString', coordinates };
}

// a 24-sided shape standing in for a circle around `center`: Mongo can ask
// "which lines cross this shape?", but has no circle shape for lines
export function circlePolygon(
  center: GeoPoint,
  radiusKm: number,
  sides = 24,
): GeoJsonPolygon {
  const ring: number[][] = [];
  const kmPerDegreeLng =
    KM_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180);
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides;
    ring.push([
      center.lng + (radiusKm * Math.cos(angle)) / kmPerDegreeLng,
      center.lat + (radiusKm * Math.sin(angle)) / KM_PER_DEGREE_LAT,
    ]);
  }
  // GeoJSON rings end where they start
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}
