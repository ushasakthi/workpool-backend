// Turns a partial input object into a Mongoose `$set` payload, skipping keys
// whose value is `undefined` so a partial PATCH never clears a field the client
// didn't send. `prefix` dots into an embedded sub-document, e.g.
// buildUpdateSet({ lat: 1 }, 'travelProfile.') → { 'travelProfile.lat': 1 }.
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
