import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  NOTIFICATIONS_REALTIME_ENABLED: Joi.boolean().default(false),
  NOTIFICATIONS_REALTIME_NAMESPACE: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]{1,80}$/)
    .when('NOTIFICATIONS_REALTIME_ENABLED', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  NOTIFICATIONS_ALLOWED_ORIGINS: Joi.string().when(
    'NOTIFICATIONS_REALTIME_ENABLED',
    { is: true, then: Joi.required(), otherwise: Joi.allow('').optional() },
  ),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  SMTP_HOST: Joi.string().hostname().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().valid(465, 587).default(587),
  SMTP_FROM: Joi.string().trim().allow('').optional(),
  SMTP_USER: Joi.string()
    .trim()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
  SMTP_PASS: Joi.string()
    .trim()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
  CLOUDINARY_CLOUD_NAME: Joi.string().allow('').default(''),
  CLOUDINARY_API_KEY: Joi.string().allow('').default(''),
  CLOUDINARY_API_SECRET: Joi.string().allow('').default(''),
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().allow('').optional(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
});
