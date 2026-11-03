// Builds a $set object, skipping undefined so PATCH doesn't clear fields.
// buildUpdateSet({ lat: 1 }, 'travelProfile.') -> { 'travelProfile.lat': 1 }
export function buildUpdateSet(
  input: object,
  prefix = '',
): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      set[`${prefix}${key}`] = value as unknown;
    }
  }
  return set;
}
