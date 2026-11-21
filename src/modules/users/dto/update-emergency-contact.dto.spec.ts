import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateEmergencyContactDto } from './update-emergency-contact.dto';

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(
    plainToInstance(UpdateEmergencyContactDto, body),
  );
  return errors.map((e) => e.property);
}

describe('UpdateEmergencyContactDto', () => {
  it('accepts a name and an international phone number', async () => {
    expect(
      await errorsFor({ name: 'Amali Perera', phone: '+94771234567' }),
    ).toEqual([]);
  });

  it('refuses a blank name or a short number', async () => {
    expect(await errorsFor({ name: '  ', phone: '+94771234567' })).toEqual([
      'name',
    ]);
    expect(await errorsFor({ name: 'Amali', phone: '77123' })).toEqual([
      'phone',
    ]);
  });
});
