import { Weekday } from '../../../common/constants';

export interface BookingEmail {
  subject: string;
  headline: string;
  body: string;
  ride: {
    from: string;
    to: string;
    days: Weekday[];
    departureTime: Date;
  };
  // app screen the button opens, e.g. "bookings/requests"
  path: string;
  // finishes "You're receiving this because ..."
  reason: string;
}

const WORK_WEEK = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
];

// "Mon–Fri", or the days in week order: "Mon, Wed, Fri"
export function formatDays(days: Weekday[]): string {
  if (days.length === 5 && WORK_WEEK.every((day) => days.includes(day))) {
    return 'Mon–Fri';
  }
  return Object.values(Weekday)
    .filter((day) => days.includes(day))
    .join(', ');
}

// departure times are Colombo times, whatever timezone the server runs in
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Colombo',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// names and place labels are typed by users, so they can't be trusted as HTML
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FOOTER =
  'WorkPool is a cost-sharing platform for coworkers. Drivers share the cost of a commute they already make; it is not a taxi or paid ride service.';

export function renderBookingEmail(
  email: BookingEmail,
  appBaseUrl: string,
): { text: string; html: string } {
  const link = `${appBaseUrl}${email.path}`;
  const days = formatDays(email.ride.days);
  const time = formatTime(email.ride.departureTime);

  const text = [
    email.headline,
    '',
    email.body,
    '',
    `${email.ride.from} → ${email.ride.to}`,
    `${days} · ${time}`,
    '',
    `Open WorkPool: ${link}`,
    '',
    FOOTER,
    `You're receiving this because ${email.reason}.`,
  ].join('\n');

  const e = escapeHtml;
  // email clients ignore <style> blocks, so everything is inline and table-based
  const html = `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8F6;font-family:Helvetica,Arial,sans-serif;color:#1A1F1C;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td style="padding:0 0 20px 32px;">
        <span style="display:inline-block;background:#2E6B4F;color:#FFFFFF;font-weight:700;border-radius:8px;padding:8px 10px;">WP</span>
        <span style="font-size:20px;font-weight:700;padding-left:8px;">WorkPool</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid #E3E6E3;border-radius:16px;padding:32px;">
        <h1 style="margin:0 0 12px;font-size:24px;">${e(email.headline)}</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#60646C;">${e(email.body)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F3F1;border-radius:12px;">
          <tr><td style="padding:20px 20px 4px;font-size:16px;font-weight:700;">
            <span style="color:#D4A24C;">●</span>&nbsp; ${e(email.ride.from)}
          </td></tr>
          <tr><td style="padding:4px 20px 16px;font-size:16px;font-weight:700;">
            <span style="color:#2E6B4F;">●</span>&nbsp; ${e(email.ride.to)}
          </td></tr>
          <tr><td style="padding:16px 20px 20px;border-top:1px solid #DDE2DE;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="50%" style="font-size:14px;color:#60646C;">Days<br><strong style="font-size:16px;color:#1A1F1C;">${e(days)}</strong></td>
              <td width="50%" style="font-size:14px;color:#60646C;">Pickup time<br><strong style="font-size:16px;color:#1A1F1C;">${e(time)}</strong></td>
            </tr></table>
          </td></tr>
        </table>
        <a href="${e(link)}" style="display:inline-block;margin-top:28px;background:#2E6B4F;color:#FFFFFF;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 28px;">Open WorkPool</a>
      </td></tr>
      <tr><td style="padding:24px 32px 0;font-size:14px;line-height:1.5;color:#60646C;">
        <p style="margin:0 0 12px;">${FOOTER}</p>
        <p style="margin:0;">You're receiving this because ${e(email.reason)}.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

  return { text, html };
}
