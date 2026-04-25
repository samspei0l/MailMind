'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Square } from 'lucide-react';

// Minimal Web Speech API typings (the DOM lib doesn't ship them).
interface SpeechRecognitionAlt { transcript: string }
interface SpeechRecognitionRes { 0: SpeechRecognitionAlt; isFinal: boolean; length: number }
interface SpeechRecognitionEventLike { resultIndex: number; results: ArrayLike<SpeechRecognitionRes> }
interface SpeechRecognitionErrorEventLike { error: string }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  }
}

interface Props {
  onTranscript: (transcript: string) => void;
  /** Kept for backward compatibility with existing callers. Unused — the recogniser
   *  runs in the browser and doesn't need to know which inbox the email goes from. */
  fromConnectionId?: string;
  disabled?: boolean;
}

type RecState = 'idle' | 'recording' | 'error';

export default function VoiceRecorder({ onTranscript, disabled = false }: Props) {
  const [state, setState] = useState<RecState>('idle');
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(0);
  const [interimText, setInterimText] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef<string>('');
  const interimRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const erroredRef = useRef<boolean>(false);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startRecording = useCallback(() => {
    setError('');
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('Voice input needs a Chromium-based browser (Chrome, Edge, Brave, Arc).');
      setState('error');
      return;
    }
    try {
      const recognition = new SR();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = true;
      finalTranscriptRef.current = '';
      interimRef.current = '';
      erroredRef.current = false;

      recognition.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalTranscriptRef.current += r[0].transcript;
          else interim += r[0].transcript;
        }
        interimRef.current = interim;
        setInterimText(interim);
      };
      recognition.onerror = (ev) => {
        if (ev.error === 'aborted') return;
        erroredRef.current = true;
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setError('Microphone permission denied. Allow access in browser settings.');
        } else if (ev.error === 'no-speech') {
          setError("Didn't catch anything — try again.");
        } else {
          setError(`Voice input error: ${ev.error}`);
        }
      };
      recognition.onend = () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        const transcript = `${finalTranscriptRef.current} ${interimRef.current}`.replace(/\s+/g, ' ').trim();
        recognitionRef.current = null;
        setInterimText('');
        if (transcript) {
          onTranscript(transcript);
          setState('idle');
        } else {
          setState(erroredRef.current ? 'error' : 'idle');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setState('recording');
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);

      // Hard cap at 2 minutes to mirror the old recorder's safety stop.
      setTimeout(() => {
        if (recognitionRef.current === recognition) stopRecording();
      }, 120_000);
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  }, [onTranscript, stopRecording]);

  function formatDuration(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={stopRecording}
          className="w-8 h-8 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
          title="Stop recording"
        >
          <Square className="w-3 h-3 text-white fill-white" />
        </button>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-mono text-red-500 tabular-nums">{formatDuration(duration)}</span>
        </span>
        <span className="text-xs text-muted-foreground truncate max-w-[260px]">
          {interimText ? `"${interimText}"` : 'Listening… click ■ to stop'}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled}
        title="Click to dictate. Speech recognition runs in your browser — no audio is uploaded."
        className="flex items-center gap-2 text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-muted/50 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
      >
        <Mic className="w-4 h-4 group-hover:text-primary transition-colors" />
        Voice input
      </button>
      {error && (
        <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
          <MicOff className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}
