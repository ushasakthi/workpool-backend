import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyPickupDto } from './verify-pickup.dto';

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(VerifyPickupDto, body));
  return errors.map((e) => e.property);
}

describe('VerifyPickupDto', () => {
  it('accepts 4 digits, including a leading zero', async () => {
    expect(await errorsFor({ pin: '0481' })).toEqual([]);
  });

  it('refuses anything else', async () => {
    for (const pin of ['481', '48211', 'abcd', 4821]) {
      expect(await errorsFor({ pin })).toEqual(['pin']);
    }
  });
});
