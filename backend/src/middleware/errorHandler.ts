import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // 1. Zod Validation Errors
  if (err instanceof z.ZodError) {
    const formattedErrors: Record<string, string> = {};
    err.issues.forEach((issue) => {
      const field = issue.path.join('.') || 'body';
      formattedErrors[field] = issue.message;
    });

    return res.status(400).json({
      error: {
        message: 'Validation failed',
        status: 400,
        code: 'VALIDATION_ERROR',
        errors: formattedErrors,
      },
    });
  }

  // 2. Custom Application Errors (AppError)
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        message: err.message,
        status: err.status,
        code: err.code,
      },
    });
  }

  // 3. Multer / File Upload errors
  if (err.name === 'MulterError' || err.message?.includes('MulterError') || err.message?.includes('Only JPEG, PNG, and WebP')) {
    return res.status(400).json({
      error: {
        message: err.message,
        status: 400,
        code: 'BAD_REQUEST',
      },
    });
  }

  // 4. Unexpected / Unhandled Errors
  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: {
      message: 'Internal server error',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
    },
  });
}
