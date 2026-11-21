import { buildSosMessage, shortName } from './sos-message';

const base = {
  senderName: 'Nadeesha Silva',
  other: { name: 'Kasun Perera', role: 'driver' as const },
  from: 'Nugegoda',
  to: 'WTC Colombo',
  // 7:30 and 7:52 am in Colombo (UTC+5:30)
  departureTime: new Date('2026-11-03T02:00:00Z'),
  vehicle: { make: 'Toyota', model: 'Axio', plateNumber: 'CAB-1234' },
  sentAt: new Date('2026-11-03T02:22:00Z'),
};

describe('shortName', () => {
  it('keeps the first name and the last initial', () => {
    expect(shortName('Kasun Perera')).toBe('Kasun P.');
    expect(shortName('Kasun Malith Perera')).toBe('Kasun P.');
    expect(shortName('Kasun')).toBe('Kasun');
  });
});

describe('buildSosMessage', () => {
  it('gives the contact everything they need to act', () => {
    expect(buildSosMessage(base)).toBe(
      [
        'WorkPool SOS: Nadeesha needs help during a shared ride.',
        'Route: Nugegoda → WTC Colombo, 7:30 AM',
        'Driver: Kasun P.',
        'Car: Toyota Axio · CAB-1234',
        "Sent 7:52 AM. If you can't reach them, call 119.",
      ].join('\n'),
    );
  });

  it('names the passenger when the driver sends it', () => {
    const message = buildSosMessage({
      ...base,
      other: { name: 'Ishara Fernando', role: 'passenger' },
    });

    expect(message).toContain('Passenger: Ishara F.');
  });

  it('leaves out the car line when the vehicle is unknown', () => {
    expect(buildSosMessage({ ...base, vehicle: undefined })).not.toContain(
      'Car:',
    );
  });
});
