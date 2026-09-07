# Gemini-3.5-Transcribe CLI

A powerful, robust command-line application in Node.js/TypeScript for batch audio transcription using Google's `gemini-3.5-transcribe` model and the new Interactions API.

## Features
- **Batch Processing**: Process entire directories of media files in parallel with controlled concurrency.
- **Robust Retries**: Built-in exponential backoff for network issues and API rate limits (HTTP 429/500/503).
- **Multiple Formats**: Outputs plain text (`.txt`), raw JSON with annotations (`.json`), and parsed SubRip subtitles (`.srt`).
- **Diarization & Timestamps**: Supports speaker identification and word-level timestamps (requires `verbatim` mode).
- **Smart Formatting**: Default `smart` mode provides disfluency removal and clean formatting.

## Installation

Ensure you have Node.js 18+ installed.

1. Clone or download this project.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the CLI:
   ```bash
   npm run build:cli
   ```
4. Install globally (optional):
   ```bash
   npm install -g .
   ```

## Configuration

The CLI requires a Gemini API key. You can provide it via an environment variable:

```bash
export GEMINI_API_KEY="your_api_key_here"
```
Or place it in a `.env` file in the directory where you run the command.

## Usage

```bash
transcribe <input-file-or-directory> [options]
```

### Examples

**Transcribe a single file (Smart mode by default):**
```bash
transcribe ./interview.mp3
```

**Transcribe a folder of files to SRT with Speaker Diarization:**
```bash
transcribe ./recordings --diarization --formats srt --out ./transcripts
```

**Transcribe in parallel with custom language and word timestamps:**
```bash
transcribe ./lectures -c 4 --timestamps word -l en,es --formats txt,json
```

## Model Business Rules & Incompatibilities

The `gemini-3.5-transcribe` model enforces the following constraints. The CLI validates these *before* making any API calls:

| Feature | `smart` Mode | `verbatim` Mode |
| :--- | :--- | :--- |
| **Diarization** (`--diarization`) | ❌ Incompatible | ✅ Supported |
| **Word Timestamps** (`--timestamps word`) | ❌ Incompatible | ✅ Supported |
| **Custom Vocabulary** (`--vocab`) | ❌ Incompatible | ✅ Supported |

**Duration Limits:**
- Unary mode (no diarization or timestamps): **1 hour**
- Enhanced mode (diarization or word-timestamps): **30 minutes**

Files exceeding these limits will be skipped with an error message to avoid failed API interactions.

## Output Generation

The CLI safely writes output to temporary files (`*.tmp`) and renames them upon completion to ensure atomic filesystem writes and avoid corrupt, half-written transcriptions.
