import { approxLabel, GeocodeService } from './geocode.service';

describe('approxLabel', () => {
  it('joins the area and the city', () => {
    expect(approxLabel({ suburb: 'Bambalapitiya', city: 'Colombo' })).toBe(
      'Near Bambalapitiya, Colombo',
    );
  });

  it('uses the village when there is no city or area', () => {
    expect(approxLabel({ village: 'Karagampitiya', state: 'Western' })).toBe(
      'Near Karagampitiya',
    );
  });

  it('returns null when nothing useful is known', () => {
    expect(approxLabel({})).toBeNull();
  });
});

describe('GeocodeService', () => {
  const service = new GeocodeService();
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sends a User-Agent and returns the label', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ address: { suburb: 'Fort', city: 'Colombo' } }),
    });
    global.fetch = fetchMock;

    await expect(service.reverse(6.93, 79.84)).resolves.toEqual({
      label: 'Near Fort, Colombo',
    });
    const [, options] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(options.headers['User-Agent']).toContain('WorkPool');
  });

  it('returns a null label when the lookup is refused', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(service.reverse(6.93, 79.84)).resolves.toEqual({
      label: null,
    });
  });
});
