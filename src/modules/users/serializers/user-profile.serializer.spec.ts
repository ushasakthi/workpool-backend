import {
  PreferredRole,
  VerificationStatus,
  Weekday,
} from '../../../common/constants';
import { UserDocument } from '../schemas/user.schema';
import {
  serializeOwnProfile,
  serializePublicProfile,
  serializeUserProfile,
} from './user-profile.serializer';

// Haversine distance in metres — used to assert the jitter magnitude.
function distanceMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const HOME = {
  lat: 6.9271,
  lng: 79.8612,
  label: '221B Baker Mawatha, Colombo',
};
const WORK = {
  lat: 6.9147,
  lng: 79.8734,
  label: 'Acme HQ, World Trade Center',
};

function makeUser(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    id: '5f9d88b8b54764421b7156c1',
    name: 'Nadeesha Perera',
    email: 'nadeesha@example.com',
    phone: '+94771234567',
    role: 'both',
    photoUrl: 'https://cdn.workpool.lk/u/nadeesha.jpg',
    linkedinUrl: 'https://www.linkedin.com/in/nadeesha',
    verification: {
      identityStatus: VerificationStatus.VERIFIED,
      workplaceStatus: VerificationStatus.PENDING,
      rejectionReason: 'n/a',
    },
    travelProfile: {
      homeLocation: { ...HOME },
      workLocation: { ...WORK },
      workStartTime: '08:30',
      workEndTime: '17:30',
      daysAvailable: [Weekday.MON, Weekday.TUE, Weekday.WED],
      preferredRole: PreferredRole.PASSENGER,
      hideWorkplaceName: false,
    },
    ...overrides,
  } as unknown as UserDocument;
}

describe('user-profile.serializer', () => {
  describe('serializeOwnProfile', () => {
    it('returns exact coordinates, labels, and account fields', () => {
      const result = serializeOwnProfile(makeUser());

      expect(result.email).toBe('nadeesha@example.com');
      expect(result.phone).toBe('+94771234567');
      expect(result.travelProfile).toMatchObject({
        homeLocation: HOME,
        workLocation: WORK,
        workStartTime: '08:30',
        daysAvailable: [Weekday.MON, Weekday.TUE, Weekday.WED],
        approximate: false,
      });
    });

    it('keeps the full verification sub-document', () => {
      const result = serializeOwnProfile(makeUser());
      expect(result.verification).toMatchObject({
        rejectionReason: 'n/a',
      });
    });

    it('exposes the photo only as the authenticated fetch route', () => {
      const result = serializeOwnProfile(makeUser({ photoUrl: 'stored.jpg' }));
      expect(result.photoUrl).toBe(`/users/${makeUser().id}/photo?v=0`);
    });

    it('omits photoUrl when the user has no photo', () => {
      const result = serializeOwnProfile(makeUser({ photoUrl: undefined }));
      expect(result.photoUrl).toBeUndefined();
    });
  });

  describe('serializePublicProfile', () => {
    it('drops account fields (email, phone, linkedinUrl)', () => {
      const result = serializePublicProfile(makeUser());

      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('phone');
      expect(result).not.toHaveProperty('linkedinUrl');
      expect(result.name).toBe('Nadeesha Perera');
    });

    it('never shows the emergency contact to other users', () => {
      const user = makeUser({
        emergencyContact: { name: 'Amali Perera', phone: '+94771234567' },
      });

      expect(serializePublicProfile(user)).not.toHaveProperty(
        'emergencyContact',
      );
      expect(serializeOwnProfile(user).emergencyContact).toEqual({
        name: 'Amali Perera',
        phone: '+94771234567',
      });
    });

    it('narrows verification to the two public statuses', () => {
      const result = serializePublicProfile(makeUser());
      expect(result.verification).toEqual({
        identityStatus: VerificationStatus.VERIFIED,
        workplaceStatus: VerificationStatus.PENDING,
      });
    });

    it('fuzzes the home point by 300-500 m and strips its label', () => {
      const { travelProfile } = serializePublicProfile(makeUser());
      const home = travelProfile!.homeLocation!;

      expect(home.label).toBeUndefined();
      expect(home).not.toMatchObject({ lat: HOME.lat, lng: HOME.lng });
      const moved = distanceMetres(HOME, home);
      expect(moved).toBeGreaterThanOrEqual(290);
      expect(moved).toBeLessThanOrEqual(510);
    });

    it('fuzzes the work point but keeps the workplace label by default', () => {
      const { travelProfile } = serializePublicProfile(makeUser());
      const work = travelProfile!.workLocation!;

      expect(work.label).toBe(WORK.label);
      const moved = distanceMetres(WORK, work);
      expect(moved).toBeGreaterThanOrEqual(290);
      expect(moved).toBeLessThanOrEqual(510);
    });

    it('hides the workplace label when hideWorkplaceName is set', () => {
      const user = makeUser();
      user.travelProfile.hideWorkplaceName = true;

      const { travelProfile } = serializePublicProfile(user);
      expect(travelProfile!.workLocation!.label).toBeUndefined();
      // coordinates are still returned, just fuzzed
      expect(travelProfile!.workLocation!.lat).toBeDefined();
    });

    it('marks the travel profile as approximate', () => {
      const { travelProfile } = serializePublicProfile(makeUser());
      expect(travelProfile!.approximate).toBe(true);
    });

    it('is deterministic — repeated calls return an identical point', () => {
      const first = serializePublicProfile(makeUser());
      const second = serializePublicProfile(makeUser());
      expect(first.travelProfile).toEqual(second.travelProfile);
    });

    it('gives different users a different offset for the same true point', () => {
      const a = serializePublicProfile(
        makeUser({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
      );
      const b = serializePublicProfile(
        makeUser({ id: 'bbbbbbbbbbbbbbbbbbbbbbbb' }),
      );
      expect(a.travelProfile!.homeLocation).not.toEqual(
        b.travelProfile!.homeLocation,
      );
    });

    it('does not throw when the travel profile has no locations set', () => {
      const user = makeUser();
      user.travelProfile.homeLocation = undefined;
      user.travelProfile.workLocation = undefined;

      const { travelProfile } = serializePublicProfile(user);
      expect(travelProfile!.homeLocation).toBeUndefined();
      expect(travelProfile!.workLocation).toBeUndefined();
      expect(travelProfile!.daysAvailable).toEqual([
        Weekday.MON,
        Weekday.TUE,
        Weekday.WED,
      ]);
    });
  });

  describe('serializeUserProfile', () => {
    it('returns the exact own profile when requester is the owner', () => {
      const user = makeUser();
      const result = serializeUserProfile(user, user.id);

      expect(result).toHaveProperty('email');
      expect(result.travelProfile).toMatchObject({
        homeLocation: HOME,
        approximate: false,
      });
    });

    it('returns the fuzzed public profile when requester is someone else', () => {
      const result = serializeUserProfile(makeUser(), 'someone-else');

      expect(result).not.toHaveProperty('email');
      expect(result.travelProfile!.approximate).toBe(true);
    });
  });
});
