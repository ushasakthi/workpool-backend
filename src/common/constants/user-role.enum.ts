export enum UserRole {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
  BOTH = 'both',
  ADMIN = 'admin',
}

// roles users can pick themselves, admin only comes from the seed script
export const SELF_ASSIGNABLE_ROLES: UserRole[] = [
  UserRole.PASSENGER,
  UserRole.DRIVER,
  UserRole.BOTH,
];
