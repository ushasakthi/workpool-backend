import { NicCheck } from '../../common/constants';
import { containsNicNumber, NicCheckService } from './nic-check.service';

describe('containsNicNumber', () => {
  it('finds a 12-digit NIC split by spaces and line breaks', () => {
    const ocrText = 'NATIONAL IDENTITY CARD\nNo. 1999 1234\n5678';
    expect(containsNicNumber(ocrText, '199912345678')).toBe(true);
  });

  it('finds an old-format NIC regardless of letter case', () => {
    expect(containsNicNumber('ID: 912345678v', '912345678V')).toBe(true);
  });

  it('returns false when the number is not in the text', () => {
    expect(containsNicNumber('Ready to fly MALAYSIA 170', '199912345678')).toBe(
      false,
    );
  });
});

describe('NicCheckService', () => {
  it('skips PDFs', async () => {
    const service = new NicCheckService();
    await expect(
      service.check('/uploads/nic.pdf', '199912345678'),
    ).resolves.toBe(NicCheck.NOT_CHECKED);
  });
});
