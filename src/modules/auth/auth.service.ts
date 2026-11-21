import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { AppConfig } from '../../config/configuration';
import { UserRole } from '../../common/constants';
import { compareValue, hashValue } from '../../common/utils/hash.util';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { TERMS_VERSION } from './terms';

export const SUSPENDED_MESSAGE =
  'This account is suspended. Contact WorkPool support.';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const DUPLICATE_KEY_ERROR_CODE = 11000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SanitizedUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
}

export type AuthResult = { user: SanitizedUser } & AuthTokens;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await hashValue(dto.password);

    let user: UserDocument;
    try {
      user = await this.usersService.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
        phone: dto.phone,
        role: dto.role ?? UserRole.PASSENGER,
        // the DTO only lets acceptedTerms === true through
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
      });
    } catch (err) {
      if (this.isDuplicateKeyError(err)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw err;
    }

    const tokens = await this.issueTokens(user);
    return { user: this.sanitize(user), ...tokens };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    const passwordMatches = user
      ? await compareValue(dto.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // checked after the password, so it doesn't reveal which emails exist
    if (user.suspended) {
      throw new ForbiddenException(SUSPENDED_MESSAGE);
    }

    const tokens = await this.issueTokens(user);
    return { user: this.sanitize(user), ...tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const jwtConfig = this.configService.get('jwt', { infer: true });

    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(
        refreshToken,
        { secret: jwtConfig.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findByIdWithRefreshHash(payload.sub);
    const tokenMatches =
      user?.refreshTokenHash &&
      (await compareValue(refreshToken, user.refreshTokenHash));

    if (!user || !tokenMatches) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (user.suspended) {
      throw new ForbiddenException(SUSPENDED_MESSAGE);
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
    await this.usersService.setPushToken(userId, null);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(rawToken);
    await this.usersService.setPasswordResetToken(
      user.id,
      tokenHash,
      new Date(Date.now() + RESET_TOKEN_TTL_MS),
    );

    // a mail error must not change the reply, or it would show the email is registered
    try {
      await this.mailService.sendPasswordResetEmail(email, rawToken);
    } catch (err) {
      this.logger.warn(
        `Reset email not sent: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ email: string }> {
    const tokenHash = this.hashResetToken(token);
    const user = await this.usersService.findByPasswordResetToken(tokenHash);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await hashValue(newPassword);
    await this.usersService.resetPassword(user.id, passwordHash);

    return { email: user.email };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResult> {
    const user = await this.usersService.findByIdWithPasswordHash(userId);
    const passwordMatches = user
      ? await compareValue(currentPassword, user.passwordHash)
      : false;
    if (!user || !passwordMatches) {
      // 400, not 401: the app treats a 401 as an expired session
      throw new BadRequestException('Current password is incorrect');
    }

    // resetPassword also clears the refresh token, which signs out other devices
    await this.usersService.resetPassword(
      user.id,
      await hashValue(newPassword),
    );

    // fresh tokens keep this device signed in
    const tokens = await this.issueTokens(user);
    return { user: this.sanitize(user), ...tokens };
  }

  private async issueTokens(user: UserDocument): Promise<AuthTokens> {
    const jwtConfig = this.configService.get('jwt', { infer: true });
    const payload = { sub: user.id, email: user.email, role: user.role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtConfig.secret,
        expiresIn: jwtConfig.expiry,
      }),
      this.jwtService.signAsync(payload, {
        secret: jwtConfig.refreshSecret,
        expiresIn: jwtConfig.refreshExpiry,
      }),
    ]);

    await this.usersService.setRefreshTokenHash(
      user.id,
      await hashValue(refreshToken),
    );

    return { accessToken, refreshToken };
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitize(user: UserDocument): SanitizedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: number }).code === DUPLICATE_KEY_ERROR_CODE
    );
  }
}
