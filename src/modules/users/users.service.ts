import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { resolve } from 'path';
import { AppConfig } from '../../config/configuration';
import { UserRole, VerificationStatus } from '../../common/constants';
import { decrypt, encrypt } from '../../common/utils/encryption.util';
import { User, UserDocument, Verification } from './schemas/user.schema';

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  phone: string;
  role: UserRole;
}

export interface SubmitVerificationInput {
  nicNumber: string;
  nicDocumentUrl: string;
  linkedinUrl: string;
}

export interface VerificationSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  nicNumber?: string;
  nicDocumentUrl?: string;
  linkedinUrl?: string;
  verification: Verification;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  linkedinUrl?: string;
  verification: Verification;
}

export interface AdminStats {
  activePassengers: number;
  activeRiders: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  create(input: CreateUserInput): Promise<UserDocument> {
    return this.userModel.create(input);
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  findByIdWithRefreshHash(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }

  async setRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { refreshTokenHash })
      .exec();
  }

  async setPasswordResetToken(
    userId: string,
    tokenHash: string,
    expires: Date,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { passwordResetTokenHash: tokenHash, passwordResetExpires: expires },
      )
      .exec();
  }

  findByPasswordResetToken(tokenHash: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: { $gt: new Date() },
      })
      .exec();
  }

  async resetPassword(userId: string, passwordHash: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          passwordHash,
          $unset: {
            passwordResetTokenHash: '',
            passwordResetExpires: '',
            refreshTokenHash: '',
          },
        },
      )
      .exec();
  }

  async findMe(userId: string): Promise<UserProfile> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      linkedinUrl: user.linkedinUrl,
      verification: user.verification,
    };
  }

  async getAdminStats(): Promise<AdminStats> {
    const [activePassengers, activeRiders] = await Promise.all([
      this.userModel.countDocuments({ role: { $in: [UserRole.PASSENGER, UserRole.BOTH] } }),
      this.userModel.countDocuments({ role: { $in: [UserRole.DRIVER, UserRole.BOTH] } }),
    ]);

    return { activePassengers, activeRiders };
  }

  async submitVerification(
    userId: string,
    input: SubmitVerificationInput,
  ): Promise<void> {
    const encryptedNicNumber = encrypt(
      input.nicNumber,
      this.getEncryptionKey(),
    );

    await this.userModel
      .updateOne(
        { _id: userId },
        {
          nicNumber: encryptedNicNumber,
          nicDocumentUrl: input.nicDocumentUrl,
          linkedinUrl: input.linkedinUrl,
          'verification.identityStatus': VerificationStatus.PENDING,
          'verification.workplaceStatus': VerificationStatus.PENDING,
          'verification.submittedAt': new Date(),
          $unset: {
            'verification.reviewedBy': '',
            'verification.reviewedAt': '',
            'verification.rejectionReason': '',
          },
        },
      )
      .exec();
  }

  async findVerificationsByStatus(
    status?: VerificationStatus,
  ): Promise<VerificationSummary[]> {
    const filter: Record<string, unknown> = {
      // Every user defaults to identityStatus/workplaceStatus "pending" at registration,
      // even if they never submit NIC/LinkedIn — only list users who actually submitted.
      'verification.submittedAt': { $exists: true },
    };
    if (status) {
      filter['verification.identityStatus'] = status;
    }

    const users = await this.userModel
      .find(filter)
      .sort({ 'verification.submittedAt': -1 })
      .select('+nicNumber')
      .exec();

    const key = this.getEncryptionKey();
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      nicNumber: user.nicNumber ? decrypt(user.nicNumber, key) : undefined,
      nicDocumentUrl: user.nicDocumentUrl,
      linkedinUrl: user.linkedinUrl,
      verification: user.verification,
    }));
  }

  async findVerificationSubmission(
    userId: string,
  ): Promise<VerificationSummary> {
    const user = await this.userModel
      .findById(userId)
      .select('+nicNumber')
      .exec();

    if (!user?.verification.submittedAt) {
      throw new NotFoundException(
        'No verification submission found for this user',
      );
    }

    const key = this.getEncryptionKey();
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      nicNumber: user.nicNumber ? decrypt(user.nicNumber, key) : undefined,
      nicDocumentUrl: user.nicDocumentUrl,
      linkedinUrl: user.linkedinUrl,
      verification: user.verification,
    };
  }

  async reviewVerification(
    userId: string,
    adminId: string,
    status: VerificationStatus,
    rejectionReason?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      'verification.identityStatus': status,
      'verification.workplaceStatus': status,
      'verification.reviewedBy': adminId,
      'verification.reviewedAt': new Date(),
    };

    if (status === VerificationStatus.REJECTED) {
      update['verification.rejectionReason'] = rejectionReason;
    } else {
      update.$unset = { 'verification.rejectionReason': '' };
    }

    const result = await this.userModel
      .updateOne({ _id: userId }, update)
      .exec();

    if (result.matchedCount === 0) {
      throw new NotFoundException('User not found');
    }
  }

  async resolveNicDocumentPath(userId: string): Promise<string> {
    const user = await this.userModel.findById(userId).exec();
    if (!user?.nicDocumentUrl) {
      throw new NotFoundException('No NIC document found for this user');
    }

    const { nicDocumentDir } = this.configService.get('uploads', {
      infer: true,
    });
    return resolve(nicDocumentDir, user.nicDocumentUrl);
  }

  private getEncryptionKey(): Buffer {
    const encryptionKey = this.configService.get('encryptionKey', {
      infer: true,
    });
    return Buffer.from(encryptionKey, 'hex');
  }
}
