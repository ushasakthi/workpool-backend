import type { StringValue } from 'ms';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  jwt: {
    secret: string;
    expiry: StringValue;
    refreshSecret: string;
    refreshExpiry: StringValue;
  };
  corsOrigins: string[];
  encryptionKey: string;
  pickupWindowMinutes: number;
  skipPickupWindow: boolean;
  uploads: {
    nicDocumentDir: string;
    profilePhotoDir: string;
    vehiclePhotoDir: string;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    from: string;
    appBaseUrl: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongoUri: process.env.MONGO_URI!,
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiry: process.env.JWT_EXPIRY! as StringValue,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY! as StringValue,
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  encryptionKey: process.env.ENCRYPTION_KEY!,
  pickupWindowMinutes: parseInt(process.env.PICKUP_WINDOW_MINUTES ?? '60', 10),
  // never on in production, even if the flag is left in .env
  skipPickupWindow:
    (process.env.NODE_ENV ?? 'development') === 'development' &&
    process.env.SKIP_PICKUP_WINDOW === 'true',
  uploads: {
    nicDocumentDir: process.env.NIC_UPLOAD_DIR ?? './storage/nic-documents',
    profilePhotoDir:
      process.env.PROFILE_PHOTO_DIR ?? './storage/profile-photos',
    vehiclePhotoDir:
      process.env.VEHICLE_PHOTO_DIR ?? './storage/vehicle-photos',
  },
  mail: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? 'WorkPool <no-reply@workpool.local>',
    appBaseUrl: process.env.APP_BASE_URL ?? 'workpoolfrontend://',
  },
});
