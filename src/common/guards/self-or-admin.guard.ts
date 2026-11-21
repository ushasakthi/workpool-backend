import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserRole } from '../constants';

@Injectable()
export class SelfOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      params: { userId?: string };
      user?: AuthenticatedUser;
    }>();
    const { user, params } = request;

    if (!user) {
      return false;
    }

    return user.role === UserRole.ADMIN || user.userId === params.userId;
  }
}
