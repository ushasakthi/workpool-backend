import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../constants';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    return ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user;
  },
);
