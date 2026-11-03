import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { Body, Controller as NestController, Post } from '@nestjs/common';
import { getMetadataStorage, IsString } from 'class-validator';
import { PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';

// Audit: every @Body() and @Query() in every controller must be a DTO class
// with class-validator rules. A route that takes a raw object (or `any`)
// would skip the global ValidationPipe, so it fails here instead.

type Controller = { name: string; prototype: Record<string, unknown> };
type RouteArg = { index: number; data?: unknown };

function findControllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return findControllerFiles(full);
    return entry.endsWith('.controller.ts') ? [full] : [];
  });
}

function allControllers(): Controller[] {
  return findControllerFiles(join(__dirname, '..', 'modules')).flatMap(
    (file) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const exported = require(file) as Record<string, unknown>;
      return Object.values(exported).filter(
        (value): value is Controller =>
          typeof value === 'function' &&
          Reflect.getMetadata(PATH_METADATA, value) !== undefined,
      );
    },
  );
}

// "Controller.method @Body" -> the parameter's class (or undefined)
function bodyAndQueryParams(
  controller: Controller,
): { label: string; type: unknown; hasKey: boolean }[] {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .flatMap((method) => {
      const args = (Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        controller,
        method,
      ) ?? {}) as Record<string, RouteArg>;
      const types = (Reflect.getMetadata(
        'design:paramtypes',
        controller.prototype,
        method,
      ) ?? []) as unknown[];

      return Object.entries(args).flatMap(([key, arg]) => {
        // Nest stores args as "<RouteParamtypes number>:<index>"
        const kind: RouteParamtypes = Number(key.split(':')[0]);
        if (kind !== RouteParamtypes.BODY && kind !== RouteParamtypes.QUERY) {
          return [];
        }
        const which = kind === RouteParamtypes.BODY ? '@Body' : '@Query';
        return [
          {
            label: `${controller.name}.${method} ${which}`,
            type: types[arg.index],
            hasKey: arg.data !== undefined,
          },
        ];
      });
    });
}

function hasValidationRules(type: unknown): boolean {
  if (typeof type !== 'function') return false;
  return (
    getMetadataStorage().getTargetValidationMetadatas(type, '', false, false)
      .length > 0
  );
}

// fixtures that prove the audit can actually fail
class GoodDto {
  @IsString()
  name!: string;
}
class PlainBody {
  name!: string;
}
@NestController('audit-fixture')
class FixtureController {
  @Post('good')
  good(@Body() dto: GoodDto) {
    return dto;
  }

  @Post('bad')
  bad(@Body() dto: PlainBody) {
    return dto;
  }
}

describe('request validation audit', () => {
  const params = allControllers().flatMap(bodyAndQueryParams);

  it('flags a body with no validation rules (the check works)', () => {
    const fixture = bodyAndQueryParams(
      FixtureController as unknown as Controller,
    );
    const flagged = fixture
      .filter((p) => !hasValidationRules(p.type))
      .map((p) => p.label);
    expect(flagged).toEqual(['FixtureController.bad @Body']);
  });

  it('finds the request bodies and queries to check', () => {
    expect(params.length).toBeGreaterThan(15);
  });

  it('never reads a single field like @Body("x") or @Query("x")', () => {
    const keyed = params.filter((p) => p.hasKey).map((p) => p.label);
    expect(keyed).toEqual([]);
  });

  it('types every @Body and @Query with a validated DTO class', () => {
    const missing = params
      .filter((p) => !hasValidationRules(p.type))
      .map((p) => p.label);
    expect(missing).toEqual([]);
  });
});
