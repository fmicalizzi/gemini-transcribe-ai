import { parseFile } from 'music-metadata';
import { spawn } from 'child_process';
import path from 'path';

const SUPPORTED_EXTS = new Set(['.wav', '.mp3', '.aac', '.flac', '.ogg', '.opus', '.webm', '.m4a']);

function ffprobeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    let out = '';
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath]);
    p.stdout.on('data', d => { out += d.toString(); });
    p.on('error', () => resolve(0));
    p.on('close', () => {
      const seconds = parseFloat(out.trim());
      resolve(Number.isFinite(seconds) ? seconds : 0);
    });
  });
}

export async function getMediaInfo(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) {
    throw new Error(`Unsupported extension: ${ext}`);
  }

  const metadata = await parseFile(filePath);
  let durationSeconds = metadata.format.duration ?? 0;

  // Some containers (e.g. WhatsApp .opus) carry no duration in the header, so
  // music-metadata returns undefined. Fall back to ffprobe, otherwise the
  // duration limit check would be silently skipped.
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    durationSeconds = await ffprobeDuration(filePath);
  }

  return {
    durationSeconds,
    ext,
  };
}
