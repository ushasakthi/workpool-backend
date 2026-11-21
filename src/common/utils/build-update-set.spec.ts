import { buildUpdateSet } from './build-update-set';

describe('buildUpdateSet', () => {
  it('keeps only the keys whose value is defined', () => {
    expect(
      buildUpdateSet({ make: 'Toyota', model: undefined, year: 2018 }),
    ).toEqual({ make: 'Toyota', year: 2018 });
  });

  it('returns an empty object when every value is undefined', () => {
    expect(buildUpdateSet({ a: undefined, b: undefined })).toEqual({});
  });

  it('keeps falsy-but-defined values (0, "", false)', () => {
    expect(buildUpdateSet({ seats: 0, label: '', hidden: false })).toEqual({
      seats: 0,
      label: '',
      hidden: false,
    });
  });

  it('dots each key into the given sub-document prefix', () => {
    expect(
      buildUpdateSet({ lat: 6.9, lng: undefined }, 'travelProfile.'),
    ).toEqual({ 'travelProfile.lat': 6.9 });
  });
});
