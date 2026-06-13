export type FileCategory = "image" | "pdf" | "audio" | "video" | "text" | "archive" | "binary";

const IMAGE_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg",
  ".tiff", ".tif", ".avif",
]);

const PDF_EXTS = new Set([".pdf"]);

const AUDIO_EXTS = new Set([
  ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus",
]);

const VIDEO_EXTS = new Set([
  ".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".ogv",
]);

const ARCHIVE_EXTS = new Set([
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar", ".tgz", ".zst",
]);

export function getFileCategory(filename: string): FileCategory {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "text";
  const ext = filename.slice(dot).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (PDF_EXTS.has(ext)) return "pdf";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (ARCHIVE_EXTS.has(ext)) return "archive";
  return "text";
}

export function isBinaryFile(filename: string): boolean {
  return getFileCategory(filename) !== "text";
}

export function blobUrl(path: string): string {
  return `/api/fs/blob?${new URLSearchParams({ path }).toString()}`;
}
