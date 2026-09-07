import fs from 'fs';
import path from 'path';

export interface FileRecord {
  t: string;
  type: 'file';
  file: string;
  durationMin: number;
  mode: string;
  diarization: boolean;
  calls: number;
  chunks: number;
  outputs: string[];
  tookSec: number;
  error?: string;
}

export interface RunRecord {
  t: string;
  type: 'run';
  input: string;
  options: Record<string, unknown>;
  files: number;
  ok: number;
  failed: number;
  calls: number;
  minutes: number;
  tookSec: number;
}

export type HistoryRecord = FileRecord | RunRecord;

let logsDir = path.resolve(process.cwd(), 'logs');

export function initHistory(root: string) {
  logsDir = path.join(root, 'logs');
}

export function historyPath(): string {
  return path.join(logsDir, 'history.jsonl');
}

export function appendHistory(rec: HistoryRecord) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(historyPath(), JSON.stringify(rec) + '\n', 'utf-8');
  } catch {
    // history is best-effort; never fail a transcription over logging
  }
}

export function readHistory(): HistoryRecord[] {
  try {
    return fs.readFileSync(historyPath(), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean) as HistoryRecord[];
  } catch {
    return [];
  }
}

export function printStats() {
  const records = readHistory();
  const runs = records.filter(r => r.type === 'run') as RunRecord[];
  const files = records.filter(r => r.type === 'file') as FileRecord[];

  if (files.length === 0 && runs.length === 0) {
    console.log(`No history yet. Records are written to ${historyPath()} as you transcribe.`);
    return;
  }

  const totals = runs.length ? runs.reduce((a, r) => ({
    files: a.files + r.files,
    ok: a.ok + r.ok,
    failed: a.failed + r.failed,
    calls: a.calls + r.calls,
    minutes: a.minutes + r.minutes,
  }), { files: 0, ok: 0, failed: 0, calls: 0, minutes: 0 }) : {
    files: files.length,
    ok: files.filter(f => !f.error).length,
    failed: files.filter(f => f.error).length,
    calls: files.reduce((a, f) => a + f.calls, 0),
    minutes: files.reduce((a, f) => a + f.durationMin, 0),
  };

  console.log('--- Transcription history ---');
  console.log(`History file : ${historyPath()}`);
  console.log(`Runs         : ${runs.length}`);
  console.log(`Files        : ${totals.files} (${totals.ok} ok / ${totals.failed} failed)`);
  console.log(`API calls    : ${totals.calls}`);
  console.log(`Audio hours  : ${(totals.minutes / 60).toFixed(2)}h`);

  const byMonth = new Map<string, { minutes: number; calls: number; files: number }>();
  for (const r of runs) {
    const key = r.t.slice(0, 7);
    const m = byMonth.get(key) ?? { minutes: 0, calls: 0, files: 0 };
    m.minutes += r.minutes;
    m.calls += r.calls;
    m.files += r.files;
    byMonth.set(key, m);
  }
  if (byMonth.size > 1) {
    console.log('\nBy month:');
    for (const [month, m] of [...byMonth.entries()].sort()) {
      console.log(`  ${month}  ${m.files} files  ${(m.minutes / 60).toFixed(2)}h  ${m.calls} calls`);
    }
  }

  const failures = files.filter(f => f.error);
  if (failures.length) {
    console.log(`\nFailed files (${failures.length}):`);
    for (const f of failures.slice(-10)) {
      console.log(`  ${f.t}  ${path.basename(f.file)}  — ${f.error}`);
    }
  }
}
