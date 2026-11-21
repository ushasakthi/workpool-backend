import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { AppModule } from '../app.module';
import { GeoPoint } from '../common/schemas/geo-point.schema';
import { GeocodeService } from '../modules/geocode/geocode.service';

// One-off script: points saved while the phone couldn't look up place names
// got "6.8493, 79.8779" as their label. This swaps those for area names.
const COORDINATE_LABEL = /^-?\d+(\.\d+)?, -?\d+(\.\d+)?$/;
// OpenStreetMap allows at most 1 lookup per second
const DELAY_MS = 1100;

// only the fields this script reads, from a ride or a user
interface Doc {
  origin?: GeoPoint;
  destination?: GeoPoint;
  travelProfile?: { homeLocation?: GeoPoint; workLocation?: GeoPoint };
}

// each point field, with how to read it from a document
const RIDE_FIELDS = [
  { path: 'origin', read: (doc: Doc) => doc.origin },
  { path: 'destination', read: (doc: Doc) => doc.destination },
];
const USER_FIELDS = [
  {
    path: 'travelProfile.homeLocation',
    read: (doc: Doc) => doc.travelProfile?.homeLocation,
  },
  {
    path: 'travelProfile.workLocation',
    read: (doc: Doc) => doc.travelProfile?.workLocation,
  },
];

function needsLabel(point: GeoPoint | undefined): point is GeoPoint {
  return Boolean(point && (!point.label || COORDINATE_LABEL.test(point.label)));
}

async function backfillPlaceLabels(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const geocode = app.get(GeocodeService);
    let fixed = 0;

    const targets = [
      { collection: connection.collection('rides'), fields: RIDE_FIELDS },
      { collection: connection.collection('users'), fields: USER_FIELDS },
    ];

    for (const { collection, fields } of targets) {
      const docs = await collection.find().toArray();
      for (const doc of docs) {
        for (const { path, read } of fields) {
          const point = read(doc as Doc);
          if (!needsLabel(point)) continue;

          const { label } = await geocode.reverse(point.lat, point.lng);
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
          if (!label) continue;

          await collection.updateOne(
            { _id: doc._id },
            { $set: { [`${path}.label`]: label } },
          );
          fixed += 1;
          console.log(`${collection.collectionName} ${path}: ${label}`);
        }
      }
    }

    console.log(`Added place names to ${fixed} point(s).`);
  } finally {
    await app.close();
  }
}

backfillPlaceLabels().catch((err: unknown) => {
  console.error('Place label backfill failed:', err);
  process.exitCode = 1;
});
