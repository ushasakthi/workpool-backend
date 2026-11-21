import { Weekday } from '../../../common/constants';
import {
  BookingEmail,
  escapeHtml,
  formatDays,
  formatTime,
  renderBookingEmail,
} from './booking-email';

const email: BookingEmail = {
  subject: 'New seat request on your ride',
  headline: 'Kasun asked for 1 seat on your ride',
  body: 'Review the request in WorkPool to accept or decline.',
  ride: {
    from: 'Rajagiriya',
    to: 'Orion Tech Park, Colombo 09',
    days: [Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI],
    // 8:15 am in Colombo (UTC+5:30)
    departureTime: new Date('2026-11-02T02:45:00Z'),
  },
  path: 'bookings/requests',
  reason: 'you offer rides on WorkPool',
};

describe('formatDays', () => {
  it('shortens the full work week', () => {
    expect(formatDays(email.ride.days)).toBe('Mon–Fri');
  });

  it('lists other days in week order', () => {
    expect(formatDays([Weekday.FRI, Weekday.MON, Weekday.WED])).toBe(
      'Mon, Wed, Fri',
    );
  });
});

describe('formatTime', () => {
  it('shows the time in Colombo', () => {
    expect(formatTime(email.ride.departureTime)).toBe('8:15 AM');
  });
});

describe('escapeHtml', () => {
  it('stops user text from becoming HTML', () => {
    expect(escapeHtml('<b>"Kasun" & co</b>')).toBe(
      '&lt;b&gt;&quot;Kasun&quot; &amp; co&lt;/b&gt;',
    );
  });
});

describe('renderBookingEmail', () => {
  const { text, html } = renderBookingEmail(email, 'workpoolfrontend://');

  it('puts the headline, route and app link in both versions', () => {
    for (const version of [text, html]) {
      expect(version).toContain('Kasun asked for 1 seat on your ride');
      expect(version).toContain('Rajagiriya');
      expect(version).toContain('Mon–Fri');
      expect(version).toContain('workpoolfrontend://bookings/requests');
    }
  });

  it('escapes names typed by users', () => {
    const rendered = renderBookingEmail(
      { ...email, headline: '<script>x</script> asked for 1 seat' },
      'workpoolfrontend://',
    );

    expect(rendered.html).not.toContain('<script>');
  });

  it('never uses fare or price wording', () => {
    expect(`${text} ${html}`).not.toMatch(/fare|price|commission/i);
  });
});
