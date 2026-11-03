import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

// shared by main.ts (serves /api/docs) and tools/export-openapi.ts (writes the file)
export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('WorkPool API')
      .setDescription('WorkPool cost-sharing carpooling platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
}
