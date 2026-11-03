import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const valid = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'CorrectPass1',
  phone: '+94771234567',
  acceptedTerms: true,
};

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(RegisterDto, body));
  return errors.map((e) => e.property);
}

describe('RegisterDto terms acceptance', () => {
  it('accepts a registration that agreed to the terms', async () => {
    expect(await errorsFor(valid)).toEqual([]);
  });

  it('refuses one that did not agree', async () => {
    expect(await errorsFor({ ...valid, acceptedTerms: false })).toEqual([
      'acceptedTerms',
    ]);
  });

  it('refuses one that left it out, or sent "true" as text', async () => {
    const { acceptedTerms, ...withoutTerms } = valid;
    void acceptedTerms;
    expect(await errorsFor(withoutTerms)).toEqual(['acceptedTerms']);
    expect(await errorsFor({ ...valid, acceptedTerms: 'true' })).toEqual([
      'acceptedTerms',
    ]);
  });
});
