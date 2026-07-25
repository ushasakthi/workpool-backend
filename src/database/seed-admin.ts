import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Connection } from 'mongoose';

import { AppModule } from '../app.module';
import { UserRole, VerificationStatus } from '../common/constants';

const SALT_ROUNDS = 10;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@workpool.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
const ADMIN_NAME = process.env.ADMIN_NAME ?? 'WorkPool Admin';
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '+94000000000';

async function seedAdmin(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const users = connection.collection('users');

    const existing = await users.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log(`Admin account already exists for ${ADMIN_EMAIL}, skipping.`);
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
    const now = new Date();

    await users.insertOne({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      phone: ADMIN_PHONE,
      role: UserRole.ADMIN,
      verification: {
        identityStatus: VerificationStatus.VERIFIED,
        workplaceStatus: VerificationStatus.VERIFIED,
      },
      createdAt: now,
      updatedAt: now,
    });

    console.log(`Seeded admin account: ${ADMIN_EMAIL}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log(
        `Using default password "${ADMIN_PASSWORD}" — change it after first login.`,
      );
    }
  } finally {
    await app.close();
  }
}

seedAdmin().catch((err: unknown) => {
  console.error('Failed to seed admin account:', err);
  process.exitCode = 1;
});
