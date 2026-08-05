export const MAX_TICKET_FILES = 4;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

const allowedTicketTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export type UploadCandidate = Pick<File, "name" | "size" | "type">;

export function passwordSecurityError(password: string) {
  if (password.length < 12) return "יש לבחור סיסמה באורך 12 תווים לפחות.";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
    return "הסיסמה צריכה לכלול לפחות אות אחת ומספר אחד.";
  }
  return "";
}

export function ticketFileSecurityError(file: UploadCandidate) {
  if (!allowedTicketTypes.has(file.type)) {
    return `הקובץ ${file.name} אינו מסוג נתמך.`;
  }
  const limit = file.type.startsWith("video/")
    ? MAX_VIDEO_BYTES
    : MAX_IMAGE_BYTES;
  if (file.size <= 0 || file.size > limit) {
    return `הקובץ ${file.name} גדול מדי.`;
  }
  return "";
}

export function validateTicketFiles(files: UploadCandidate[]) {
  if (files.length > MAX_TICKET_FILES) {
    return `ניתן לצרף עד ${MAX_TICKET_FILES} קבצים לקריאה.`;
  }
  for (const file of files) {
    const error = ticketFileSecurityError(file);
    if (error) return error;
  }
  return "";
}

export function safeStorageFileName(fileName: string, uniqueId: string) {
  const extension = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase().slice(0, 12)
    : "";
  const stem = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9\-_\u0590-\u05ff]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "attachment";
  return `${uniqueId}-${stem}${extension}`;
}
