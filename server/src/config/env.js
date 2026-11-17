import 'dotenv/config';

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}. Check server/.env`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is too short. Use at least 32 random characters.');
  process.exit(1);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Set TRUST_PROXY=1 when the API runs behind Nginx so each visitor is counted by their real IP
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
};
