import fs from 'fs/promises';

export async function saveTxt(outPath: string, text: string) {
  await fs.writeFile(outPath, text, 'utf-8');
}

export async function saveJson(outPath: string, data: any) {
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
}

function formatSrtTime(secondsStr: string): string {
  const totalSeconds = parseFloat(secondsStr);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00:00,000';
  const date = new Date(0);
  date.setMilliseconds(totalSeconds * 1000);
  const iso = date.toISOString(); // 1970-01-01T00:00:00.000Z
  const time = iso.substring(11, 23); // 00:00:00.000
  return time.replace('.', ',');
}

export async function saveSrt(outPath: string, words: any[]) {
  let srtContent = '';
  let index = 1;
  
  let currentCue: any[] = [];
  
  const flushCue = () => {
    if (currentCue.length === 0) return;
    const start = formatSrtTime(currentCue[0].start_offset);
    const end = formatSrtTime(currentCue[currentCue.length - 1].end_offset);
    const speaker = currentCue[0].speaker ? `[${currentCue[0].speaker}] ` : '';
    const text = currentCue.map(w => w.text).join(' ');
    
    srtContent += `${index}\n${start} --> ${end}\n${speaker}${text}\n\n`;
    index++;
    currentCue = [];
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (currentCue.length > 0) {
      const prevWord = currentCue[currentCue.length - 1];
      const speakerChanged = prevWord.speaker !== word.speaker;
      const pause = parseFloat(word.start_offset) - parseFloat(prevWord.end_offset);
      
      // Grouping rules: split on speaker change, pause > 1s, or length >= 12 words
      if (speakerChanged || pause > 1.0 || currentCue.length >= 12) {
        flushCue();
      }
    }
    currentCue.push(word);
  }
  flushCue();
  
  await fs.writeFile(outPath, srtContent, 'utf-8');
}
