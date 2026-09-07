'use client';
import { useState, useRef } from 'react';

export default function Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorder.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder.current = new MediaRecorder(stream);
        audioChunks.current = [];

        mediaRecorder.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.current.push(e.data);
        };

        mediaRecorder.current.onstop = async () => {
          const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
          await handleTranscribe(audioBlob);
        };

        mediaRecorder.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Error accessing microphone', err);
        alert('Could not access microphone');
      }
    }
  };

  const handleTranscribe = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.text) {
        setTranscript(prev => prev + '\n' + data.text);
      } else if (data.error) {
        console.error('Transcription error:', data.error);
        alert('Transcription failed: ' + data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0b0d] text-slate-300 font-sans overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0f1115]">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
          <h1 className="text-sm font-bold tracking-widest text-slate-100 uppercase">Gemini-3.5-Transcribe CLI</h1>
        </div>
        <div className="flex items-center space-x-6 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          <span>SDK: @google/genai v2.4.0</span>
          <span>API: Interactions V1 Beta</span>
          <span className="px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">Active Session</span>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-slate-800 bg-[#0d0e12] p-6 space-y-8">
          <div>
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Business Rules</h2>
            <ul className="space-y-4">
              <li className="space-y-1">
                <div className="text-xs text-slate-200">Mode: Smart</div>
                <div className="text-[10px] text-slate-500">No Timestamps/Diarization. Optimized for accuracy.</div>
              </li>
              <li className="space-y-1">
                <div className="text-xs text-slate-200">Mode: Verbatim</div>
                <div className="text-[10px] text-slate-500">Required for --timestamps word and --diarization.</div>
              </li>
              <li className="space-y-1">
                <div className="text-xs text-slate-400">Duration Limits</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px]">Standard:</span>
                  <span className="text-[10px] text-emerald-400">60m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px]">Enhanced:</span>
                  <span className="text-[10px] text-amber-400">30m</span>
                </div>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Active Config</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-xs py-1 border-b border-slate-800/50">
                <span className="text-slate-500">Concurrency</span>
                <span className="text-slate-100">2 slots</span>
              </div>
              <div className="flex justify-between text-xs py-1 border-b border-slate-800/50">
                <span className="text-slate-500">Output</span>
                <span className="text-slate-100">txt, json, srt</span>
              </div>
              <div className="flex justify-between text-xs py-1 border-b border-slate-800/50">
                <span className="text-slate-500">Recursive</span>
                <span className="text-emerald-400">Enabled</span>
              </div>
            </div>
          </div>
        </aside>
        <section className="flex-1 flex flex-col bg-[#050506]">
          <div className="flex-1 p-6 font-mono text-[13px] leading-relaxed overflow-hidden">
            <div className="text-slate-500 mb-2">$ transcribe ./recordings/q3-interviews --diarization --concurrency 2</div>
            <div className="text-emerald-400 mb-1">[INFO] Found 12 valid media files (wav, mp3, m4a)</div>
            <div className="text-slate-400 mb-1">[UPLOAD] interview_001.wav -&gt; Files API [Done]</div>
            <div className="text-slate-400 mb-1">[UPLOAD] interview_002.wav -&gt; Files API [Done]</div>
            <div className="text-blue-400 mb-1">[POLL] interview_001.wav: PROCESSING (Wait 2s...)</div>
            <div className="text-blue-400 mb-1">[POLL] interview_002.wav: PROCESSING (Wait 2s...)</div>
            <div className="text-slate-100 mt-4 border-l-2 border-slate-700 pl-4">
              <p className="text-slate-500">// interview_001.srt generated</p>
              <p className="text-slate-500">// Writing atomic update to filesystem...</p>
              <p className="text-emerald-500">[SUCCESS] interview_001.wav transcription finished.</p>
            </div>
            <div className="mt-4 text-amber-400/80 italic">
              [DEBUG] Verbatim mode enforced for diarization... <br/>
              [DEBUG] Speaker detection limited to 8 voices...
            </div>
            <div className="mt-4 flex items-start space-x-2 flex-col">
              <span className="text-slate-100">{transcript || <span className="animate-pulse">_</span>}</span>
              {isTranscribing && <span className="text-emerald-400 text-xs mt-2 animate-pulse">Transcribing via API...</span>}
            </div>
          </div>
          <div className="p-6 border-t border-slate-800 bg-[#0d0e12] flex items-center justify-between">
            <span className="text-xs text-slate-500">Live Microphone Input</span>
            <button
              onClick={toggleRecording}
              className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-colors ${
                isRecording 
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 hover:bg-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30'
              }`}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>
          <div className="h-48 border-t border-slate-800 bg-[#0d0e12] p-6">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Real-time Batch Queue</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-[#15171c] border border-slate-800 rounded">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold text-slate-200 truncate w-32">interview_002.wav</span>
                  <span className="text-[10px] text-blue-400 uppercase">Transcribing...</span>
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full w-[65%]"></div>
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                  <span>Step 4/5: Parsing Annotations</span>
                  <span>65%</span>
                </div>
              </div>
              <div className="p-3 bg-[#15171c] border border-slate-800 rounded">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold text-slate-200 truncate w-32">focus_group_A.mp3</span>
                  <span className="text-[10px] text-blue-400 uppercase">Polling...</span>
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full w-[20%]"></div>
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                  <span>Waiting for Files API</span>
                  <span>20%</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <aside className="w-64 border-l border-slate-800 bg-[#0d0e12] p-6">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Final Summary</h2>
          <div className="space-y-6">
            <div className="flex flex-col">
              <span className="text-2xl font-light text-slate-100">1 / 12</span>
              <span className="text-[10px] text-slate-500 uppercase">Processed Files</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center text-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
                <span className="text-slate-400 flex-1">Success</span>
                <span className="text-slate-200">1</span>
              </div>
              <div className="flex items-center text-xs">
                <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
                <span className="text-slate-400 flex-1">Pending</span>
                <span className="text-slate-200">11</span>
              </div>
              <div className="flex items-center text-xs">
                <div className="w-2 h-2 rounded-full bg-rose-500 mr-2"></div>
                <span className="text-slate-400 flex-1">Failed</span>
                <span className="text-slate-200">0</span>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-800">
              <div className="text-[10px] text-slate-500 mb-2">SYSTEM HEALTH</div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">RAM usage</span>
                <span className="text-[10px] text-slate-200 font-mono">142MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Latency</span>
                <span className="text-[10px] text-slate-200 font-mono">4.2s</span>
              </div>
            </div>
          </div>
        </aside>
      </main>
      <footer className="px-6 py-2 border-t border-slate-800 bg-[#0f1115] flex items-center justify-between">
        <div className="text-[10px] text-slate-500">GEMINI_API_KEY detected via Environment Variable</div>
        <div className="flex space-x-4">
          <span className="text-[10px] text-emerald-500">--verbose: on</span>
          <span className="text-[10px] text-slate-600">--dry-run: off</span>
        </div>
      </footer>
    </div>
  );
}
