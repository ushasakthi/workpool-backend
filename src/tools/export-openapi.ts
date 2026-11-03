import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { buildSwaggerDocument } from '../swagger';

// Writes docs/openapi.json: every endpoint, DTO and auth rule.
// Postman: Import -> File -> docs/openapi.json gives a ready-made collection.
async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  try {
    configureApp(app);
    const document = buildSwaggerDocument(app);
    const outDir = join(__dirname, '..', '..', 'docs');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, 'openapi.json'),
      JSON.stringify(document, null, 2),
    );
    const routes = Object.values(document.paths).reduce(
      (sum, methods) => sum + Object.keys(methods).length,
      0,
    );
    console.log(`Wrote docs/openapi.json (${routes} operations).`);
  } finally {
    await app.close();
  }
}

exportOpenApi().catch((err: unknown) => {
  console.error('OpenAPI export failed:', err);
  process.exitCode = 1;
});
