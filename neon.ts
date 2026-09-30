import { defineConfig } from '@neon/config/v1';

const optionalKeys = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
  'JWT_REFRESH_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;
const optionalEnv: Record<string, string> = {};
for (const key of optionalKeys) {
  if (process.env[key]) optionalEnv[key] = process.env[key]!;
}

export default defineConfig({
  functions: {
    tipapi: {
      name: 'TIP Web Portal API',
      source: '.neon-build',
      bundler: 'none',
      env: {
        ...optionalEnv,
        NODE_ENV: 'production',
        REDIS_URL: process.env.REDIS_URL!,
        JWT_SECRET: process.env.JWT_SECRET!,
        ORIGIN_SECRET: process.env.ORIGIN_SECRET!,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
        JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      },
    },
  },
});
