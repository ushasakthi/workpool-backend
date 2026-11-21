import { resolve } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { AdminLogService } from '../admin-log/admin-log.service';
import { TrustScoreUpdater } from '../trust-score/trust-score.updater';
import { NicCheckService } from './nic-check.service';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import {
  AdminAction,
  NicCheck,
  PreferredRole,
  UserRole,
  VerificationStatus,
  Weekday,
} from '../../common/constants';
import { decrypt, encrypt } from '../../common/utils/encryption.util';

describe('UsersService', () => {
  let usersService: UsersService;
  let trustScoreUpdater: { recalculate: jest.Mock };
  let adminLogService: { record: jest.Mock };
  let nicCheckService: { check: jest.Mock };
  let userModel: {
    updateOne: jest.Mock;
    updateMany: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };

  const encryptionKeyHex = 'a'.repeat(64);
  const nicUploadDir = '/tmp/nic-documents';
  const profilePhotoDir = '/tmp/profile-photos';

  beforeEach(async () => {
    userModel = {
      updateOne: jest.fn(),
      updateMany: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    trustScoreUpdater = { recalculate: jest.fn() };
    adminLogService = { record: jest.fn() };
    nicCheckService = {
      check: jest.fn().mockResolvedValue(NicCheck.NOT_CHECKED),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: TrustScoreUpdater, useValue: trustScoreUpdater },
        { provide: AdminLogService, useValue: adminLogService },
        { provide: NicCheckService, useValue: nicCheckService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'encryptionKey') return encryptionKeyHex;
              if (key === 'uploads')
                return { nicDocumentDir: nicUploadDir, profilePhotoDir };
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    usersService = module.get(UsersService);
  });

  describe('push tokens', () => {
    it('saves and clears the push token', async () => {
      userModel.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });
      userModel.updateMany.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      await usersService.setPushToken('user-1', 'ExponentPushToken[abc]');
      await usersService.setPushToken('user-1', null);

      expect(userModel.updateOne).toHaveBeenNthCalledWith(
        1,
        { _id: 'user-1' },
        { pushToken: 'ExponentPushToken[abc]' },
      );
      expect(userModel.updateOne).toHaveBeenNthCalledWith(
        2,
        { _id: 'user-1' },
        { pushToken: null },
      );
    });

    it('takes the token off any other user on the same phone', async () => {
      userModel.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });
      userModel.updateMany.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      await usersService.setPushToken('nadesha', 'ExponentPushToken[phone]');

      expect(userModel.updateMany).toHaveBeenCalledWith(
        { pushToken: 'ExponentPushToken[phone]', _id: { $ne: 'nadesha' } },
        { pushToken: null },
      );
    });

    it('does not touch other users when clearing on logout', async () => {
      userModel.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      await usersService.setPushToken('user-1', null);

      expect(userModel.updateMany).not.toHaveBeenCalled();
    });

    it('only maps users who have a token', async () => {
      userModel.find.mockReturnValue({
        select: () => ({
          exec: jest.fn().mockResolvedValue([
            { id: 'user-1', pushToken: 'ExponentPushToken[abc]' },
            { id: 'user-2', pushToken: null },
          ]),
        }),
      });

      const tokens = await usersService.findPushTokens(['user-1', 'user-2']);

      expect([...tokens]).toEqual([['user-1', 'ExponentPushToken[abc]']]);
    });
  });

  describe('findMe', () => {
    it('returns the current profile without sensitive fields', async () => {
      const execMock = jest.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '+94771234567',
        role: 'passenger',
        linkedinUrl: 'https://www.linkedin.com/in/test',
        verification: {
          identityStatus: VerificationStatus.PENDING,
          workplaceStatus: VerificationStatus.PENDING,
        },
      });
      userModel.findById.mockReturnValue({ exec: execMock });

      const result = await usersService.findMe('user-1');

      expect(userModel.findById).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '+94771234567',
        role: 'passenger',
        linkedinUrl: 'https://www.linkedin.com/in/test',
        verification: {
          identityStatus: VerificationStatus.PENDING,
          workplaceStatus: VerificationStatus.PENDING,
        },
        // no history yet, so not calculated
        trustScore: {
          score: null,
          completedRides: 0,
          ratingCount: 0,
          averageRating: 0,
          cancellationCount: 0,
          upheldComplaints: 0,
        },
      });
    });

    it('throws NotFoundException when the user does not exist', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      userModel.findById.mockReturnValue({ exec: execMock });

      await expect(usersService.findMe('missing-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('sets only the fields present in the input', async () => {
      const execMock = jest.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Renamed',
        email: 'test@example.com',
        phone: '+94771234567',
        role: 'passenger',
        verification: {},
      });
      userModel.findByIdAndUpdate.mockReturnValue({ exec: execMock });

      const result = await usersService.updateProfile('user-1', {
        name: 'Renamed',
        phone: undefined,
      });

      const [id, update, options] = userModel.findByIdAndUpdate.mock
        .calls[0] as [string, Record<string, unknown>, Record<string, unknown>];
      expect(id).toBe('user-1');
      expect(update).toEqual({ $set: { name: 'Renamed' } });
      expect(options).toEqual({ returnDocument: 'after' });
      expect(result.name).toBe('Renamed');
    });

    it('lets a user switch their account role', async () => {
      userModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
          phone: '+94771234567',
          role: 'both',
          verification: {},
        }),
      });

      const result = await usersService.updateProfile('user-1', {
        role: UserRole.BOTH,
      });

      const [, update] = userModel.findByIdAndUpdate.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(update).toEqual({ $set: { role: 'both' } });
      expect(result.role).toBe('both');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        usersService.updateProfile('missing-user', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfilePhoto', () => {
    it('stores the uploaded filename on photoUrl', async () => {
      const execMock = jest.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '+94771234567',
        role: 'passenger',
        photoUrl: 'generated.jpg',
        verification: {},
      });
      userModel.findByIdAndUpdate.mockReturnValue({ exec: execMock });

      await usersService.updateProfilePhoto('user-1', 'generated.jpg');

      const [id, update, options] = userModel.findByIdAndUpdate.mock
        .calls[0] as [string, Record<string, unknown>, Record<string, unknown>];
      expect(id).toBe('user-1');
      expect(update).toEqual({ $set: { photoUrl: 'generated.jpg' } });
      expect(options).toEqual({ returnDocument: 'after' });
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        usersService.updateProfilePhoto('missing-user', 'x.jpg'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveProfilePhotoPath', () => {
    const objectId = '5f9d88b8b54764421b7156c1';

    it('resolves the absolute path from the configured photo dir', async () => {
      userModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ photoUrl: 'abc123.jpg' }),
      });

      const result = await usersService.resolveProfilePhotoPath(objectId);

      expect(result).toBe(resolve(profilePhotoDir, 'abc123.jpg'));
    });

    it('throws NotFoundException when no photo has been uploaded', async () => {
      userModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ photoUrl: undefined }),
      });

      await expect(
        usersService.resolveProfilePhotoPath(objectId),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an id that is not a valid ObjectId before touching the DB', async () => {
      await expect(
        usersService.resolveProfilePhotoPath('not-an-id'),
      ).rejects.toThrow(NotFoundException);
      expect(userModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('updateTravelProfile', () => {
    it('writes dotted travelProfile paths and skips undefined fields', async () => {
      const execMock = jest.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '+94771234567',
        role: 'both',
        verification: {},
        travelProfile: {
          homeLocation: { lat: 6.9, lng: 79.8, label: 'Home' },
          daysAvailable: [Weekday.MON],
          preferredRole: PreferredRole.EITHER,
          hideWorkplaceName: false,
        },
      });
      userModel.findByIdAndUpdate.mockReturnValue({ exec: execMock });

      await usersService.updateTravelProfile('user-1', {
        homeLocation: { lat: 6.9, lng: 79.8, label: 'Home' },
        daysAvailable: [Weekday.MON],
        preferredRole: PreferredRole.EITHER,
        workStartTime: undefined,
      });

      const [, update] = userModel.findByIdAndUpdate.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(update).toEqual({
        $set: {
          'travelProfile.homeLocation': { lat: 6.9, lng: 79.8, label: 'Home' },
          'travelProfile.daysAvailable': [Weekday.MON],
          'travelProfile.preferredRole': PreferredRole.EITHER,
        },
      });
    });
  });

  describe('getPublicProfile', () => {
    const ownerId = '5f9d88b8b54764421b7156c1';

    function mockUser() {
      return {
        id: ownerId,
        name: 'Test User',
        email: 'test@example.com',
        phone: '+94771234567',
        role: 'both',
        verification: {
          identityStatus: VerificationStatus.VERIFIED,
          workplaceStatus: VerificationStatus.PENDING,
        },
        travelProfile: {
          homeLocation: { lat: 6.9271, lng: 79.8612, label: 'Home' },
          workLocation: { lat: 6.9147, lng: 79.8734, label: 'Acme HQ' },
          daysAvailable: [Weekday.MON],
          hideWorkplaceName: false,
        },
      };
    }

    it('rejects an id that is not a valid ObjectId before touching the DB', async () => {
      await expect(
        usersService.getPublicProfile('not-an-id', 'requester'),
      ).rejects.toThrow(NotFoundException);
      expect(userModel.findById).not.toHaveBeenCalled();
    });

    it('fuzzes coordinates and drops account fields for a non-owner requester', async () => {
      userModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser()),
      });

      const result = await usersService.getPublicProfile(
        ownerId,
        'someone-else',
      );

      expect(result).not.toHaveProperty('email');
      expect(result.travelProfile?.approximate).toBe(true);
      expect(result.travelProfile?.homeLocation).not.toMatchObject({
        lat: 6.9271,
        lng: 79.8612,
      });
    });

    it('returns exact data when the requester is the owner', async () => {
      userModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser()),
      });

      const result = await usersService.getPublicProfile(ownerId, ownerId);

      expect(result).toHaveProperty('email', 'test@example.com');
      expect(result.travelProfile?.approximate).toBe(false);
      expect(result.travelProfile?.homeLocation).toMatchObject({
        lat: 6.9271,
        lng: 79.8612,
      });
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        usersService.getPublicProfile(ownerId, 'requester'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitVerification', () => {
    function mockNoNicConflict() {
      const selectMock = jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      userModel.findOne.mockReturnValue({ select: selectMock });
    }

    it('encrypts the NIC number and resets the verification review state', async () => {
      mockNoNicConflict();
      const execMock = jest.fn().mockResolvedValue(undefined);
      userModel.updateOne.mockReturnValue({ exec: execMock });

      await usersService.submitVerification('user-1', {
        nicNumber: '199912345678',
        linkedinUrl: 'https://www.linkedin.com/in/test',
        nicDocumentUrl: 'file.pdf',
      });

      expect(userModel.updateOne).toHaveBeenCalledTimes(1);
      const [filter, update] = userModel.updateOne.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      expect(filter).toEqual({ _id: 'user-1' });
      expect(update.nicNumber).not.toBe('199912345678');
      expect(
        decrypt(
          update.nicNumber as string,
          Buffer.from(encryptionKeyHex, 'hex'),
        ),
      ).toBe('199912345678');
      // Deterministic hash stored for the "one NIC per account" unique index.
      expect(typeof update.nicNumberHash).toBe('string');
      expect(update.nicNumberHash).toHaveLength(64);
      expect(update['verification.identityStatus']).toBe(
        VerificationStatus.PENDING,
      );
      expect(update['verification.workplaceStatus']).toBe(
        VerificationStatus.PENDING,
      );
      expect(update['verification.submittedAt']).toBeInstanceOf(Date);
      expect(update.$unset).toEqual({
        'verification.reviewedBy': '',
        'verification.reviewedAt': '',
        'verification.rejectionReason': '',
      });
    });

    it('looks for an existing NIC by hash, excluding the submitting user', async () => {
      mockNoNicConflict();
      userModel.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(undefined),
      });

      await usersService.submitVerification('user-1', {
        nicNumber: '199912345678',
        linkedinUrl: 'https://www.linkedin.com/in/test',
        nicDocumentUrl: 'file.pdf',
      });

      const [filter] = userModel.findOne.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(filter).toMatchObject({ _id: { $ne: 'user-1' } });
      expect(typeof filter.nicNumberHash).toBe('string');
    });

    it('rejects a NIC already linked to another account', async () => {
      const selectMock = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'other-user' }),
      });
      userModel.findOne.mockReturnValue({ select: selectMock });

      await expect(
        usersService.submitVerification('user-1', {
          nicNumber: '199912345678',
          linkedinUrl: 'https://www.linkedin.com/in/test',
          nicDocumentUrl: 'file.pdf',
        }),
      ).rejects.toThrow(ConflictException);
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('maps a duplicate-key write error to a ConflictException', async () => {
      mockNoNicConflict();
      userModel.updateOne.mockReturnValue({
        exec: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('E11000'), { code: 11000 }),
          ),
      });

      await expect(
        usersService.submitVerification('user-1', {
          nicNumber: '199912345678',
          linkedinUrl: 'https://www.linkedin.com/in/test',
          nicDocumentUrl: 'file.pdf',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a photo without the NIC number unless submitAnyway is set', async () => {
      mockNoNicConflict();
      nicCheckService.check.mockResolvedValue(NicCheck.NOT_DETECTED);

      await expect(
        usersService.submitVerification('user-1', {
          nicNumber: '199912345678',
          linkedinUrl: 'https://www.linkedin.com/in/test',
          nicDocumentUrl: 'file.jpg',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('saves a not-detected photo for the admin when submitAnyway is set', async () => {
      mockNoNicConflict();
      nicCheckService.check.mockResolvedValue(NicCheck.NOT_DETECTED);
      userModel.updateOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(undefined),
      });

      await usersService.submitVerification('user-1', {
        nicNumber: '199912345678',
        linkedinUrl: 'https://www.linkedin.com/in/test',
        nicDocumentUrl: 'file.jpg',
        submitAnyway: true,
      });

      const [, update] = userModel.updateOne.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(update['verification.nicCheck']).toBe(NicCheck.NOT_DETECTED);
    });
  });

  describe('findVerificationsByStatus', () => {
    function mockFindResult(users: unknown[]) {
      const execMock = jest.fn().mockResolvedValue(users);
      const selectMock = jest.fn().mockReturnValue({ exec: execMock });
      const sortMock = jest.fn().mockReturnValue({ select: selectMock });
      userModel.find.mockReturnValue({ sort: sortMock });
      return { execMock, selectMock, sortMock };
    }

    it('decrypts nicNumber for each returned user and filters by status', async () => {
      const key = Buffer.from(encryptionKeyHex, 'hex');
      const encryptedNic = encrypt('199912345678', key);
      const { selectMock } = mockFindResult([
        {
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
          phone: '+94771234567',
          nicNumber: encryptedNic,
          nicDocumentUrl: 'file.pdf',
          linkedinUrl: 'https://www.linkedin.com/in/test',
          verification: {
            identityStatus: VerificationStatus.PENDING,
            workplaceStatus: VerificationStatus.PENDING,
            submittedAt: new Date(),
          },
        },
      ]);

      const result = await usersService.findVerificationsByStatus(
        VerificationStatus.PENDING,
      );

      expect(userModel.find).toHaveBeenCalledWith({
        'verification.submittedAt': { $exists: true },
        'verification.identityStatus': VerificationStatus.PENDING,
      });
      expect(selectMock).toHaveBeenCalledWith('+nicNumber');
      expect(result[0].nicNumber).toBe('199912345678');
    });

    it('omits the identityStatus filter when no status is given, but still requires a submission', async () => {
      mockFindResult([]);

      await usersService.findVerificationsByStatus();

      expect(userModel.find).toHaveBeenCalledWith({
        'verification.submittedAt': { $exists: true },
      });
    });
  });

  describe('findVerificationSubmission', () => {
    it('returns the decrypted submission for a user who submitted', async () => {
      const key = Buffer.from(encryptionKeyHex, 'hex');
      const encryptedNic = encrypt('199912345678', key);
      const execMock = jest.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        phone: '+94771234567',
        nicNumber: encryptedNic,
        nicDocumentUrl: 'file.pdf',
        linkedinUrl: 'https://www.linkedin.com/in/test',
        verification: {
          identityStatus: VerificationStatus.PENDING,
          workplaceStatus: VerificationStatus.PENDING,
          submittedAt: new Date(),
        },
      });
      const selectMock = jest.fn().mockReturnValue({ exec: execMock });
      userModel.findById.mockReturnValue({ select: selectMock });

      const result = await usersService.findVerificationSubmission('user-1');

      expect(selectMock).toHaveBeenCalledWith('+nicNumber');
      expect(result.nicNumber).toBe('199912345678');
    });

    it('throws NotFoundException when the user never submitted', async () => {
      const execMock = jest.fn().mockResolvedValue({
        id: 'user-1',
        verification: {},
      });
      const selectMock = jest.fn().mockReturnValue({ exec: execMock });
      userModel.findById.mockReturnValue({ select: selectMock });

      await expect(
        usersService.findVerificationSubmission('user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      const selectMock = jest.fn().mockReturnValue({ exec: execMock });
      userModel.findById.mockReturnValue({ select: selectMock });

      await expect(
        usersService.findVerificationSubmission('missing-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reviewVerification', () => {
    it('sets both statuses, reviewedBy, and reviewedAt on approval', async () => {
      const execMock = jest.fn().mockResolvedValue({ matchedCount: 1 });
      userModel.updateOne.mockReturnValue({ exec: execMock });

      await usersService.reviewVerification(
        'user-1',
        'admin-1',
        VerificationStatus.VERIFIED,
      );

      const [filter, update] = userModel.updateOne.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(filter).toEqual({ _id: 'user-1' });
      expect(update['verification.identityStatus']).toBe(
        VerificationStatus.VERIFIED,
      );
      expect(update['verification.workplaceStatus']).toBe(
        VerificationStatus.VERIFIED,
      );
      expect(update['verification.reviewedBy']).toBe('admin-1');
      expect(update.$unset).toEqual({ 'verification.rejectionReason': '' });
      expect(trustScoreUpdater.recalculate).toHaveBeenCalledWith('user-1');
      expect(adminLogService.record).toHaveBeenCalledWith({
        adminId: 'admin-1',
        action: AdminAction.VERIFICATION_APPROVED,
        targetUserId: 'user-1',
        note: undefined,
      });
    });

    it('stores the rejection reason on rejection', async () => {
      const execMock = jest.fn().mockResolvedValue({ matchedCount: 1 });
      userModel.updateOne.mockReturnValue({ exec: execMock });

      await usersService.reviewVerification(
        'user-1',
        'admin-1',
        VerificationStatus.REJECTED,
        'blurry NIC photo',
      );

      const [, update] = userModel.updateOne.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(update['verification.rejectionReason']).toBe('blurry NIC photo');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      const execMock = jest.fn().mockResolvedValue({ matchedCount: 0 });
      userModel.updateOne.mockReturnValue({ exec: execMock });

      await expect(
        usersService.reviewVerification(
          'missing-user',
          'admin-1',
          VerificationStatus.VERIFIED,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveNicDocumentPath', () => {
    it('resolves the absolute path from the configured upload dir', async () => {
      const execMock = jest
        .fn()
        .mockResolvedValue({ nicDocumentUrl: 'abc123.pdf' });
      userModel.findById.mockReturnValue({ exec: execMock });

      const result = await usersService.resolveNicDocumentPath('user-1');

      expect(result).toBe(resolve(nicUploadDir, 'abc123.pdf'));
    });

    it('throws NotFoundException when no document has been uploaded', async () => {
      const execMock = jest
        .fn()
        .mockResolvedValue({ nicDocumentUrl: undefined });
      userModel.findById.mockReturnValue({ exec: execMock });

      await expect(
        usersService.resolveNicDocumentPath('user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
