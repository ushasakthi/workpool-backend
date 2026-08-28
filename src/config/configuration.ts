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
  uploads: {
    nicDocumentDir: string;
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
  uploads: {
    nicDocumentDir: process.env.NIC_UPLOAD_DIR ?? './storage/nic-documents',
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
