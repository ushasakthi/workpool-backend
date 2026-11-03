import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { AppModule } from '../app.module';
import { toGeoJsonPoint } from '../common/schemas/geo-json-point.schema';
import { GeoPoint } from '../common/schemas/geo-point.schema';

// One-off script: adds originPoint/destinationPoint to rides posted before
// ride search existed, so the geo index can find them.
async function backfillRidePoints(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const rides = connection.collection('rides');

    const pending = await rides
      .find({ originPoint: { $exists: false } })
      .toArray();

    for (const ride of pending) {
      await rides.updateOne(
        { _id: ride._id },
        {
          $set: {
            originPoint: toGeoJsonPoint(ride.origin as GeoPoint),
            destinationPoint: toGeoJsonPoint(ride.destination as GeoPoint),
          },
        },
      );
    }

    console.log(`Backfilled GeoJSON points for ${pending.length} ride(s).`);
  } finally {
    await app.close();
  }
}

backfillRidePoints().catch((err: unknown) => {
  console.error('Ride points backfill failed:', err);
  process.exitCode = 1;
});
