import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const duration = Math.round(diff[0] * 1e3 + diff[1] * 1e-6);
    // Log the request method, URL, status code, and duration
    console.log(
      `[HTTP] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`,
    );
  });

  next();
}
