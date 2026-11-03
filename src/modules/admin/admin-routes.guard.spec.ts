import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

// Audit: finds EVERY controller in src/modules whose path starts with "admin"
// and checks each route is behind JwtAuthGuard + RolesGuard with @Roles(ADMIN).
// A new admin controller that forgets the guards makes this test fail.

type Controller = { name: string; prototype: Record<string, unknown> };

function findControllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return findControllerFiles(full);
    return entry.endsWith('.controller.ts') ? [full] : [];
  });
}

function adminControllers(): Controller[] {
  const files = findControllerFiles(join(__dirname, '..'));
  return files.flatMap((file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(file) as Record<string, unknown>;
    return Object.values(exported).filter((value): value is Controller => {
      if (typeof value !== 'function') return false;
      const path = Reflect.getMetadata(PATH_METADATA, value) as unknown;
      return typeof path === 'string' && path.startsWith('admin');
    });
  });
}

function routeHandlers(controller: Controller): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (name) =>
      name !== 'constructor' &&
      Reflect.getMetadata(
        PATH_METADATA,
        controller.prototype[name] as object,
      ) !== undefined,
  );
}

describe('admin route audit', () => {
  const controllers = adminControllers();

  it('finds the admin controllers', () => {
    expect(controllers.map((c) => c.name).sort()).toEqual([
      'AdminController',
      'AdminLogController',
      'AdminReportsController',
      'AdminStatsController',
      'AdminUsersController',
    ]);
  });

  it.each(controllers.map((c) => [c.name, c]))(
    '%s: every route needs JwtAuthGuard + RolesGuard + @Roles(ADMIN)',
    (_name, controller) => {
      const classGuards =
        (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? [];
      const classRoles = Reflect.getMetadata(ROLES_KEY, controller) as
        UserRole[] | undefined;

      const handlers = routeHandlers(controller);
      expect(handlers.length).toBeGreaterThan(0);

      for (const handler of handlers) {
        const method = controller.prototype[handler] as object;
        const guards = [
          ...classGuards,
          ...((Reflect.getMetadata(GUARDS_METADATA, method) as unknown[]) ??
            []),
        ];
        const roles =
          (Reflect.getMetadata(ROLES_KEY, method) as UserRole[] | undefined) ??
          classRoles;

        expect(guards).toEqual(
          expect.arrayContaining([JwtAuthGuard, RolesGuard]),
        );
        expect(roles).toEqual([UserRole.ADMIN]);
      }
    },
  );
});
