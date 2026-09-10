export const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt silently ignores bytes past 72, so longer inputs wouldn't add real strength
export const PASSWORD_MAX_LENGTH = 72;

// Sri Lankan NIC: old format (9 digits + V/X) or new format (12 digits)
export const NIC_REGEX = /^([0-9]{9}[vVxX]|[0-9]{12})$/;
export const LINKEDIN_URL_REGEX = /^https?:\/\/([\w-]+\.)?linkedin\.com\/.+/i;

// 24-hour clock time, e.g. "08:30" or "17:05" — used for work start/end times.
export const TIME_HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Sri Lankan vehicle number plate. Accepts the current letter series
// ("CAB-1234", with an optional 2–3 letter province code e.g. "WP CAB-1234")
// and the older numeric series ("251-1234"). Stored normalised to upper case.
export const PLATE_NUMBER_REGEX =
  /^(?:[A-Z]{2,3}\s)?(?:[A-Z]{2,3}|\d{2,3})-\d{4}$/i;
