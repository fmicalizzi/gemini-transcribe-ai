import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { getMediaInfo } from './media.js';

export interface AudioChunk {
  file: string;
  offsetSeconds: number;
}

export async function chunkAudio(
  filePath: string,
  chunkSeconds: number,
  log: (msg: string) => void
): Promise<{ chunks: AudioChunk[]; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'transcribe-split-'));
  const pattern = path.join(dir, 'chunk-%03d.m4a');
  log(`[SPLIT] Cutting into ~${Math.round(chunkSeconds / 60)}min chunks (mono AAC)...`);

  await new Promise<void>((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', filePath,
      '-f', 'segment', '-segment_time', String(chunkSeconds),
      '-c:a', 'aac', '-b:a', '96k', '-ac', '1',
      pattern,
    ]);
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
  });

  const names = (await fs.readdir(dir))
    .filter(n => n.startsWith('chunk-') && n.endsWith('.m4a'))
    .sort();

  if (names.length === 0) throw new Error('Segmentation produced no chunks');

  // Offsets computed from real chunk durations so they stay exact even if
  // ffmpeg snaps cut points to frame boundaries.
  const chunks: AudioChunk[] = [];
  let cumulative = 0;
  for (const n of names) {
    const file = path.join(dir, n);
    const { durationSeconds } = await getMediaInfo(file);
    chunks.push({ file, offsetSeconds: cumulative });
    cumulative += durationSeconds;
  }

  log(`[SPLIT] ${chunks.length} chunks ready.`);
  return { chunks, dir };
}

export function shiftWords(words: any[], offsetSeconds: number): any[] {
  if (offsetSeconds === 0) return words;
  return words.map(w => ({
    ...w,
    start_offset: `${(parseFloat(w.start_offset) + offsetSeconds).toFixed(3)}s`,
    end_offset: `${(parseFloat(w.end_offset) + offsetSeconds).toFixed(3)}s`,
  }));
}
