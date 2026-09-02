import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  geminiFlashModel: process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash',
};

// Log settings to verify they are loaded (excluding secrets)
console.log('Environment configuration loaded:');
console.log(`- NODE_OPTIONS: ${process.env.NODE_OPTIONS || '(none)'}`);
console.log(`- PORT: ${config.port}`);
console.log(`- DATABASE_URL present: ${!!config.databaseUrl}`);
console.log(`- JWT_SECRET present: ${!!config.jwtSecret}`);
console.log(`- NODE_ENV: ${config.nodeEnv}`);
console.log(`- FRONTEND_ORIGIN: ${config.frontendOrigin}`);
console.log(`- GEMINI_API_KEY present: ${!!config.geminiApiKey}`);
console.log('key loaded:', !!process.env.GEMINI_API_KEY);
console.log(`- GEMINI_EMBEDDING_MODEL: ${config.geminiEmbeddingModel}`);
console.log(`- GEMINI_FLASH_MODEL: ${config.geminiFlashModel}`);

