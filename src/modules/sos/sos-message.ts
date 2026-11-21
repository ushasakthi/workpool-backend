import { formatTime } from '../mail/templates/booking-email';

export interface SosMessageInput {
  senderName: string;
  // the other person on the booking
  other: { name: string; role: 'driver' | 'passenger' };
  from: string;
  to: string;
  departureTime: Date;
  vehicle?: { make: string; model: string; plateNumber: string };
  sentAt: Date;
}

// "Kasun Perera" -> "Kasun P."
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}

// The text the app puts into the phone's Messages app. It's built here so it's
// the same on every phone and can be tested, and because the app doesn't have
// the other person's full details or the car's plate.
export function buildSosMessage(input: SosMessageInput): string {
  const sender = input.senderName.trim().split(/\s+/)[0];
  const role = input.other.role === 'driver' ? 'Driver' : 'Passenger';
  const lines = [
    `WorkPool SOS: ${sender} needs help during a shared ride.`,
    `Route: ${input.from} → ${input.to}, ${formatTime(input.departureTime)}`,
    `${role}: ${shortName(input.other.name)}`,
  ];
  if (input.vehicle) {
    const { make, model, plateNumber } = input.vehicle;
    lines.push(`Car: ${make} ${model} · ${plateNumber}`);
  }
  lines.push(
    `Sent ${formatTime(input.sentAt)}. If you can't reach them, call 119.`,
  );
  return lines.join('\n');
}
