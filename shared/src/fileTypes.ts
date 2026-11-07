export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const OFFICE_XML = 'application/vnd.openxmlformats-officedocument';

const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: [`${OFFICE_XML}.wordprocessingml.document`],
  xls: ['application/vnd.ms-excel'],
  xlsx: [`${OFFICE_XML}.spreadsheetml.sheet`],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: [`${OFFICE_XML}.presentationml.presentation`],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

/** Los navegadores declaran estos tipos cuando el sistema no reconoce la extensión. */
const UNKNOWN_MIME = new Set(['', 'application/octet-stream']);

export const ACCEPT_ATTRIBUTE = Object.keys(MIME_BY_EXTENSION).map((ext) => `.${ext}`).join(',');

export function isAllowedFile(filename: string, mimeType: string): boolean {
  const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  const allowed = MIME_BY_EXTENSION[extension];
  if (!allowed) return false;
  const mime = mimeType.split(';')[0]!.trim().toLowerCase();
  return UNKNOWN_MIME.has(mime) || allowed.includes(mime);
}
