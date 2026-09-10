import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

import { AppModule } from '../app.module';
import { decrypt, hmacDigest } from '../common/utils/encryption.util';
import { AppConfig } from '../config/configuration';

interface NicUser {
  _id: Types.ObjectId;
  email: string;
  submittedAt?: Date;
}

// One-off: backfills `nicNumberHash` for accounts that submitted verification
// before the "one NIC per account" unique index existed. Where two old accounts
// already share a NIC it hashes the earliest submission and leaves the rest
// without a hash, printing a warning — an admin resolves those by hand.
async function backfillNicHash(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const config = app.get(ConfigService<AppConfig, true>);
    const key = Buffer.from(
      config.get('encryptionKey', { infer: true }),
      'hex',
    );

    const connection = app.get<Connection>(getConnectionToken());
    const users = connection.collection('users');

    const pending = await users
      .find({
        nicNumber: { $exists: true },
        nicNumberHash: { $exists: false },
      })
      .toArray();

    if (pending.length === 0) {
      console.log('Nothing to backfill — every stored NIC already has a hash.');
      return;
    }

    // hash -> accounts that decrypt to it
    const byHash = new Map<string, NicUser[]>();
    for (const user of pending) {
      const nic = decrypt(user.nicNumber as string, key);
      const hash = hmacDigest(nic, key);
      const verification = user.verification as { submittedAt?: Date } | null;
      const group = byHash.get(hash) ?? [];
      group.push({
        _id: user._id,
        email: user.email as string,
        submittedAt: verification?.submittedAt,
      });
      byHash.set(hash, group);
    }

    let hashed = 0;
    let skipped = 0;
    for (const [hash, group] of byHash) {
      // Earliest submission wins the hash.
      group.sort(
        (a, b) =>
          (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0),
      );

      // Idempotent: if a previous run (or a live submission) already claimed
      // this hash, everyone in the group is a duplicate.
      const existing = await users.findOne(
        { nicNumberHash: hash },
        { projection: { _id: 1 } },
      );
      let claimed = existing != null;

      for (const account of group) {
        if (claimed) {
          skipped += 1;
          console.warn(
            `  ! ${account.email} shares a NIC with an already-hashed account — left without a hash; an admin should reject one.`,
          );
          continue;
        }
        await users.updateOne(
          { _id: account._id },
          { $set: { nicNumberHash: hash } },
        );
        hashed += 1;
        claimed = true;
      }
    }

    console.log(
      `Backfilled nicNumberHash for ${hashed} account(s); ${skipped} duplicate(s) skipped.`,
    );
  } finally {
    await app.close();
  }
}

backfillNicHash().catch((err: unknown) => {
  console.error('NIC hash backfill failed:', err);
  process.exitCode = 1;
});
