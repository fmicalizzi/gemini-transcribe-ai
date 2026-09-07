import { GoogleGenAI } from '@google/genai';
import { getMediaInfo } from './media.js';
import { sleep, withRetry } from './util/retry.js';
import { saveTxt, saveJson, saveSrt } from './formatters.js';
import { chunkAudio, shiftWords } from './chunker.js';
import fs from 'fs/promises';
import path from 'path';

let _ai: GoogleGenAI | undefined;
function getAi() {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _ai;
}

export interface TranscribeOptions {
  out?: string;
  mode: 'smart' | 'verbatim';
  lang?: string;
  diarization: boolean;
  timestamps?: string;
  vocab?: string;
  formats: string[];
  verbose: boolean;
  splitMinutes?: number;
}

function durationLimit(opts: TranscribeOptions): number {
  return (opts.diarization || opts.timestamps === 'word') ? 1800 : 3600;
}

const MIME_BY_EXT: Record<string, string> = {
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
};

function mimeFor(filePath: string): string | undefined {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()];
}

async function transcribeOne(filePath: string, opts: TranscribeOptions, log: (msg: string) => void): Promise<{ text: string; words: any[] }> {
  log(`[UPLOAD] Uploading ${filePath}...`);
  const mimeType = mimeFor(filePath);
  const uploadedFile = await withRetry(() => getAi().files.upload({ file: filePath, ...(mimeType ? { config: { mimeType } } : {}) }));
  log(`[UPLOAD] Done. URI: ${uploadedFile.uri}`);

  try {
    let fileState = uploadedFile.state;
    while (fileState === 'PROCESSING') {
      log(`[POLL] ${uploadedFile.name} PROCESSING, waiting 5s...`);
      await sleep(5000);
      const check = await withRetry(() => getAi().files.get({ name: uploadedFile.name! }));
      fileState = check.state;
    }

    if (fileState === 'FAILED') {
      throw new Error(`File processing failed on server for ${uploadedFile.name}`);
    }

    log(`[API] Creating interaction for ${filePath}...`);

    let transcription_config: any = {};
    if (opts.mode === 'verbatim') {
      transcription_config.mode = { type: 'verbatim' };
      if (opts.diarization) transcription_config.mode.diarization_mode = 'speaker';
      if (opts.timestamps === 'word') transcription_config.mode.timestamp_granularities = ['word'];
    } else {
      transcription_config.mode = 'smart';
    }

    if (opts.lang) {
      transcription_config.language_codes = opts.lang.split(',').map(l => l.trim());
    }

    if (opts.vocab) {
      transcription_config.custom_vocabulary = opts.vocab.split(',').map(v => v.trim());
    }

    const interaction = (await withRetry(() => getAi().interactions.create({
      model: 'gemini-3.5-transcribe',
      generation_config: {
        transcription_config
      },
      input: [
        { type: 'audio', uri: uploadedFile.uri!, mime_type: (uploadedFile as any).mime_type || (uploadedFile as any).mimeType } as any
      ]
    }))) as any;

    log(`[API] Interaction complete.`);

    const text = interaction.output_text || '';
    const words: any[] = [];

    if (interaction.steps) {
      for (const step of interaction.steps) {
        if (step.type === 'model_output' && step.content) {
          for (const content of step.content) {
            if (content.type === 'text' && content.annotations) {
              for (const annotation of content.annotations) {
                if (annotation.type === 'word_info') {
                  words.push(annotation);
                }
              }
            }
          }
        }
      }
    }

    return { text, words };

  } finally {
    log(`[CLEANUP] Deleting ${uploadedFile.name}...`);
    await getAi().files.delete({ name: uploadedFile.name! }).catch(e => log(`Warning: Failed to delete ${uploadedFile.name}`));
  }
}

async function saveOutputs(basePath: string, text: string, words: any[], opts: TranscribeOptions, log: (msg: string) => void) {
  const outDir = opts.out || path.dirname(basePath);
  await fs.mkdir(outDir, { recursive: true });
  const baseName = path.basename(basePath, path.extname(basePath));

  for (const fmt of opts.formats) {
    const outPath = path.join(outDir, `${baseName}.${fmt}`);
    const tempPath = outPath + '.tmp';
    if (fmt === 'txt') {
      await saveTxt(tempPath, text);
    } else if (fmt === 'json') {
      await saveJson(tempPath, words);
    } else if (fmt === 'srt') {
      await saveSrt(tempPath, words);
    }
    await fs.rename(tempPath, outPath);
    log(`[SUCCESS] Wrote ${outPath}`);
  }
}

export async function transcribeFile(filePath: string, opts: TranscribeOptions) {
  const log = (msg: string) => { if (opts.verbose) console.log(msg); };

  log(`[INFO] Analyzing ${filePath}...`);
  const { durationSeconds } = await getMediaInfo(filePath);

  const limit = durationLimit(opts);
  if (durationSeconds <= limit) {
    const { text, words } = await transcribeOne(filePath, opts, log);
    await saveOutputs(filePath, text, words, opts, log);
    return;
  }

  // Long file: split into chunks, transcribe sequentially, merge results.
  const splitMinutes = opts.splitMinutes ?? 55;
  const chunkSeconds = Math.min(splitMinutes * 60, limit);
  console.log(`[SPLIT] ${path.basename(filePath)} (${Math.round(durationSeconds / 60)}min) exceeds ${Math.round(limit / 60)}min limit. Splitting into ${Math.round(chunkSeconds / 60)}min chunks.`);
  if (opts.diarization) {
    console.warn(`[SPLIT] Warning: with --diarization, speaker labels are per-chunk and may not match across chunks.`);
  }

  const { chunks, dir } = await chunkAudio(filePath, chunkSeconds, log);

  try {
    const texts: string[] = [];
    const allWords: any[] = [];
    let done = 0;

    for (const chunk of chunks) {
      const { text, words } = await transcribeOne(chunk.file, opts, log);
      if (text.trim()) texts.push(text.trim());
      allWords.push(...shiftWords(words, chunk.offsetSeconds));
      done++;
      console.log(`[SPLIT] ${path.basename(filePath)}: chunk ${done}/${chunks.length} transcribed`);
    }

    await saveOutputs(filePath, texts.join(' '), allWords, opts, log);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    log(`[SPLIT] Removed temp dir ${dir}`);
  }
}
