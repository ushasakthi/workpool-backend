import { Injectable } from '@nestjs/common';
import { recognize } from 'tesseract.js';
import { NicCheck } from '../../common/constants';

// OCR spaces or line-breaks the number, so compare digits (and V/X) only
export function containsNicNumber(text: string, nicNumber: string): boolean {
  const compactText = text.toUpperCase().replace(/[^0-9VX]/g, '');
  return compactText.includes(nicNumber.toUpperCase());
}

@Injectable()
export class NicCheckService {
  async check(filePath: string, nicNumber: string): Promise<NicCheck> {
    if (filePath.toLowerCase().endsWith('.pdf')) {
      return NicCheck.NOT_CHECKED;
    }

    try {
      const { data } = await recognize(filePath, 'eng');
      return containsNicNumber(data.text, nicNumber)
        ? NicCheck.MATCHED
        : NicCheck.NOT_DETECTED;
    } catch {
      // an OCR failure shouldn't block the user, the admin still reviews it
      return NicCheck.NOT_CHECKED;
    }
  }
}
