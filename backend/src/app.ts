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
import { requestLogger } from './middleware/logger';
import { setupSwagger } from './config/swagger';

// Ensure local uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// Enable Cross-Origin Resource Sharing
app.use(cors());

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

// Register Swagger docs
setupSwagger(app);

export default app;
