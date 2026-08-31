import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  nodeEnv: process.env.NODE_ENV || 'development',
};

// Log settings to verify they are loaded (excluding secrets)
console.log('Environment configuration loaded:');
console.log(`- PORT: ${config.port}`);
console.log(`- DATABASE_URL present: ${!!config.databaseUrl}`);
console.log(`- JWT_SECRET present: ${!!config.jwtSecret}`);
console.log(`- NODE_ENV: ${config.nodeEnv}`);
