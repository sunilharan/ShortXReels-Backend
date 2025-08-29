import swaggerJsDoc, { Options, SwaggerDefinition } from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express, Request, Response, NextFunction } from 'express';
import { config } from '../config/config';

interface SwaggerSpec extends SwaggerDefinition {
  servers: Array<{ url: string; description: string }>;
}
const options: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Short X Reel APIs',
      version: '1.0.0',
      description: 'Short X Reel API with Swagger Documentation',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      parameters: {
        AcceptLanguage: {
          in: 'header',
          name: 'accept-language',
          required: false,
          schema: {
            type: 'string',
            enum: ['en', 'hi','gu'],
            default: 'en'
          },
          description: 'Language for localization (english, hindi, gujarati)',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
            },
            error: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    servers: [
      {
        url: `${config.host}/api`,
        description: 'Dynamic server URL',
      },
      {
        url: `http://localhost:5000/api`,
        description: 'Dynamic server URL',
      },
    ],
  },
  apis: ['./src/docs/*.yml', './src/docs/*/*.yml'],
};

const swaggerSpec: SwaggerSpec = swaggerJsDoc(options) as SwaggerSpec;

const setupSwaggerDocs = (app: Express) => {
  app.use(
    '/api/swagger-docs',
    (req: Request, _: Response, next: NextFunction) => {
      const url = `${req.protocol}://${req.get('host')}/api`;
      swaggerSpec.servers = [
        {
          url,
          description: 'Dynamic server URL',
        },
      ];
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
  );
  app.get('/api/swagger.json', (_: Request, res: Response) => {
    res.json(swaggerSpec);
  });

  console.log(`Swagger UI available at: ${config.host}/api/swagger-docs`);
  console.log(`OpenAPI JSON available at: ${config.host}/api/swagger.json`);
};

export default setupSwaggerDocs;
