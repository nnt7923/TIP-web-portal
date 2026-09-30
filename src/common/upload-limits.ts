/** Inclusive per-file limit; leave room for multipart framing on Vercel. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
// Nest's MaxFileSizeValidator uses a strict less-than comparison.
export const UPLOAD_VALIDATOR_OPTIONS = {
  maxSize: MAX_UPLOAD_BYTES + 1,
  message: 'File must not exceed 4 MiB (4194304 bytes)',
};
