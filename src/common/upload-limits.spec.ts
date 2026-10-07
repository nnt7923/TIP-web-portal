import { MaxFileSizeValidator } from '@nestjs/common';
import { MAX_UPLOAD_BYTES, UPLOAD_VALIDATOR_OPTIONS } from './upload-limits';

describe('Inclusive Vercel file limit', () => {
  const validator = new MaxFileSizeValidator(UPLOAD_VALIDATOR_OPTIONS);
  it('accepts exactly 4 MiB and rejects one extra byte', () => {
    expect(MAX_UPLOAD_BYTES).toBe(4194304);
    expect(validator.isValid({ size: MAX_UPLOAD_BYTES })).toBe(true);
    expect(validator.isValid({ size: MAX_UPLOAD_BYTES + 1 })).toBe(false);
  });
});
