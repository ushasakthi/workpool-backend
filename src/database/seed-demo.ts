import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

import { AppModule } from '../app.module';
import {
  AdminAction,
  BookingStatus,
  PreferredRole,
  ReportCategory,
  ReportStatus,
  RideStatus,
  UserRole,
  VerificationStatus,
  Weekday,
} from '../common/constants';
import { hashValue } from '../common/utils/hash.util';
import { TERMS_VERSION } from '../modules/auth/terms';
import { TrustScoreUpdater } from '../modules/trust-score/trust-score.updater';

// Demo data for the viva / report screenshots.
//   npm run seed:demo           -> (re)creates the demo data
//   npm run seed:demo -- --reset -> only removes it
// Everything is tied to @demo.workpool.lk accounts, so real data is never touched.

const DEMO_DOMAIN = 'demo.workpool.lk';
const DEMO_PASSWORD = 'WorkPool2026';
const COLOMBO_OFFSET_MIN = 5 * 60 + 30;
const DAY_MS = 86_400_000;
const WEEKDAYS = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
];
// Date.getUTCDay() order
const DAY_BY_INDEX = [
  Weekday.SUN,
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
];

type Point = { lat: number; lng: number; label: string };

const PLACES = {
  nugegoda: { lat: 6.8721, lng: 79.889, label: 'Nugegoda junction' },
  dehiwala: { lat: 6.8511, lng: 79.8659, label: 'Dehiwala Galle Road' },
  maharagama: { lat: 6.848, lng: 79.9265, label: 'Maharagama town' },
  kottawa: { lat: 6.8412, lng: 79.9654, label: 'Kottawa bus stand' },
  battaramulla: { lat: 6.902, lng: 79.918, label: 'Battaramulla junction' },
  rajagiriya: { lat: 6.91, lng: 79.895, label: 'Rajagiriya flyover' },
  wattala: { lat: 6.989, lng: 79.892, label: 'Wattala town' },
  mountLavinia: { lat: 6.839, lng: 79.864, label: 'Mount Lavinia station' },
  boralesgamuwa: { lat: 6.841, lng: 79.901, label: 'Boralesgamuwa' },
  kohuwala: { lat: 6.867, lng: 79.885, label: 'Kohuwala junction' },
  wtc: { lat: 6.9344, lng: 79.8428, label: 'World Trade Center, Fort' },
  kollupitiya: { lat: 6.911, lng: 79.85, label: 'Kollupitiya, Colombo 03' },
  unionPlace: { lat: 6.919, lng: 79.856, label: 'Union Place, Colombo 02' },
  rajagiriyaOffice: {
    lat: 6.9095,
    lng: 79.896,
    label: 'Rajagiriya office park',
  },
} satisfies Record<string, Point>;

const id = () => new Types.ObjectId();
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
const geo = (p: Point) => ({ type: 'Point', coordinates: [p.lng, p.lat] });

// next date (Colombo calendar) on one of `days`, at hh:mm Colombo time, as UTC
function nextDeparture(hhmm: string, days: Weekday[]): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const colomboNow = new Date(Date.now() + COLOMBO_OFFSET_MIN * 60_000);
  for (let offset = 1; offset <= 7; offset++) {
    const day = new Date(colomboNow.getTime() + offset * DAY_MS);
    if (days.includes(DAY_BY_INDEX[day.getUTCDay()])) {
      const utc = Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        hours,
        minutes,
      );
      return new Date(utc - COLOMBO_OFFSET_MIN * 60_000);
    }
  }
  return new Date(Date.now() + DAY_MS);
}

interface DemoUser {
  key: string;
  name: string;
  role: UserRole;
  home: Point;
  work: Point;
  start: string;
  // 'verified' | 'pending' | 'rejected' | 'none' (never submitted)
  verification: 'verified' | 'pending' | 'rejected' | 'none';
  joinedDaysAgo: number;
  suspended?: string;
}

const USERS: DemoUser[] = [
  {
    key: 'nimal',
    name: 'Nimal Perera',
    role: UserRole.DRIVER,
    home: PLACES.nugegoda,
    work: PLACES.wtc,
    start: '08:30',
    verification: 'verified',
    joinedDaysAgo: 58,
  },
  {
    key: 'kasun',
    name: 'Kasun Fernando',
    role: UserRole.DRIVER,
    home: PLACES.maharagama,
    work: PLACES.kollupitiya,
    start: '08:30',
    verification: 'verified',
    joinedDaysAgo: 55,
  },
  {
    key: 'dilani',
    name: 'Dilani Jayasinghe',
    role: UserRole.BOTH,
    home: PLACES.dehiwala,
    work: PLACES.unionPlace,
    start: '09:00',
    verification: 'verified',
    joinedDaysAgo: 50,
  },
  {
    key: 'ruwan',
    name: 'Ruwan Silva',
    role: UserRole.BOTH,
    home: PLACES.battaramulla,
    work: PLACES.wtc,
    start: '08:30',
    verification: 'verified',
    joinedDaysAgo: 47,
  },
  {
    key: 'tharindu',
    name: 'Tharindu Wickramasinghe',
    role: UserRole.DRIVER,
    home: PLACES.kottawa,
    work: PLACES.rajagiriyaOffice,
    start: '08:30',
    verification: 'verified',
    joinedDaysAgo: 40,
  },
  {
    key: 'ishara',
    name: 'Ishara Gunawardena',
    role: UserRole.PASSENGER,
    home: PLACES.kohuwala,
    work: PLACES.wtc,
    start: '08:30',
    verification: 'verified',
    joinedDaysAgo: 52,
  },
  {
    key: 'sachini',
    name: 'Sachini Herath',
    role: UserRole.PASSENGER,
    home: PLACES.nugegoda,
    work: PLACES.kollupitiya,
    start: '09:00',
    verification: 'verified',
    joinedDaysAgo: 44,
  },
  {
    key: 'malith',
    name: 'Malith Rajapaksha',
    role: UserRole.PASSENGER,
    home: PLACES.boralesgamuwa,
    work: PLACES.kollupitiya,
    start: '08:30',
    verification: 'verified',
    joinedDaysAgo: 38,
  },
  {
    key: 'fathima',
    name: 'Fathima Rizwan',
    role: UserRole.PASSENGER,
    home: PLACES.mountLavinia,
    work: PLACES.unionPlace,
    start: '09:00',
    verification: 'verified',
    joinedDaysAgo: 30,
  },
  {
    key: 'lahiru',
    name: 'Lahiru Peiris',
    role: UserRole.PASSENGER,
    home: PLACES.dehiwala,
    work: PLACES.unionPlace,
    start: '09:00',
    verification: 'verified',
    joinedDaysAgo: 35,
    suspended: 'Repeated no-shows reported by drivers',
  },
  {
    key: 'arjun',
    name: 'Arjun Selvaraj',
    role: UserRole.PASSENGER,
    home: PLACES.battaramulla,
    work: PLACES.wtc,
    start: '08:30',
    verification: 'pending',
    joinedDaysAgo: 3,
  },
  {
    key: 'chamari',
    name: 'Chamari Dissanayake',
    role: UserRole.PASSENGER,
    home: PLACES.wattala,
    work: PLACES.wtc,
    start: '08:30',
    verification: 'rejected',
    joinedDaysAgo: 12,
  },
  {
    key: 'kavindu',
    name: 'Kavindu Bandara',
    role: UserRole.PASSENGER,
    home: PLACES.maharagama,
    work: PLACES.rajagiriyaOffice,
    start: '09:00',
    verification: 'none',
    joinedDaysAgo: 1,
  },
];

const VEHICLES = [
  {
    owner: 'nimal',
    make: 'Toyota',
    model: 'Axio',
    year: 2017,
    plate: 'WP CAB-4521',
    seats: 3,
  },
  {
    owner: 'kasun',
    make: 'Honda',
    model: 'Vezel',
    year: 2019,
    plate: 'WP CBD-7710',
    seats: 4,
  },
  {
    owner: 'dilani',
    make: 'Suzuki',
    model: 'Wagon R',
    year: 2018,
    plate: 'WP CAD-2290',
    seats: 3,
  },
  {
    owner: 'ruwan',
    make: 'Toyota',
    model: 'Prius',
    year: 2016,
    plate: 'WP CAA-8834',
    seats: 4,
  },
  {
    owner: 'tharindu',
    make: 'Nissan',
    model: 'Leaf',
    year: 2020,
    plate: 'WP CBH-1056',
    seats: 4,
  },
];

// seats = what's left after the accepted bookings below
const RIDES = [
  {
    key: 'r1',
    driver: 'nimal',
    from: PLACES.nugegoda,
    to: PLACES.wtc,
    time: '07:30',
    days: WEEKDAYS,
    seats: 2,
    cost: 450,
    status: RideStatus.ACTIVE,
  },
  {
    key: 'r2',
    driver: 'kasun',
    from: PLACES.maharagama,
    to: PLACES.kollupitiya,
    time: '07:15',
    days: WEEKDAYS,
    seats: 3,
    cost: 500,
    status: RideStatus.ACTIVE,
  },
  {
    key: 'r3',
    driver: 'dilani',
    from: PLACES.dehiwala,
    to: PLACES.unionPlace,
    time: '07:45',
    days: [Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU],
    seats: 1,
    cost: 350,
    status: RideStatus.ACTIVE,
  },
  {
    key: 'r4',
    driver: 'ruwan',
    from: PLACES.battaramulla,
    to: PLACES.wtc,
    time: '07:40',
    days: WEEKDAYS,
    seats: 4,
    cost: 400,
    status: RideStatus.ACTIVE,
  },
  {
    key: 'r5',
    driver: 'tharindu',
    from: PLACES.kottawa,
    to: PLACES.rajagiriyaOffice,
    time: '07:30',
    days: [Weekday.MON, Weekday.WED, Weekday.FRI],
    seats: 3,
    cost: 550,
    status: RideStatus.ACTIVE,
  },
  {
    key: 'r6',
    driver: 'nimal',
    from: PLACES.kohuwala,
    to: PLACES.wtc,
    time: '08:00',
    days: [Weekday.TUE, Weekday.THU],
    seats: 3,
    cost: 400,
    status: RideStatus.PAUSED,
  },
  {
    key: 'r7',
    driver: 'kasun',
    from: PLACES.wattala,
    to: PLACES.wtc,
    time: '07:20',
    days: WEEKDAYS,
    seats: 3,
    cost: 450,
    status: RideStatus.CANCELLED,
  },
  {
    key: 'r8',
    driver: 'ruwan',
    from: PLACES.rajagiriya,
    to: PLACES.kollupitiya,
    time: '08:00',
    days: WEEKDAYS,
    seats: 3,
    cost: 300,
    status: RideStatus.ACTIVE,
  },
];

const BOOKINGS = [
  {
    key: 'b1',
    ride: 'r1',
    passenger: 'ishara',
    status: BookingStatus.COMPLETED,
    requested: 20,
    completed: 3,
  },
  {
    key: 'b2',
    ride: 'r1',
    passenger: 'sachini',
    status: BookingStatus.ACCEPTED,
    requested: 6,
  },
  {
    key: 'b3',
    ride: 'r2',
    passenger: 'malith',
    status: BookingStatus.COMPLETED,
    requested: 18,
    completed: 10,
  },
  {
    key: 'b4',
    ride: 'r3',
    passenger: 'fathima',
    status: BookingStatus.ACCEPTED,
    requested: 5,
  },
  {
    key: 'b5',
    ride: 'r4',
    passenger: 'arjun',
    status: BookingStatus.REQUESTED,
    requested: 1,
  },
  {
    key: 'b6',
    ride: 'r4',
    passenger: 'ishara',
    status: BookingStatus.REQUESTED,
    requested: 0,
  },
  {
    key: 'b7',
    ride: 'r2',
    passenger: 'sachini',
    status: BookingStatus.REJECTED,
    requested: 9,
  },
  {
    key: 'b8',
    ride: 'r5',
    passenger: 'malith',
    status: BookingStatus.CANCELLED,
    requested: 4,
    cancelledBy: 'tharindu',
  },
  {
    key: 'b9',
    ride: 'r2',
    passenger: 'fathima',
    status: BookingStatus.COMPLETED,
    requested: 12,
    completed: 5,
  },
  {
    key: 'b10',
    ride: 'r3',
    passenger: 'lahiru',
    status: BookingStatus.COMPLETED,
    requested: 32,
    completed: 25,
  },
  {
    key: 'b11',
    ride: 'r2',
    passenger: 'ishara',
    status: BookingStatus.COMPLETED,
    requested: 45,
    completed: 40,
  },
  {
    key: 'b12',
    ride: 'r4',
    passenger: 'dilani',
    status: BookingStatus.COMPLETED,
    requested: 14,
    completed: 8,
  },
  {
    key: 'b13',
    ride: 'r8',
    passenger: 'sachini',
    status: BookingStatus.REQUESTED,
    requested: 0,
  },
];

// [booking, rating from passenger to driver, comment, rating from driver to passenger, comment]
const REVIEWS: [string, number, string, number, string][] = [
  [
    'b1',
    5,
    'Always on time, smooth drive.',
    5,
    'Ready at the pickup point every day.',
  ],
  ['b3', 4, 'Good drive, came a little early.', 4, 'Easy to coordinate with.'],
  ['b9', 5, 'Friendly and punctual.', 5, 'Great company on the way in.'],
  ['b10', 3, 'Okay, ran a few minutes late.', 2, 'Kept me waiting twice.'],
  ['b11', 5, 'Careful driver, clean car.', 5, 'Always on time.'],
  ['b12', 4, 'Comfortable car.', 5, 'No issues at all.'],
];

const REPORTS = [
  {
    by: 'dilani',
    against: 'lahiru',
    role: 'passenger',
    booking: 'b10',
    category: ReportCategory.NO_SHOW,
    reason: 'Did not show up at the pickup twice in one week.',
    status: ReportStatus.REVIEWED,
    filed: 20,
  },
  {
    by: 'malith',
    against: 'kasun',
    role: 'driver',
    booking: 'b3',
    category: ReportCategory.UNSAFE_DRIVING,
    reason: 'Was on the phone while driving on Baseline Road.',
    status: ReportStatus.OPEN,
    filed: 2,
  },
  {
    by: 'malith',
    against: 'tharindu',
    role: 'driver',
    booking: 'b8',
    category: ReportCategory.LATE_PICKUP,
    reason: 'Cancelled ten minutes before pickup with no message.',
    status: ReportStatus.OPEN,
    filed: 1,
  },
  {
    by: 'ishara',
    against: 'nimal',
    role: 'driver',
    booking: 'b1',
    category: ReportCategory.OTHER,
    reason: 'Music was too loud.',
    status: ReportStatus.DISMISSED,
    filed: 6,
  },
];

async function removeDemoData(connection: Connection): Promise<number> {
  const users = await connection
    .collection('users')
    // escape every dot, so only exactly @demo.workpool.lk matches
    .find({ email: { $regex: `@${DEMO_DOMAIN.replace(/\./g, '\\.')}$` } })
    .project({ _id: 1 })
    .toArray();
  const userIds = users.map((u) => u._id as Types.ObjectId);
  if (userIds.length === 0) return 0;

  const rides = await connection
    .collection('rides')
    .find({ driverId: { $in: userIds } })
    .project({ _id: 1 })
    .toArray();
  const rideIds = rides.map((r) => r._id as Types.ObjectId);

  await connection.collection('bookings').deleteMany({
    $or: [{ passengerId: { $in: userIds } }, { rideId: { $in: rideIds } }],
  });
  await connection.collection('reviews').deleteMany({
    $or: [{ fromUserId: { $in: userIds } }, { toUserId: { $in: userIds } }],
  });
  await connection.collection('reports').deleteMany({
    $or: [{ reportedBy: { $in: userIds } }, { reportedUser: { $in: userIds } }],
  });
  await connection
    .collection('adminactionlogs')
    .deleteMany({ targetUserId: { $in: userIds } });
  await connection.collection('rides').deleteMany({ _id: { $in: rideIds } });
  await connection
    .collection('vehicles')
    .deleteMany({ ownerId: { $in: userIds } });
  await connection.collection('users').deleteMany({ _id: { $in: userIds } });
  return userIds.length;
}

async function seedDemo(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const removed = await removeDemoData(connection);
    if (removed > 0)
      console.log(`Removed previous demo data (${removed} users).`);
    if (process.argv.includes('--reset')) return;

    const admin = await connection
      .collection('users')
      .findOne({ role: UserRole.ADMIN });
    const adminId = admin?._id;
    const passwordHash = await hashValue(DEMO_PASSWORD);

    // ---- users
    const userIds = new Map(USERS.map((u) => [u.key, id()]));
    const uid = (key: string) => userIds.get(key)!;
    await connection.collection('users').insertMany(
      USERS.map((u, index) => {
        const joined = daysAgo(u.joinedDaysAgo);
        const submitted = u.verification !== 'none';
        const status =
          u.verification === 'verified'
            ? VerificationStatus.VERIFIED
            : u.verification === 'rejected'
              ? VerificationStatus.REJECTED
              : VerificationStatus.PENDING;
        const reviewed =
          u.verification === 'verified' || u.verification === 'rejected';
        return {
          _id: uid(u.key),
          name: u.name,
          email: `${u.name.split(' ')[0].toLowerCase()}@${DEMO_DOMAIN}`,
          passwordHash,
          phone: `+947712345${String(index).padStart(2, '0')}`,
          role: u.role,
          linkedinUrl: submitted
            ? `https://www.linkedin.com/in/${u.key}-demo`
            : undefined,
          travelProfile: {
            homeLocation: u.home,
            workLocation: u.work,
            workStartTime: u.start,
            workEndTime: '17:30',
            daysAvailable: WEEKDAYS,
            preferredRole:
              u.role === UserRole.BOTH
                ? PreferredRole.EITHER
                : u.role === UserRole.DRIVER
                  ? PreferredRole.DRIVER
                  : PreferredRole.PASSENGER,
            hideWorkplaceName: false,
          },
          verification: {
            identityStatus: status,
            workplaceStatus: status,
            ...(submitted && {
              submittedAt: new Date(joined.getTime() + DAY_MS),
            }),
            ...(reviewed && {
              reviewedAt: new Date(joined.getTime() + 2 * DAY_MS),
              reviewedBy: adminId,
            }),
            ...(u.verification === 'rejected' && {
              rejectionReason: 'NIC photo was too blurry to read.',
            }),
          },
          trustScore: {
            completedRides: 0,
            ratingCount: 0,
            averageRating: 0,
            cancellationCount: 0,
            complaintCount: 0,
            score: null,
          },
          termsAcceptedAt: joined,
          termsVersion: TERMS_VERSION,
          suspended: Boolean(u.suspended),
          ...(u.suspended && {
            suspendedAt: daysAgo(15),
            suspensionReason: u.suspended,
          }),
          createdAt: joined,
          updatedAt: joined,
        };
      }),
    );

    // ---- vehicles
    const vehicleIds = new Map(VEHICLES.map((v) => [v.owner, id()]));
    await connection.collection('vehicles').insertMany(
      VEHICLES.map((v) => ({
        _id: vehicleIds.get(v.owner),
        ownerId: uid(v.owner),
        make: v.make,
        model: v.model,
        year: v.year,
        plateNumber: v.plate,
        seatsAvailable: v.seats,
        isActive: true,
        createdAt: daysAgo(45),
        updatedAt: daysAgo(45),
      })),
    );

    // ---- rides
    const rideIds = new Map(RIDES.map((r) => [r.key, id()]));
    const rideById = new Map(RIDES.map((r) => [r.key, r]));
    await connection.collection('rides').insertMany(
      RIDES.map((r) => ({
        _id: rideIds.get(r.key),
        driverId: uid(r.driver),
        vehicleId: vehicleIds.get(r.driver),
        origin: r.from,
        destination: r.to,
        originPoint: geo(r.from),
        destinationPoint: geo(r.to),
        departureTime: nextDeparture(r.time, r.days),
        daysOfWeek: r.days,
        seatsAvailable: r.seats,
        costContribution: r.cost,
        status: r.status,
        createdAt: daysAgo(40),
        updatedAt: daysAgo(40),
      })),
    );

    // ---- bookings
    const bookingIds = new Map(BOOKINGS.map((b) => [b.key, id()]));
    const bookingByKey = new Map(BOOKINGS.map((b) => [b.key, b]));
    await connection.collection('bookings').insertMany(
      BOOKINGS.map((b) => {
        const requestedAt = daysAgo(b.requested);
        const answered = b.status !== BookingStatus.REQUESTED;
        return {
          _id: bookingIds.get(b.key),
          rideId: rideIds.get(b.ride),
          passengerId: uid(b.passenger),
          status: b.status,
          seatsRequested: 1,
          requestedAt,
          ...(answered && {
            respondedAt: new Date(requestedAt.getTime() + DAY_MS / 4),
          }),
          // a known PIN so the pickup check can be demoed without the passenger's phone
          ...(b.status === BookingStatus.ACCEPTED && { pickupPin: '1234' }),
          ...(b.completed !== undefined && {
            pickupVerifiedAt: daysAgo(b.completed),
            completedAt: daysAgo(b.completed),
          }),
          ...(b.cancelledBy && { cancelledBy: uid(b.cancelledBy) }),
          createdAt: requestedAt,
          updatedAt: requestedAt,
        };
      }),
    );

    // ---- reviews, both directions on each completed booking
    await connection.collection('reviews').insertMany(
      REVIEWS.flatMap(
        ([
          bookingKey,
          toDriver,
          toDriverText,
          toPassenger,
          toPassengerText,
        ]) => {
          const booking = bookingByKey.get(bookingKey)!;
          const driver = rideById.get(booking.ride)!.driver;
          const at = daysAgo((booking.completed ?? 0) - 0.2);
          return [
            {
              from: booking.passenger,
              to: driver,
              fromRole: 'passenger',
              rating: toDriver,
              comment: toDriverText,
            },
            {
              from: driver,
              to: booking.passenger,
              fromRole: 'driver',
              rating: toPassenger,
              comment: toPassengerText,
            },
          ].map((r) => ({
            _id: id(),
            bookingId: bookingIds.get(bookingKey),
            fromUserId: uid(r.from),
            toUserId: uid(r.to),
            fromRole: r.fromRole,
            rating: r.rating,
            comment: r.comment,
            createdAt: at,
            updatedAt: at,
          }));
        },
      ),
    );

    // ---- reports
    const reportIds = REPORTS.map(() => id());
    await connection.collection('reports').insertMany(
      REPORTS.map((r, i) => {
        const resolved = r.status !== ReportStatus.OPEN;
        return {
          _id: reportIds[i],
          reportedBy: uid(r.by),
          reportedUser: uid(r.against),
          reportedRole: r.role,
          bookingId: bookingIds.get(r.booking),
          category: r.category,
          reason: r.reason,
          status: r.status,
          ...(resolved && {
            resolvedBy: adminId,
            resolvedAt: daysAgo(r.filed - 1),
          }),
          createdAt: daysAgo(r.filed),
          updatedAt: daysAgo(r.filed),
        };
      }),
    );

    // ---- admin action log (needs the seeded admin account)
    if (adminId) {
      const entries = [
        ...USERS.filter(
          (u) => u.verification === 'verified' || u.verification === 'rejected',
        ).map((u) => ({
          action:
            u.verification === 'verified'
              ? AdminAction.VERIFICATION_APPROVED
              : AdminAction.VERIFICATION_REJECTED,
          targetUserId: uid(u.key),
          note:
            u.verification === 'rejected'
              ? 'NIC photo was too blurry to read.'
              : undefined,
          createdAt: daysAgo(u.joinedDaysAgo - 2),
        })),
        ...REPORTS.filter((r) => r.status !== ReportStatus.OPEN).map((r) => ({
          action:
            r.status === ReportStatus.REVIEWED
              ? AdminAction.REPORT_REVIEWED
              : AdminAction.REPORT_DISMISSED,
          targetUserId: uid(r.against),
          reportId: reportIds[REPORTS.indexOf(r)],
          note: undefined,
          createdAt: daysAgo(r.filed - 1),
        })),
        ...USERS.filter((u) => u.suspended).map((u) => ({
          action: AdminAction.USER_SUSPENDED,
          targetUserId: uid(u.key),
          note: u.suspended,
          createdAt: daysAgo(15),
        })),
      ];
      await connection
        .collection('adminactionlogs')
        .insertMany(entries.map((e) => ({ _id: id(), adminId, ...e })));
    } else {
      console.warn(
        'No admin account found: run `npm run seed:admin` for the action log.',
      );
    }

    // ---- Trust Scores from the history just created
    const updater = app.get(TrustScoreUpdater);
    for (const u of USERS) {
      const score = await updater.recalculate(String(uid(u.key)));
      console.log(`  ${u.name.padEnd(26)} ${u.role.padEnd(10)} trust ${score}`);
    }

    console.log(
      `\nSeeded ${USERS.length} users, ${VEHICLES.length} vehicles, ${RIDES.length} rides, ` +
        `${BOOKINGS.length} bookings, ${REVIEWS.length * 2} reviews, ${REPORTS.length} reports.`,
    );
    console.log(
      `Log in as any of them, e.g. ishara@${DEMO_DOMAIN} / ${DEMO_PASSWORD}`,
    );
  } finally {
    await app.close();
  }
}

seedDemo().catch((err: unknown) => {
  console.error('Demo seed failed:', err);
  process.exitCode = 1;
});
