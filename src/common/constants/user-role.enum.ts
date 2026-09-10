export enum UserRole {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
  BOTH = 'both',
  ADMIN = 'admin',
}

// Roles a user may pick for themselves — at registration or via
// PATCH /users/me/profile. `admin` is granted only by the seed script.
export const SELF_ASSIGNABLE_ROLES: UserRole[] = [
  UserRole.PASSENGER,
  UserRole.DRIVER,
  UserRole.BOTH,
];
