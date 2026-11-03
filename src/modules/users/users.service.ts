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
  AdminAction,
  PreferredRole,
  UserRole,
  VerificationStatus,
  Weekday,
} from '../../common/constants';
import { buildUpdateSet } from '../../common/utils/build-update-set';
import { AdminLogService } from '../admin-log/admin-log.service';
import { TrustScoreUpdater } from '../trust-score/trust-score.updater';
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
  termsAcceptedAt: Date;
  termsVersion: string;
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

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly trustScoreUpdater: TrustScoreUpdater,
    private readonly adminLogService: AdminLogService,
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

  // null on logout, so a logged-out phone stops getting notifications
  async setPushToken(userId: string, pushToken: string | null): Promise<void> {
    await this.userModel.updateOne({ _id: userId }, { pushToken }).exec();
  }

  // id -> push token, only for users who have one
  async findPushTokens(ids: string[]): Promise<Map<string, string>> {
    const users = await this.userModel
      .find({ _id: { $in: ids } })
      .select('+pushToken')
      .exec();
    const tokens = new Map<string, string>();
    for (const user of users) {
      if (user.pushToken) tokens.set(user.id, user.pushToken);
    }
    return tokens;
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

  // id -> name, for lists that show who wrote something
  async findNames(ids: string[]): Promise<Map<string, string>> {
    const users = await this.userModel
      .find({ _id: { $in: ids } })
      .select('name')
      .exec();
    return new Map(users.map((user) => [user.id, user.name]));
  }

  // id -> name + email, admin screens only
  async findContacts(
    ids: string[],
  ): Promise<Map<string, { name: string; email: string }>> {
    const users = await this.userModel
      .find({ _id: { $in: ids } })
      .select('name email')
      .exec();
    return new Map(
      users.map((user) => [user.id, { name: user.name, email: user.email }]),
    );
  }

  async findMe(userId: string): Promise<OwnUserProfile> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return serializeOwnProfile(user);
  }

  // non-owners get fuzzed locations and no email/phone
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

  // checked on every authenticated request so a suspension applies at once
  async isSuspended(userId: string): Promise<boolean> {
    const user = await this.userModel
      .findById(userId)
      .select('suspended')
      .lean()
      .exec();
    return user?.suspended === true;
  }

  async submitVerification(
    userId: string,
    input: SubmitVerificationInput,
  ): Promise<void> {
    const key = this.getEncryptionKey();
    const nicNumberHash = hmacDigest(input.nicNumber, key);

    // nicNumber is encrypted, so check duplicates with the hash.
    // The unique index also catches two requests at once.
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
      // only users who actually submitted NIC/LinkedIn
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

    await this.adminLogService.record({
      adminId,
      action:
        status === VerificationStatus.VERIFIED
          ? AdminAction.VERIFICATION_APPROVED
          : AdminAction.VERIFICATION_REJECTED,
      targetUserId: userId,
      note: rejectionReason,
    });

    // verification is worth 40 Trust Score points
    await this.trustScoreUpdater.recalculate(userId);
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
