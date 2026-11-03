import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { AppModule } from '../app.module';
import { TrustScoreUpdater } from '../modules/trust-score/trust-score.updater';

// One-off script: calculates a Trust Score for every user. Safe to re-run,
// it recounts from the real history each time.
async function backfillTrustScores(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const updater = app.get(TrustScoreUpdater);
    const connection = app.get<Connection>(getConnectionToken());
    const users = await connection
      .collection('users')
      .find({}, { projection: { _id: 1, name: 1 } })
      .toArray();

    for (const user of users) {
      const score = await updater.recalculate(String(user._id));
      console.log(`  ${String(user.name)}: ${score}`);
    }
    console.log(`Calculated Trust Scores for ${users.length} user(s).`);
  } finally {
    await app.close();
  }
}

backfillTrustScores().catch((err: unknown) => {
  console.error('Trust Score backfill failed:', err);
  process.exitCode = 1;
});
