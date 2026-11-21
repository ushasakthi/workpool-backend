import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import { BookingStatus } from '../../common/constants';
import { BookingsService } from '../bookings/bookings.service';
import { RidesService } from '../rides/rides.service';
import { UsersService } from '../users/users.service';
import { VehicleDocument } from '../vehicles/schemas/vehicle.schema';
import { SosAlertDocument } from './schemas/sos-alert.schema';
import { SosService } from './sos.service';

const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

describe('SosService', () => {
  let saved: Record<string, unknown> | undefined;
  let bookingsService: { getParties: jest.Mock };
  let usersService: { findEmergencyContact: jest.Mock; findNames: jest.Mock };
  let service: SosService;

  beforeEach(() => {
    saved = undefined;
    const sosModel = jest.fn((doc: Record<string, unknown>) => {
      saved = doc;
      return {
        save: jest.fn().mockResolvedValue({
          id: 'alert-1',
          createdAt: new Date('2026-11-03T02:22:00Z'),
        }),
      };
    });
    const vehicleModel = {
      findById: jest
        .fn()
        .mockReturnValue(
          query({ make: 'Toyota', model: 'Axio', plateNumber: 'CAB-1234' }),
        ),
    };
    bookingsService = {
      getParties: jest.fn().mockResolvedValue({
        rideId: 'ride-1',
        status: BookingStatus.ACCEPTED,
        passengerId: 'passenger-1',
        driverId: 'driver-1',
      }),
    };
    const ridesService = {
      getRideOrThrow: jest.fn().mockResolvedValue({
        vehicleId: 'vehicle-1',
        origin: { label: 'Nugegoda' },
        destination: { label: 'WTC Colombo' },
        departureTime: new Date('2026-11-03T02:00:00Z'),
      }),
    };
    usersService = {
      findEmergencyContact: jest
        .fn()
        .mockResolvedValue({ name: 'Amali Perera', phone: '+94771234567' }),
      findNames: jest.fn().mockResolvedValue(
        new Map([
          ['passenger-1', 'Nadeesha Silva'],
          ['driver-1', 'Kasun Perera'],
        ]),
      ),
    };

    service = new SosService(
      sosModel as unknown as Model<SosAlertDocument>,
      vehicleModel as unknown as Model<VehicleDocument>,
      bookingsService as unknown as BookingsService,
      ridesService as unknown as RidesService,
      usersService as unknown as UsersService,
    );
  });

  it('records the alert and returns the contact and message', async () => {
    const result = await service.trigger('passenger-1', 'booking-1');

    expect(saved).toEqual({ userId: 'passenger-1', bookingId: 'booking-1' });
    expect(result.alertId).toBe('alert-1');
    expect(result.contact).toEqual({
      name: 'Amali Perera',
      phone: '+94771234567',
    });
    expect(result.message).toContain('Nadeesha needs help');
    expect(result.message).toContain('Driver: Kasun P.');
    expect(result.message).toContain('CAB-1234');
  });

  it('works from the driver side too', async () => {
    const result = await service.trigger('driver-1', 'booking-1');

    expect(result.message).toContain('Kasun needs help');
    expect(result.message).toContain('Passenger: Nadeesha S.');
  });

  it("refuses someone who isn't on the booking", async () => {
    await expect(service.trigger('stranger', 'booking-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('only works on an accepted ride', async () => {
    bookingsService.getParties.mockResolvedValue({
      rideId: 'ride-1',
      status: BookingStatus.COMPLETED,
      passengerId: 'passenger-1',
      driverId: 'driver-1',
    });

    await expect(service.trigger('passenger-1', 'booking-1')).rejects.toThrow(
      ConflictException,
    );
    expect(saved).toBeUndefined();
  });

  it('asks for an emergency contact first', async () => {
    usersService.findEmergencyContact.mockResolvedValue(undefined);

    await expect(service.trigger('passenger-1', 'booking-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(saved).toBeUndefined();
  });
});
