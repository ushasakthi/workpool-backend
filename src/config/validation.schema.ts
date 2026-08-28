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
  // 32-byte AES-256 key, hex-encoded (64 hex chars) — encrypts nicNumber at rest
  ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
  NIC_UPLOAD_DIR: Joi.string().default('./storage/nic-documents'),
  // Local dev default points at Mailpit (brew install mailpit; SMTP on 1025, web UI on :8025).
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().default(1025),
  SMTP_SECURE: Joi.string().valid('true', 'false').default('false'),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  MAIL_FROM: Joi.string().default('WorkPool <no-reply@workpool.local>'),
  // Scheme used to deep-link into the app from emails, e.g. password reset links.
  APP_BASE_URL: Joi.string().default('workpoolfrontend://'),
});
