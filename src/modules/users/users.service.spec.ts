import { resolve } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { VerificationStatus } from '../../common/constants';
import { decrypt, encrypt } from '../../common/utils/encryption.util';

describe('UsersService', () => {
  let usersService: UsersService;
  let userModel: {
    updateOne: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
  };

  const encryptionKeyHex = 'a'.repeat(64);
  const nicUploadDir = '/tmp/nic-documents';

  beforeEach(async () => {
    userModel = {
      updateOne: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'encryptionKey') return encryptionKeyHex;
              if (key === 'uploads') return { nicDocumentDir: nicUploadDir };
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    usersService = module.get(UsersService);
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

  describe('submitVerification', () => {
    it('encrypts the NIC number and resets the verification review state', async () => {
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
