import { ExecutionContext } from '@nestjs/common';
import { UserRole } from '../constants';
import { SelfOrAdminGuard } from './self-or-admin.guard';

// protects the NIC document route: only the owner or an admin may fetch it
function contextFor(
  user: { userId: string; role: UserRole } | undefined,
  userId: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ params: { userId }, user }),
    }),
  } as unknown as ExecutionContext;
}

describe('SelfOrAdminGuard', () => {
  const guard = new SelfOrAdminGuard();

  it('lets users read their own document', () => {
    const user = { userId: 'u1', role: UserRole.PASSENGER };
    expect(guard.canActivate(contextFor(user, 'u1'))).toBe(true);
  });

  it("blocks reading someone else's document", () => {
    const user = { userId: 'u2', role: UserRole.DRIVER };
    expect(guard.canActivate(contextFor(user, 'u1'))).toBe(false);
  });

  it('lets an admin read any document', () => {
    const admin = { userId: 'a1', role: UserRole.ADMIN };
    expect(guard.canActivate(contextFor(admin, 'u1'))).toBe(true);
  });

  it('blocks a request with no logged-in user', () => {
    expect(guard.canActivate(contextFor(undefined, 'u1'))).toBe(false);
  });
});
