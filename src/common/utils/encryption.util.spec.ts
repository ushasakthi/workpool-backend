import { randomBytes } from 'crypto';
import { decrypt, encrypt, hmacDigest } from './encryption.util';

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

  describe('hmacDigest', () => {
    it('is deterministic for the same value and key', () => {
      expect(hmacDigest('199912345678', key)).toBe(
        hmacDigest('199912345678', key),
      );
    });

    it('differs for a different value or a different key', () => {
      expect(hmacDigest('199912345678', key)).not.toBe(
        hmacDigest('199912345679', key),
      );
      expect(hmacDigest('199912345678', key)).not.toBe(
        hmacDigest('199912345678', randomBytes(32)),
      );
    });

    it('returns a 64-char hex string', () => {
      expect(hmacDigest('199912345678', key)).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
