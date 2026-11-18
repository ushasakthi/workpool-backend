import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

const LOGIN_THROTTLE_LIMIT = 5;
const LOGIN_THROTTLE_TTL_MS = 60_000;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new passenger/driver account' })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: 'Log in with email and password' })
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL_MS },
  })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Request a password reset token via email' })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'If that email is registered, a reset link has been sent.',
    };
  }

  @ApiOperation({ summary: 'Set a new password using a valid reset token' })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const { email } = await this.authService.resetPassword(
      dto.token,
      dto.newPassword,
    );
    return { message: 'Password has been reset. Please log in again.', email };
  }

  @ApiOperation({ summary: 'Log out and revoke the current refresh token' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logout(user.userId);
    return { message: 'Logged out.' };
  }
}
