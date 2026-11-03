import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { TERMS_VERSION } from './terms';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { UserRole } from '../../common/constants';
import { hashValue } from '../../common/utils/hash.util';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let mailService: jest.Mocked<MailService>;

  const buildMockUser = async (
    overrides: Partial<UserDocument> = {},
  ): Promise<UserDocument> =>
    ({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      phone: '+94771234567',
      role: UserRole.PASSENGER,
      passwordHash: await hashValue('CorrectPass1'),
      refreshTokenHash: null,
      ...overrides,
    }) as unknown as UserDocument;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
            setRefreshTokenHash: jest.fn().mockResolvedValue(undefined),
            setPushToken: jest.fn().mockResolvedValue(undefined),
            findByIdWithRefreshHash: jest.fn(),
            setPasswordResetToken: jest.fn().mockResolvedValue(undefined),
            findByPasswordResetToken: jest.fn(),
            resetPassword: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              secret: 'access-secret',
              expiry: '15m',
              refreshSecret: 'refresh-secret',
              refreshExpiry: '7d',
            }),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    mailService = module.get(MailService);
  });

  describe('register', () => {
    it('creates a new user and returns tokens when the email is unused', async () => {
      const user = await buildMockUser();
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(user);

      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'CorrectPass1',
        phone: '+94771234567',
        acceptedTerms: true,
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          role: UserRole.PASSENGER,
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: expect.any(Date) as Date,
        }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '+94771234567',
        role: UserRole.PASSENGER,
      });
      expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
      );
    });

    it('rejects registration when the email is already taken', async () => {
      usersService.findByEmail.mockResolvedValue(await buildMockUser());

      await expect(
        authService.register({
          name: 'Test User',
          email: 'test@example.com',
          password: 'CorrectPass1',
          phone: '+94771234567',
          acceptedTerms: true,
        }),
      ).rejects.toThrow(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(await buildMockUser());

      const result = await authService.login({
        email: 'test@example.com',
        password: 'CorrectPass1',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('rejects an incorrect password', async () => {
      usersService.findByEmail.mockResolvedValue(await buildMockUser());

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'WrongPass1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nobody@example.com',
          password: 'CorrectPass1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refuses a suspended account even with the right password', async () => {
      usersService.findByEmail.mockResolvedValue(
        await buildMockUser({ suspended: true }),
      );

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'CorrectPass1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refresh', () => {
    it('rotates tokens for a valid refresh token', async () => {
      const refreshTokenHash = await hashValue('valid-refresh-token');
      const user = await buildMockUser({ refreshTokenHash });
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      usersService.findByIdWithRefreshHash.mockResolvedValue(user);

      const result = await authService.refresh('valid-refresh-token');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(usersService.setRefreshTokenHash).toHaveBeenCalled();
    });

    it('rejects a refresh token that fails verification', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));

      await expect(authService.refresh('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a refresh token that does not match the stored hash', async () => {
      const refreshTokenHash = await hashValue('some-other-token');
      const user = await buildMockUser({ refreshTokenHash });
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      usersService.findByIdWithRefreshHash.mockResolvedValue(user);

      await expect(authService.refresh('stolen-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token hash', async () => {
      await authService.logout('user-1');

      expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
        'user-1',
        null,
      );
    });

    it('clears the push token, so the phone stops getting notifications', async () => {
      await authService.logout('user-1');

      expect(usersService.setPushToken).toHaveBeenCalledWith('user-1', null);
    });
  });

  describe('resetPassword', () => {
    it('rejects an invalid or expired token', async () => {
      usersService.findByPasswordResetToken.mockResolvedValue(null);

      await expect(
        authService.resetPassword('bad-token', 'NewStrongPass1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates the password for a valid token and returns the account email', async () => {
      const user = await buildMockUser();
      usersService.findByPasswordResetToken.mockResolvedValue(user);

      const result = await authService.resetPassword('good-token', 'NewStrongPass1');

      expect(usersService.resetPassword).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
      );
      expect(result).toEqual({ email: user.email });
    });
  });
});
