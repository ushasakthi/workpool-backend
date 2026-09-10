import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserRole } from '../constants';

// Shared rule for the resource-owner guards: the acting user owns the resource,
// or is an admin. `ownerId` is whatever the resource stores (ObjectId | string).
export function isOwnerOrAdmin(
  ownerId: unknown,
  user: AuthenticatedUser,
): boolean {
  return user.role === UserRole.ADMIN || String(ownerId) === user.userId;
}
