import { GoogleGenAI } from '@google/genai';
import { getMediaInfo } from './media.js';
import { sleep, withRetry } from './util/retry.js';
import { saveTxt, saveJson, saveSrt } from './formatters.js';
import path from 'path';
import fs from 'fs/promises';

const ai = new GoogleGenAI();

export interface TranscribeOptions {
  out?: string;
  mode: 'smart' | 'verbatim';
  lang?: string;
  diarization: boolean;
  timestamps?: string;
  vocab?: string;
  formats: string[];
  verbose: boolean;
}

export async function transcribeFile(filePath: string, opts: TranscribeOptions) {
  const log = (msg: string) => { if (opts.verbose) console.log(msg); };
  
  log(`[INFO] Analyzing ${filePath}...`);
  const { durationSeconds } = await getMediaInfo(filePath);
  
  const limit = (opts.diarization || opts.timestamps === 'word') ? 1800 : 3600;
  if (durationSeconds > limit) {
    throw new Error(`File duration (${durationSeconds}s) exceeds limit of ${limit}s for current settings.`);
  }

  log(`[UPLOAD] Uploading ${filePath}...`);
  const uploadedFile = await withRetry(() => ai.files.upload({ file: filePath }));
  log(`[UPLOAD] Done. URI: ${uploadedFile.uri}`);

  try {
    let fileState = uploadedFile.state;
    while (fileState === 'PROCESSING') {
      log(`[POLL] ${uploadedFile.name} PROCESSING, waiting 5s...`);
      await sleep(5000);
      const check = await withRetry(() => ai.files.get({ name: uploadedFile.name! }));
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

    const interaction = (await withRetry(() => ai.interactions.create({
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

    const outDir = opts.out || path.dirname(filePath);
    await fs.mkdir(outDir, { recursive: true });
    
    const baseName = path.basename(filePath, path.extname(filePath));
    
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
    
  } finally {
    log(`[CLEANUP] Deleting ${uploadedFile.name}...`);
    await ai.files.delete({ name: uploadedFile.name! }).catch(e => log(`Warning: Failed to delete ${uploadedFile.name}`));
  }
}
