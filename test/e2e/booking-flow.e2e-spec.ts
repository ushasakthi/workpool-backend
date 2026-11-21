import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { colomboDateString } from '../../src/modules/bookings/travel-date';

// The whole commute through the real HTTP API and a real database:
// register -> vehicle -> ride -> request -> accept -> pickup PIN -> SOS ->
// complete -> review -> Trust Score and savings. The steps share state and run
// in order, like one user story.

// The real pickup rules apply here (the dev-only skip switch is off under jest): the PIN
// only works on the travel day, within an hour of departure. So the ride runs every day,
// leaves a few minutes from now, and is booked for today.
const DEPARTS_IN_MS = 10 * 60 * 1000;
const EVERY_DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Body<T = Record<string, unknown>> {
  success: boolean;
  statusCode: number;
  data: T;
  message?: string | string[];
}

describe('Booking flow (e2e)', () => {
  let app: INestApplication<App>;
  let connection: Connection;

  // filled in as the story goes
  const driver = { id: '', token: '' };
  const passenger = { id: '', token: '' };
  const stranger = { id: '', token: '' };
  let vehicleId = '';
  let rideId = '';
  let bookingId = '';
  let pin = '';

  const api = () => request(app.getHttpServer());
  const as = (user: { token: string }) => ({
    Authorization: `Bearer ${user.token}`,
  });

  // never wipe anything that isn't the throwaway test database
  async function resetDatabase() {
    const name = connection.db?.databaseName ?? '';
    if (!name.endsWith('_e2e')) {
      throw new Error(`Refusing to drop "${name}": not an _e2e database`);
    }
    await connection.dropDatabase();
  }

  async function register(
    name: string,
    role: 'driver' | 'passenger',
    into: { id: string; token: string },
  ) {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({
        name,
        email: `${name.split(' ')[0].toLowerCase()}@e2e.workpool.lk`,
        password: 'CorrectPass1',
        phone: '+94771234567',
        role,
        acceptedTerms: true,
      })
      .expect(201);
    const body = response.body as Body<{
      user: { id: string };
      accessToken: string;
    }>;
    into.id = body.data.user.id;
    into.token = body.data.accessToken;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  it('refuses requests without a token', async () => {
    await api().get('/api/v1/users/me').expect(401);
  });

  it('registers a driver, a passenger and an unrelated user', async () => {
    await register('Nimal Fernando', 'driver', driver);
    await register('Kasun Perera', 'passenger', passenger);
    await register('Ravi Silva', 'passenger', stranger);
    expect(driver.token).not.toBe('');
  });

  it('lets the driver add a vehicle and post a ride', async () => {
    const vehicle = await api()
      .post('/api/v1/vehicles')
      .set(as(driver))
      .send({
        make: 'Toyota',
        model: 'Aqua',
        year: 2018,
        plateNumber: 'CAB-4521',
        seatsAvailable: 4,
      })
      .expect(201);
    vehicleId = (vehicle.body as Body<{ id: string }>).data.id;

    const ride = await api()
      .post('/api/v1/rides')
      .set(as(driver))
      .send({
        vehicleId,
        origin: { lat: 6.8649, lng: 79.8997, label: 'Nugegoda' },
        destination: { lat: 6.9271, lng: 79.8612, label: 'Colombo 03' },
        departureTime: new Date(Date.now() + DEPARTS_IN_MS).toISOString(),
        daysOfWeek: EVERY_DAY,
        seatsAvailable: 3,
        costContribution: 400,
      })
      .expect(201);
    rideId = (ride.body as Body<{ id: string }>).data.id;
  });

  it("doesn't let a passenger post a ride (role guard)", async () => {
    await api().post('/api/v1/rides').set(as(passenger)).send({}).expect(403);
  });

  it('lets the passenger request a seat', async () => {
    const response = await api()
      .post('/api/v1/bookings')
      .set(as(passenger))
      .send({
        rideId,
        seatsRequested: 1,
        travelDate: colomboDateString(new Date()),
      })
      .expect(201);
    const booking = (response.body as Body<{ id: string; status: string }>)
      .data;
    bookingId = booking.id;
    expect(booking.status).toBe('requested');
  });

  it('only lets the driver accept', async () => {
    await api()
      .patch(`/api/v1/bookings/${bookingId}/accept`)
      .set(as(passenger))
      .expect(403);

    const response = await api()
      .patch(`/api/v1/bookings/${bookingId}/accept`)
      .set(as(driver))
      .expect(200);
    expect((response.body as Body<{ status: string }>).data.status).toBe(
      'accepted',
    );
  });

  it('shows the pickup PIN to the passenger only (FR13)', async () => {
    const mine = await api()
      .get('/api/v1/bookings/me?as=passenger')
      .set(as(passenger))
      .expect(200);
    const [passengerItem] = (mine.body as Body<{ pickupPin?: string }[]>).data;
    expect(passengerItem.pickupPin).toMatch(/^\d{4}$/);
    pin = passengerItem.pickupPin!;

    const requests = await api()
      .get('/api/v1/bookings/me?as=driver')
      .set(as(driver))
      .expect(200);
    const [driverItem] = (requests.body as Body<{ pickupPin?: string }[]>).data;
    expect(driverItem.pickupPin).toBeUndefined();
  });

  it("can't be completed before the pickup is verified", async () => {
    await api()
      .patch(`/api/v1/bookings/${bookingId}/complete`)
      .set(as(driver))
      .expect(409);
  });

  it('rejects a wrong PIN and accepts the right one', async () => {
    const wrong = String((Number(pin) + 1) % 10000).padStart(4, '0');
    await api()
      .patch(`/api/v1/bookings/${bookingId}/verify-pickup`)
      .set(as(driver))
      .send({ pin: wrong })
      .expect(400);

    const response = await api()
      .patch(`/api/v1/bookings/${bookingId}/verify-pickup`)
      .set(as(driver))
      .send({ pin })
      .expect(200);
    expect(
      (response.body as Body<{ pickupVerifiedAt?: string }>).data
        .pickupVerifiedAt,
    ).toBeDefined();
  });

  it('asks for an emergency contact before an SOS (FR17)', async () => {
    await api()
      .post('/api/v1/sos')
      .set(as(passenger))
      .send({ bookingId })
      .expect(400);
  });

  it('sends an SOS with the ride details once a contact is saved', async () => {
    await api()
      .patch('/api/v1/users/me/emergency-contact')
      .set(as(passenger))
      .send({ name: 'Amali Perera', phone: '+94771112222' })
      .expect(200);

    const response = await api()
      .post('/api/v1/sos')
      .set(as(passenger))
      .send({ bookingId })
      .expect(201);
    const result = (
      response.body as Body<{ contact: { phone: string }; message: string }>
    ).data;
    expect(result.contact.phone).toBe('+94771112222');
    expect(result.message).toContain('Kasun needs help');
    expect(result.message).toContain('Nugegoda → Colombo 03');
    expect(result.message).toContain('Driver: Nimal F.');
    expect(result.message).toContain('CAB-4521');
  });

  it("doesn't let someone outside the booking send an SOS", async () => {
    await api()
      .patch('/api/v1/users/me/emergency-contact')
      .set(as(stranger))
      .send({ name: 'Someone', phone: '+94770000000' })
      .expect(200);

    await api()
      .post('/api/v1/sos')
      .set(as(stranger))
      .send({ bookingId })
      .expect(403);
  });

  it('never shows the emergency contact on the public profile', async () => {
    const response = await api()
      .get(`/api/v1/users/${passenger.id}/profile`)
      .set(as(driver))
      .expect(200);
    expect(response.body).not.toHaveProperty('data.emergencyContact');
  });

  it('lets the driver complete the ride', async () => {
    const response = await api()
      .patch(`/api/v1/bookings/${bookingId}/complete`)
      .set(as(driver))
      .expect(200);
    expect((response.body as Body<{ status: string }>).data.status).toBe(
      'completed',
    );
  });

  it('turns SOS off once the ride is over', async () => {
    await api()
      .post('/api/v1/sos')
      .set(as(passenger))
      .send({ bookingId })
      .expect(409);
  });

  it('lets the passenger rate the driver once', async () => {
    await api()
      .post('/api/v1/reviews')
      .set(as(passenger))
      .send({ bookingId, rating: 5, comment: 'Smooth ride, on time.' })
      .expect(201);

    await api()
      .post('/api/v1/reviews')
      .set(as(passenger))
      .send({ bookingId, rating: 5 })
      .expect(409);
  });

  it("updates the driver's Trust Score from the completed ride and rating", async () => {
    const response = await api()
      .get(`/api/v1/users/${driver.id}/profile`)
      .set(as(passenger))
      .expect(200);
    const trust = (
      response.body as Body<{
        trustScore: { completedRides: number; ratingCount: number };
      }>
    ).data.trustScore;
    expect(trust.completedRides).toBe(1);
    expect(trust.ratingCount).toBe(1);
  });

  it("counts the ride in the passenger's savings, with CO₂", async () => {
    const response = await api()
      .get('/api/v1/bookings/me/savings')
      .set(as(passenger))
      .expect(200);
    const savings = (
      response.body as Body<{
        asPassenger: { rides: number; saved: number; co2SavedKg: number };
      }>
    ).data.asPassenger;
    expect(savings.rides).toBe(1);
    expect(savings.saved).toBeGreaterThan(0);
    expect(savings.co2SavedKg).toBeGreaterThan(0);
  });
});
