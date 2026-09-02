import request from 'supertest';
import app from '../app';
import { db } from '../db/client';
import { pool } from '../db/client';

jest.setTimeout(30000);

afterAll(async () => {
  // Close DB pool to avoid open handles
  await pool.end();
});

describe('Slim Hardening & Security Tests', () => {
  describe('CORS Configuration', () => {
    test('1. Succeeds and returns appropriate headers for allowed origin with credentials', async () => {
      const res = await request(app)
        .get('/api/events')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    test('2. Fails/rejects origin when request is from an unlisted origin', async () => {
      const res = await request(app)
        .get('/api/events')
        .set('Origin', 'http://evil.com')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Centralized Error-Handling Middleware', () => {
    test('1. Zod validation errors return formatted 400 response', async () => {
      const res = await request(app)
        .get('/api/events')
        .query({ limit: 'abc' })
        .expect(400);

      expect(res.body).toEqual({
        error: {
          message: 'Validation failed',
          status: 400,
          code: 'VALIDATION_ERROR',
          errors: {
            limit: expect.any(String),
          },
        },
      });
    });

    test('2. Unexpected database throws are caught and return a generic 500 error', async () => {
      const dbSelectSpy = jest.spyOn(db, 'select').mockImplementationOnce(() => {
        throw new Error('Simulated unexpected database failure');
      });

      const res = await request(app)
        .get('/api/events')
        .expect(500);

      expect(res.body).toEqual({
        error: {
          message: 'Internal server error',
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
        },
      });

      dbSelectSpy.mockRestore();
    });
  });
});
