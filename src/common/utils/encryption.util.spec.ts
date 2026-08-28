import { randomBytes } from 'crypto';
import { decrypt, encrypt } from './encryption.util';

describe('encryption.util', () => {
  const key = randomBytes(32);

  it('round-trips a value through encrypt and decrypt', () => {
    const ciphertext = encrypt('199912345678', key);

    expect(ciphertext).not.toBe('199912345678');
    expect(decrypt(ciphertext, key)).toBe('199912345678');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const first = encrypt('199912345678', key);
    const second = encrypt('199912345678', key);

    expect(first).not.toBe(second);
  });

  it('fails to decrypt with the wrong key', () => {
    const ciphertext = encrypt('199912345678', key);
    const wrongKey = randomBytes(32);

    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });
});
