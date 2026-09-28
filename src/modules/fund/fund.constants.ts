export const FUND_START_AT = new Date('2026-09-30T18:30:00.000Z');
export const FUND_START_MONTH = '2026-10';
export const FUND_MONTHLY_ALLOCATION_INR = 30_000;
export const FUND_CONTACT_CONFIDENCE_THRESHOLD = 60;
export const FUND_PAYMENT_CONFIDENCE_THRESHOLD = 70;
export const FUND_REVIEW_TARGET_HOURS = 24;
export const FUND_MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024;
export const FUND_MAX_EVIDENCE_FILES_PER_UPLOAD = 4;

export const FUND_ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
