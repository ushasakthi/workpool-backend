import { haversine } from './matching/smart-matching.service';
import { circlePolygon, toRouteLine } from './route-line';

describe('toRouteLine', () => {
  it('builds a GeoJSON line in [lng, lat] order', () => {
    expect(
      toRouteLine([
        { lat: 6.85, lng: 79.87 },
        { lat: 6.95, lng: 79.86 },
      ]),
    ).toEqual({
      type: 'LineString',
      coordinates: [
        [79.87, 6.85],
        [79.86, 6.95],
      ],
    });
  });

  it('drops a point repeated right after itself (Mongo rejects those)', () => {
    const start = { lat: 6.85, lng: 79.87 };
    const line = toRouteLine([start, start, { lat: 6.95, lng: 79.86 }]);
    expect(line.coordinates).toHaveLength(2);
  });
});

describe('circlePolygon', () => {
  it('is a closed ring whose corners are all about the radius from the centre', () => {
    const center = { lat: 6.9, lng: 79.86 };
    const ring = circlePolygon(center, 3).coordinates[0];

    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) {
      expect(haversine(center, { lat, lng })).toBeCloseTo(3, 1);
    }
  });
});
