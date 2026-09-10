import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { resolve } from 'path';
import { AppConfig } from '../../config/configuration';
import {
  PreferredRole,
  UserRole,
  VerificationStatus,
  Weekday,
} from '../../common/constants';
import { buildUpdateSet } from '../../common/utils/build-update-set';
import {
  decrypt,
  encrypt,
  hmacDigest,
} from '../../common/utils/encryption.util';
import { User, UserDocument, Verification } from './schemas/user.schema';
import {
  OwnUserProfile,
  PublicUserProfile,
  serializeOwnProfile,
  serializeUserProfile,
} from './serializers/user-profile.serializer';

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

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  role?: UserRole;
}

export interface GeoPointInput {
  lat: number;
  lng: number;
  label?: string;
}

export interface UpdateTravelProfileInput {
  homeLocation?: GeoPointInput;
  workLocation?: GeoPointInput;
  workStartTime?: string;
  workEndTime?: string;
  daysAvailable?: Weekday[];
  preferredRole?: PreferredRole;
  hideWorkplaceName?: boolean;
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

  async findMe(userId: string): Promise<OwnUserProfile> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return serializeOwnProfile(user);
  }

  // Another user's profile — home/work coordinates are fuzzed and account fields
  // (email/phone) are dropped unless the requester is the owner.
  async getPublicProfile(
    userId: string,
    requesterId: string,
  ): Promise<OwnUserProfile | PublicUserProfile> {
    if (!isValidObjectId(userId)) {
      throw new NotFoundException('User not found');
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return serializeUserProfile(user, requesterId);
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<OwnUserProfile> {
    return this.applyUserUpdate(userId, buildUpdateSet(input));
  }

  async updateTravelProfile(
    userId: string,
    input: UpdateTravelProfileInput,
  ): Promise<OwnUserProfile> {
    return this.applyUserUpdate(
      userId,
      buildUpdateSet(input, 'travelProfile.'),
    );
  }

  updateProfilePhoto(
    userId: string,
    photoFilename: string,
  ): Promise<OwnUserProfile> {
    return this.applyUserUpdate(userId, { photoUrl: photoFilename });
  }

  async resolveProfilePhotoPath(userId: string): Promise<string> {
    if (!isValidObjectId(userId)) {
      throw new NotFoundException('No profile photo found for this user');
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user?.photoUrl) {
      throw new NotFoundException('No profile photo found for this user');
    }

    const { profilePhotoDir } = this.configService.get('uploads', {
      infer: true,
    });
    return resolve(profilePhotoDir, user.photoUrl);
  }

  async getAdminStats(): Promise<AdminStats> {
    const [activePassengers, activeRiders] = await Promise.all([
      this.userModel.countDocuments({
        role: { $in: [UserRole.PASSENGER, UserRole.BOTH] },
      }),
      this.userModel.countDocuments({
        role: { $in: [UserRole.DRIVER, UserRole.BOTH] },
      }),
    ]);

    return { activePassengers, activeRiders };
  }

  async submitVerification(
    userId: string,
    input: SubmitVerificationInput,
  ): Promise<void> {
    const key = this.getEncryptionKey();
    const nicNumberHash = hmacDigest(input.nicNumber, key);

    // One NIC per account — the encrypted nicNumber can't be queried for equality,
    // so match on the deterministic hash instead. The unique index (see
    // user.schema.ts) is the real backstop against a check-then-write race.
    const conflict = await this.userModel
      .findOne({ nicNumberHash, _id: { $ne: userId } })
      .select('_id')
      .exec();
    if (conflict) {
      throw new ConflictException(
        'This NIC number is already linked to another account.',
      );
    }

    const encryptedNicNumber = encrypt(input.nicNumber, key);

    try {
      await this.userModel
        .updateOne(
          { _id: userId },
          {
            nicNumber: encryptedNicNumber,
            nicNumberHash,
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
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(
          'This NIC number is already linked to another account.',
        );
      }
      throw error;
    }
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

  private async applyUserUpdate(
    userId: string,
    set: Record<string, unknown>,
  ): Promise<OwnUserProfile> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: set }, { returnDocument: 'after' })
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return serializeOwnProfile(user);
  }
}
