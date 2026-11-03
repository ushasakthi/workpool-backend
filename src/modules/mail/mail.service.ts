import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { AppConfig } from '../../config/configuration';
import { BookingEmail, renderBookingEmail } from './templates/booking-email';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly appBaseUrl: string;

  constructor(configService: ConfigService<AppConfig, true>) {
    const mailConfig = configService.get('mail', { infer: true });
    this.from = mailConfig.from;
    this.appBaseUrl = mailConfig.appBaseUrl;

    this.transporter = nodemailer.createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth: mailConfig.user ? { user: mailConfig.user, pass: mailConfig.pass } : undefined,
    });
  }

  async sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
    const resetLink = `${this.appBaseUrl}reset-password?token=${rawToken}`;

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Reset your WorkPool password',
      text: `We received a request to reset your WorkPool password. Open this link in the app to choose a new one:\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>We received a request to reset your WorkPool password. Open this link in the app to choose a new one:</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });

    this.logger.log(`Password reset email sent to ${email}`);
  }

  async sendBookingEmail(to: string, email: BookingEmail): Promise<void> {
    const { text, html } = renderBookingEmail(email, this.appBaseUrl);

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: email.subject,
      text,
      html,
    });

    this.logger.log(`Booking email "${email.subject}" sent to ${to}`);
  }
}
