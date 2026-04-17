'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Square, Loader2 } from 'lucide-react';

interface Props {
  onTranscript: (transcript: string) => void;
  fromConnectionId: string;
  disabled?: boolean;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing' | 'error';

export default function VoiceRecorder({ onTranscript, fromConnectionId, disabled = false }: Props) {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array(20).fill(2));

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Clean up on unmount
  useEffect(() => () => {
    stopRecording();
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  function startWaveformAnimation(stream: MediaStream) {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    function draw() {
      analyser.getByteFrequencyData(data);
      const bars = Array.from({ length: 20 }, (_, i) => {
        const idx = Math.floor((i / 20) * data.length);
        return Math.max(2, (data[idx] / 255) * 32);
      });
      setWaveform(bars);
      animFrameRef.current = requestAnimationFrame(draw);
    }
    draw();
  }

  const startRecording = useCallback(async () => {
    setError('');
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks.current = [];

      // Prefer webm/opus, fallback to any supported type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setWaveform(Array(20).fill(2));

        if (audioChunks.current.length === 0) {
          setState('idle');
          return;
        }

        setState('processing');
        const audioBlob = new Blob(audioChunks.current, { type: mimeType });

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          formData.append('from_connection_id', fromConnectionId);
          formData.append('send_immediately', 'false');

          const res = await fetch('/api/voice', { method: 'POST', body: formData });
          const data = await res.json();

          if (data.error) {
            setError(data.error);
            setState('error');
          } else if (data.compose_result) {
            // Pass the transcript back through compose result's prompt
            onTranscript(data.compose_result.body);
            setState('idle');
          }
        } catch (err) {
          setError('Voice processing failed. Please try again.');
          setState('error');
        }
      };

      startWaveformAnimation(stream);
      recorder.start(250); // Collect data every 250ms
      setState('recording');

      // Start timer
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);

      // Auto-stop after 2 minutes
      setTimeout(() => {
        if (mediaRecorder.current?.state === 'recording') stopRecording();
      }, 120_000);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('Permission')) {
        setError('Microphone permission denied. Please allow access in browser settings.');
      } else {
        setError('Could not access microphone. Please check your device.');
      }
      setState('error');
    }
  }, [fromConnectionId, onTranscript]);

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
    }
  }

  function formatDuration(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  if (state === 'processing') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span>Transcribing your voice...</span>
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={stopRecording}
          className="w-8 h-8 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
          title="Stop recording"
        >
          <Square className="w-3 h-3 text-white fill-white" />
        </button>
        {/* Waveform */}
        <div className="flex items-center gap-0.5 h-8">
          {waveform.map((h, i) => (
            <div
              key={i}
              className="w-1 bg-red-500 rounded-full transition-all duration-75"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <span className="text-sm font-mono text-red-500 tabular-nums">{formatDuration(duration)}</span>
        <span className="text-xs text-muted-foreground">Recording... click ■ to stop</span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled || !fromConnectionId}
        title="Click to record a voice message — it will be automatically converted to a professional email"
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
