# gemini-transcribe-cli

Batch audio transcription for the command line, built on Google's **`gemini-3.5-transcribe`** model (Interactions API + Files API).

Point it at a file or a whole folder of audio and get clean text, SRT subtitles and word-level JSON — with speaker diarization, custom vocabulary, parallel processing and **automatic chunking for files longer than the API limits**.

```bash
transcribe ./podcasts --diarization --formats txt,srt,json -v
```

## Features

- **Batch + concurrency** — process whole directories (optionally recursive) with a parallel worker queue.
- **Automatic chunking (ffmpeg)** — files over the API duration limit are split, transcribed chunk by chunk and merged back with correct absolute timings. No more "too long" errors on a 3h meeting.
- **Speaker diarization** — `[Speaker 1]`-style labels in `.srt`, per-word in `.json` (verbatim mode).
- **Word-level timestamps** — drives the `.srt` builder and `.json` annotations.
- **Three output formats** — `.txt` (plain text), `.srt` (grouped subtitle cues), `.json` (raw word annotations).
- **Smart / verbatim modes** — smart removes disfluencies and formats paragraphs; verbatim keeps every "uh" exactly as spoken.
- **Custom vocabulary** — bias recognition for product names, jargon, people's names.
- **Robust by default** — retries with exponential backoff on 429/5xx, polling of long-running uploads, atomic writes (`.tmp` + rename), server-side file cleanup.

## Requirements

| | |
| :--- | :--- |
| Node.js | ≥ 18 |
| ffmpeg | on `PATH` (only needed for files that exceed the duration limits) |
| Gemini API key | from [AI Studio](https://aistudio.google.com/apikey) |

## Install

```bash
git clone https://github.com/fmicalizzi/gemini-transcribe-ai
cd gemini-transcribe-ai
npm install
npm run build
npm install -g .        # optional: makes `transcribe` available everywhere
```

Then set your key in `.env` (copy from `.env.example`):

```bash
cp .env.example .env    # edit and paste your GEMINI_API_KEY
```

> **Note on `.env` location:** the CLI always loads `.env` from the project root, even when run as a global command from another folder. If you installed from GitHub with `npm i -g github:fmicalizzi/gemini-transcribe-ai`, export `GEMINI_API_KEY` in your shell instead.

## Usage

```
transcribe <input-file-or-directory> [options]
```

| Option | Description | Default |
| :--- | :--- | :--- |
| `-o, --out <dir>` | Output directory | next to each input |
| `-m, --mode <mode>` | `smart` \| `verbatim` | `smart` |
| `-l, --lang <codes>` | Comma-separated language codes (e.g. `es,en`) | auto-detect |
| `--diarization` | Speaker identification (forces `verbatim` + word timestamps) | off |
| `--timestamps <gran>` | `word` (forces `verbatim`) | off |
| `--vocab <list>` | Custom vocabulary hints | — |
| `--formats <lista>` | Any of `txt,json,srt` | `txt,srt` |
| `--split-minutes <n>` | Chunk length for over-limit files | `55` |
| `-c, --concurrency <n>` | Files processed in parallel | `2` |
| `--recursive` | Recurse into subdirectories | off |
| `--dry-run` | List what would be processed, no API calls | off |
| `--stats` | Print history summary (runs, calls, hours) and exit | — |
| `-v, --verbose` | Per-step logs (upload, polling, chunks, cleanup) | off |

Supported inputs: `.mp3 .wav .m4a .aac .flac .ogg .webm`

### Examples

```bash
# clean up a folder of WhatsApp voice notes
transcribe ./notes -l es

# full transcript of a long meeting, with speakers and subtitles
transcribe ./reuniones --diarization --formats txt,srt,json -v

# podcast episode longer than the API limit → automatic chunks
transcribe 3-hour-podcast.m4a -o ./out --split-minutes 50

# check a batch (and its chunking) before spending credits
transcribe ./recordings --recursive --dry-run

# domain jargon: force correct spelling of product/people names
transcribe standup.m4a --vocab "Jahz,Yaahhub,Toscano,Ubiquiti"
```

## Modes & API rules

`gemini-3.5-transcribe` enforces these constraints; the CLI adapts or refuses **before** spending any credit:

| Feature | `smart` | `verbatim` |
| :--- | :--- | :--- |
| Diarization (`--diarization`) | ❌ | ✅ |
| Word timestamps (`--timestamps word`) | ❌ | ✅ |
| Custom vocabulary (`--vocab`) | ❌ | ✅ |

**Duration limits per API call:**
- Standard (no diarization / no word timestamps): **1 hour**
- Enhanced (diarization or word timestamps): **30 minutes**

### Chunking

Files over the limit are split with ffmpeg into mono AAC segments of `--split-minutes` (capped to the applicable limit, so 30min in enhanced mode), uploaded and transcribed one at a time, then merged:

- `.txt` — chunk texts joined sequentially.
- `.srt` / `.json` — word offsets shifted by each chunk's real duration, so timings stay absolute across the whole file.
- Temp chunks are deleted when done (local and remote).

**Caveat:** speaker labels are computed *per chunk* — "Speaker 1" in chunk A may be a different person in chunk B.

Note that `.srt`/`.json` output and `--diarization` require word timestamps; the CLI forces them (and `verbatim` mode) automatically with a warning.

## How it works

```
analyze (music-metadata) ──► [over limit? ffmpeg split]
        │
        ▼  per file/chunk
upload to Files API ──► poll until ACTIVE ──► Interactions API
                                                     │  word_info annotations
                                                     ▼
                                        merge ──► atomic write .txt/.srt/.json
                                                     │
                                                     ▼
                                          delete remote file + temp chunks
```

## History & usage stats

Every run appends records to `logs/history.jsonl` **in the project root** (never committed; git-ignored): per file — duration, mode, chunks, API calls, output paths, wall time — and per run — options and totals.

```bash
transcribe --stats   # totals: runs, files, API calls, audio hours, failures, monthly breakdown
```

`--dry-run` and `--stats` never touch the API.

## Cost & privacy notes

- Transcription is billed by your Google plan for **every API call** — a 2h file in enhanced mode = 4 chunks = 4 billed calls. Use `--dry-run` first.
- Audio is uploaded to Google's Files API and **deleted after each transcription** (including on failure paths). Don't use this for content you can't send to Google.
- `.env` (your API key) is git-ignored; the CLI only ever reads it locally.

## Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| `GEMINI_API_KEY environment variable is missing` | Create `.env` in the project root or `export` the key |
| `Can not determine mimeType` | Update to ≥1.0.0 (explicit MIME map for `.m4a` etc.) |
| `.srt` empty on old versions | Re-run; word timestamps are now forced automatically |
| `ffmpeg exited with code …` | Install ffmpeg (`brew install ffmpeg`) or shorten the file |
| HTTP 429 / 500 spam | Handled with 3 exponential-backoff retries; lower `-c` if it persists |

## Development

```bash
npm run build      # tsc → dist/
npm run typecheck  # noEmit
npm run start      # run without installing globally
```

Source layout: `src/cli.ts` (flags/validation) · `src/transcriber.ts` (API flow) · `src/chunker.ts` (split/merge) · `src/formatters.ts` (txt/srt/json writers) · `src/history.ts` (JSONL history/stats) · `src/util/retry.ts`.

## License

MIT — see [LICENSE](LICENSE).
