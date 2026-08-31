import { Express } from 'express';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from './index';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Event Platform API Docs',
      version: '1.0.0',
      description: 'API documentation for the Event Platform Backend (Phase 0 scaffolding)',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token to authorize requests.',
        },
      },
    },
  },
  // Scans all files in routes and app file for documentation annotations
  apis: ['./src/routes/**/*.ts', './src/app.ts', './dist/routes/**/*.js', './dist/app.js'],
};

const swaggerSpec = swaggerJSDoc(options);

export function setupSwagger(app: Express) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs-json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
