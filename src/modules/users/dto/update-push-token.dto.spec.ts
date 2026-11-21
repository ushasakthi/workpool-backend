import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePushTokenDto } from './update-push-token.dto';

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdatePushTokenDto, body));
  return errors.map((e) => e.property);
}

describe('UpdatePushTokenDto', () => {
  it('accepts an Expo push token', async () => {
    expect(
      await errorsFor({ token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' }),
    ).toEqual([]);
  });

  it('refuses anything else', async () => {
    expect(await errorsFor({ token: 'not-a-token' })).toEqual(['token']);
    expect(await errorsFor({})).toEqual(['token']);
  });
});
