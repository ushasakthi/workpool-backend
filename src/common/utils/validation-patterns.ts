export const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt silently ignores bytes past 72, so longer inputs wouldn't add real strength
export const PASSWORD_MAX_LENGTH = 72;

// Sri Lankan NIC: old format (9 digits + V/X) or new format (12 digits)
export const NIC_REGEX = /^([0-9]{9}[vVxX]|[0-9]{12})$/;
export const LINKEDIN_URL_REGEX = /^https?:\/\/([\w-]+\.)?linkedin\.com\/.+/i;
