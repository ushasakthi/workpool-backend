import { PushService } from './push.service';

describe('PushService', () => {
  const service = new PushService();
  let fetchMock: jest.Mock;

  const reply = (ok: boolean, body: unknown) =>
    fetchMock.mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(body),
    });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it("posts the message to Expo's push service", async () => {
    reply(true, { data: { status: 'ok' } });

    await service.sendPush('ExponentPushToken[abc]', 'Title', 'Body', {
      path: 'bookings',
    });

    const [url, options] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: string; signal?: AbortSignal },
    ];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(options.method).toBe('POST');
    // a time limit, so a slow Expo can't hold up the caller
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toMatchObject({
      to: 'ExponentPushToken[abc]',
      title: 'Title',
      body: 'Body',
      data: { path: 'bookings' },
    });
  });

  it("doesn't throw when Expo rejects the token or is down", async () => {
    reply(true, { data: { status: 'error', message: 'DeviceNotRegistered' } });
    await expect(
      service.sendPush('ExponentPushToken[old]', 'T', 'B', {}),
    ).resolves.toBeUndefined();

    reply(false, {});
    await expect(
      service.sendPush('ExponentPushToken[abc]', 'T', 'B', {}),
    ).resolves.toBeUndefined();
  });
});
