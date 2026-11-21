import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

import { AppModule } from '../app.module';
import { RideStatus, Weekday } from '../common/constants';
import { RidesService } from '../modules/rides/rides.service';

// Sprint 8 timing check for GET /rides/search.
//   npm run perf:search             -> 5000 extra rides
//   npm run perf:search -- 20000    -> a bigger dataset
// Adds temporary rides (label "perf-test"), times the real RidesService.search,
// asks Mongo to explain the geo query, then deletes the temporary rides.
// Needs the demo data (npm run seed:demo) for the passenger and drivers.

const PERF_LABEL = 'perf-test';
const RUNS = 30;
const EARTH_RADIUS_KM = 6371;
const WEEKDAYS = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
];

const random = (min: number, max: number) => min + Math.random() * (max - min);

function percentile(sorted: number[], p: number): number {
  return sorted[
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  ];
}

async function perfSearch(): Promise<void> {
  const count = Number(process.argv[2] ?? 5000);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const connection = app.get<Connection>(getConnectionToken());
  const rides = connection.collection('rides');

  try {
    const passenger = await connection
      .collection('users')
      .findOne({ email: 'ishara@demo.workpool.lk' });
    const vehicles = await connection
      .collection('vehicles')
      .find({ plateNumber: { $regex: '^WP ' } })
      .toArray();
    if (!passenger || vehicles.length === 0) {
      throw new Error('Run `npm run seed:demo` first.');
    }

    // spread across greater Colombo, departures 6:00-9:30 Colombo time
    const tomorrow = new Date(Date.now() + 86_400_000);
    await rides.insertMany(
      Array.from({ length: count }, () => {
        const vehicle = vehicles[Math.floor(Math.random() * vehicles.length)];
        const origin = {
          lat: random(6.8, 7.0),
          lng: random(79.83, 80.0),
          label: PERF_LABEL,
        };
        const destination = {
          lat: random(6.9, 6.94),
          lng: random(79.84, 79.9),
          label: PERF_LABEL,
        };
        const departure = new Date(tomorrow);
        departure.setUTCHours(0, Math.floor(random(30, 240)), 0, 0); // 06:00-09:30 Colombo
        return {
          driverId: vehicle.ownerId as Types.ObjectId,
          vehicleId: vehicle._id,
          origin,
          destination,
          originPoint: { type: 'Point', coordinates: [origin.lng, origin.lat] },
          destinationPoint: {
            type: 'Point',
            coordinates: [destination.lng, destination.lat],
          },
          departureTime: departure,
          daysOfWeek: WEEKDAYS,
          seatsAvailable: 3,
          costContribution: 400,
          status: RideStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
    );
    const total = await rides.countDocuments();
    console.log(`Rides in the collection: ${total} (${count} temporary)\n`);

    const ridesService = app.get(RidesService);
    const passengerId = String(passenger._id);
    const home = (
      passenger.travelProfile as { homeLocation: { lat: number; lng: number } }
    ).homeLocation;

    for (const km of [1, 5]) {
      const input = { maxDistanceKm: km, page: 1, limit: 20 };
      await ridesService.search(passengerId, input); // warm-up

      const times: number[] = [];
      let candidates = 0;
      for (let run = 0; run < RUNS; run++) {
        const start = performance.now();
        const page = await ridesService.search(passengerId, input);
        times.push(performance.now() - start);
        candidates = page.total;
      }
      times.sort((a, b) => a - b);

      // what Mongo does for the geo filter, with the index and forced without it
      const filter = {
        status: RideStatus.ACTIVE,
        originPoint: {
          $geoWithin: {
            $centerSphere: [[home.lng, home.lat], km / EARTH_RADIUS_KM],
          },
        },
      };
      const withIndex = (await rides
        .find(filter)
        .explain('executionStats')) as {
        executionStats: {
          totalDocsExamined: number;
          executionTimeMillis: number;
        };
      };
      const withoutIndex = (await rides
        .find(filter)
        .hint({ $natural: 1 })
        .explain('executionStats')) as {
        executionStats: {
          totalDocsExamined: number;
          executionTimeMillis: number;
        };
      };

      console.log(
        `Search within ${km} km  (${RUNS} runs, ${candidates} matching rides)`,
      );
      console.log(
        `  full search (geo query + SMS scoring + driver lookups for 20): ` +
          `median ${percentile(times, 50).toFixed(1)} ms, p95 ${percentile(times, 95).toFixed(1)} ms`,
      );
      console.log(
        `  Mongo with 2dsphere index: examined ${withIndex.executionStats.totalDocsExamined} docs ` +
          `in ${withIndex.executionStats.executionTimeMillis} ms`,
      );
      console.log(
        `  Mongo forced full scan:    examined ${withoutIndex.executionStats.totalDocsExamined} docs ` +
          `in ${withoutIndex.executionStats.executionTimeMillis} ms\n`,
      );
    }
  } finally {
    const { deletedCount } = await rides.deleteMany({
      'origin.label': PERF_LABEL,
    });
    console.log(`Removed ${deletedCount} temporary rides.`);
    await app.close();
  }
}

perfSearch().catch((err: unknown) => {
  console.error('Search timing failed:', err);
  process.exitCode = 1;
});
