import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../../common/constants';
import { AppConfig } from '../../../config/configuration';
import { UsersService } from '../../users/users.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let usersService: { isSuspended: jest.Mock };
  let strategy: JwtStrategy;

  const payload = { sub: 'user-1', email: 'a@b.com', role: UserRole.PASSENGER };

  beforeEach(() => {
    usersService = { isSuspended: jest.fn().mockResolvedValue(false) };
    const configService = {
      get: () => ({ secret: 'test-secret' }),
    } as unknown as ConfigService<AppConfig, true>;
    strategy = new JwtStrategy(
      configService,
      usersService as unknown as UsersService,
    );
  });

  it('accepts a normal user', async () => {
    await expect(strategy.validate(payload)).resolves.toEqual({
      userId: 'user-1',
      email: 'a@b.com',
      role: UserRole.PASSENGER,
    });
  });

  it('locks out a suspended user straight away, even with a valid token', async () => {
    usersService.isSuspended.mockResolvedValue(true);

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
