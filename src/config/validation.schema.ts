import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  MONGO_URI: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRY: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_REFRESH_EXPIRY: Joi.string().required(),
  CORS_ORIGINS: Joi.string().default(''),
  // 64 hex chars, used to encrypt nicNumber
  ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
  NIC_UPLOAD_DIR: Joi.string().default('./storage/nic-documents'),
  PROFILE_PHOTO_DIR: Joi.string().default('./storage/profile-photos'),
  VEHICLE_PHOTO_DIR: Joi.string().default('./storage/vehicle-photos'),
  // Mailpit for local dev (SMTP 1025, UI 8025)
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().default(1025),
  SMTP_SECURE: Joi.string().valid('true', 'false').default('false'),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  MAIL_FROM: Joi.string().default('WorkPool <no-reply@workpool.local>'),
  // Scheme used to deep-link into the app from emails, e.g. password reset links.
  APP_BASE_URL: Joi.string().default('workpoolfrontend://'),
});
