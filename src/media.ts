import { parseFile } from 'music-metadata';
import path from 'path';

const SUPPORTED_EXTS = new Set(['.wav', '.mp3', '.aac', '.flac', '.ogg', '.webm', '.m4a']);

export async function getMediaInfo(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) {
    throw new Error(`Unsupported extension: ${ext}`);
  }

  const metadata = await parseFile(filePath);
  const durationSeconds = metadata.format.duration || 0;
  return {
    durationSeconds,
    ext,
  };
}
