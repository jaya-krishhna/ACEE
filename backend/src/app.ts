import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import organizerRouter from './routes/organizer';
import eventsRouter from './routes/events';
import usersRouter from './routes/users';
import referenceRouter from './routes/reference';
import searchRouter from './routes/search';
import { refreshReferenceCache, startReferenceCacheTimer } from './services/referenceCache';
import { requestLogger } from './middleware/logger';
import { setupSwagger } from './config/swagger';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';

// Initialize reference data cache and start auto-refresh timer
refreshReferenceCache().catch((err) => {
  console.error('[App] Failed initial referenceCache refresh:', err);
});
startReferenceCacheTimer();

// Ensure local uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// Enable Cross-Origin Resource Sharing with strict config
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like same-origin or tool requests)
      if (!origin || origin === config.frontendOrigin) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Parse incoming requests JSON/URLencoded payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Parse cookies
app.use(cookieParser());

// Log incoming requests
app.use(requestLogger);

// Serve uploads folder statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Register routes
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/organizer', organizerRouter);
app.use('/api/events', eventsRouter);
app.use('/api/users', usersRouter);
app.use('/api/search', searchRouter);
app.use('/api', referenceRouter);

// Register Swagger docs
setupSwagger(app);

// Centralized error handler (registered last)
app.use(errorHandler);

export default app;
