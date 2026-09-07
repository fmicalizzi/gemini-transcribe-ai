#!/usr/bin/env node
import dotenv from 'dotenv';
import { Command } from 'commander';
import { transcribeFile, TranscribeOptions } from './transcriber.js';
import fs from 'fs/promises';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const program = new Command();

program
  .name('transcribe')
  .description('Batch transcription CLI using Gemini 3.5 Transcribe')
  .argument('<input>', 'Input file or directory')
  .option('-o, --out <dir>', 'Output directory (default: same as input)')
  .option('-m, --mode <mode>', 'smart | verbatim', 'smart')
  .option('-l, --lang <codes>', 'Comma-separated language codes')
  .option('--diarization', 'Enable speaker identification (forces verbatim)')
  .option('--timestamps <gran>', 'e.g., word (forces verbatim)')
  .option('--vocab <list>', 'Comma-separated custom vocabulary')
  .option('--formats <lista>', 'Output formats (txt,json,srt)', 'txt,srt')
  .option('--split-minutes <n>', 'Chunk length (min) for files over the API limit', '55')
  .option('-c, --concurrency <n>', 'Parallel files', '2')
  .option('--recursive', 'Recurse into subdirectories')
  .option('--dry-run', 'List what would be processed')
  .option('-v, --verbose', 'Detailed logs');

program.parse();

const options = program.opts();
const inputPath = program.args[0];

async function getFiles(dir: string, recursive: boolean): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...await getFiles(fullPath, recursive));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable is missing.');
    process.exit(1);
  }

  const formats = options.formats.split(',').map((s: string) => s.trim());

  if ((options.diarization || formats.includes('srt') || formats.includes('json')) && options.timestamps !== 'word') {
    console.warn('Warning: srt/json output and --diarization require word-level timestamps. Forcing --timestamps word.');
    options.timestamps = 'word';
  }

  // Validations
  const modeExplicit = program.getOptionValueSource('mode') === 'cli';
  if (options.mode === 'smart' && modeExplicit) {
    if (options.timestamps === 'word' || options.diarization) {
      console.error("Error: 'smart' mode is incompatible with --timestamps/--diarization or with srt/json outputs.");
      process.exit(1);
    }
    if (options.vocab) {
      console.error("Error: 'smart' mode is incompatible with --vocab.");
      process.exit(1);
    }
  }
  if (options.diarization || options.timestamps === 'word') {
    if (options.mode !== 'verbatim') {
      console.warn("Warning: --diarization or --timestamps used. Forcing mode to 'verbatim'.");
      options.mode = 'verbatim';
    }
  }

  const transcribeOpts: TranscribeOptions = {
    out: options.out,
    mode: options.mode as 'smart' | 'verbatim',
    lang: options.lang,
    diarization: !!options.diarization,
    timestamps: options.timestamps,
    vocab: options.vocab,
    formats,
    verbose: !!options.verbose,
    splitMinutes: parseInt(options.splitMinutes, 10),
  };

  const stat = await fs.stat(inputPath);
  let targetFiles: string[] = [];
  
  if (stat.isDirectory()) {
    const allFiles = await getFiles(inputPath, !!options.recursive);
    targetFiles = allFiles.filter(f => /\.(wav|mp3|aac|flac|ogg|webm|m4a)$/i.test(f));
  } else {
    targetFiles = [inputPath];
  }

  if (options.dryRun) {
    console.log(`[DRY RUN] Would process ${targetFiles.length} files:`);
    targetFiles.forEach(f => console.log(`  - ${f}`));
    return;
  }

  console.log(`Starting transcription for ${targetFiles.length} files with concurrency ${options.concurrency}...`);
  
  let success = 0;
  let failed = 0;
  const concurrencyLimit = parseInt(options.concurrency, 10);
  
  // Simple concurrency queue
  let i = 0;
  async function worker() {
    while (i < targetFiles.length) {
      const file = targetFiles[i++];
      console.log(`[START] ${file} (${i}/${targetFiles.length})`);
      try {
        await transcribeFile(file, transcribeOpts);
        success++;
      } catch (err: any) {
        console.error(`[ERROR] Failed to transcribe ${file}: ${err.message}`);
        failed++;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrencyLimit, targetFiles.length) }, () => worker());
  await Promise.all(workers);

  console.log(`\n--- Summary ---`);
  console.log(`Total: ${targetFiles.length}`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
