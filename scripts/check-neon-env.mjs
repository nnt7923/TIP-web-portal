process.loadEnvFile('.env');
const env = process.env;
for (const key of [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'REDIS_URL',
  'JWT_SECRET',
  'ORIGIN_SECRET',
]) {
  if (!env[key]) throw new Error(`Missing ${key} in .env`);
}
const redis = new URL(env.REDIS_URL);
if (['localhost', '127.0.0.1', '[::1]'].includes(redis.hostname))
  throw new Error(
    'REDIS_URL must point to a cloud Redis service before deployment',
  );
if (redis.protocol !== 'rediss:')
  throw new Error('Use rediss:// for an encrypted Redis connection');
if (env.ORIGIN_SECRET.length < 32)
  throw new Error('ORIGIN_SECRET must contain at least 32 characters');
console.log('Required Neon deployment variables are configured.');
