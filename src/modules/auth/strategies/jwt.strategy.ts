import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../../../config/configuration';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../common/constants';
import { UsersService } from '../../users/users.service';
import { SUSPENDED_MESSAGE } from '../auth.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService<AppConfig, true>,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt', { infer: true }).secret,
    });
  }

  // runs on every authenticated request: a suspended user is locked out at
  // once, not only when their access token expires
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (await this.usersService.isSuspended(payload.sub)) {
      throw new UnauthorizedException(SUSPENDED_MESSAGE);
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
    };
  }
}
