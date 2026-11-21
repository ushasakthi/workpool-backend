import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserRole } from '../constants';

// owner or admin
export function isOwnerOrAdmin(
  ownerId: unknown,
  user: AuthenticatedUser,
): boolean {
  return user.role === UserRole.ADMIN || String(ownerId) === user.userId;
}
