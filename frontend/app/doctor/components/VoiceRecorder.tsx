"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioUpload } from "./AudioUpload";

export type VoiceRecorderProps = {
  /** Called when the doctor presses Send with the recorded blob. */
  onSend: (blob: Blob, filename: string) => void | Promise<void>;
  /** When the doctor chooses the unsupported-browser fallback to upload. */
  onUploadFallback?: (file: File) => void | Promise<void>;
  /** Disable all interaction. */
  disabled?: boolean;
  /** True while the parent is uploading — drives the Send button label. */
  busy?: boolean;
};

type Phase = "idle" | "recording" | "review";

const BAR_COUNT = 5;

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function supportsLiveRecording(): boolean {
  if (typeof navigator === "undefined") return false;
  const md = navigator.mediaDevices;
  return !!md && typeof md.getUserMedia === "function";
}

export function VoiceRecorder({ onSend, onUploadFallback, disabled = false, busy = false }: VoiceRecorderProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [permDenied, setPermDenied] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: BAR_COUNT }, () => 0.1));
  const [supported, setSupported] = useState<boolean>(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  // Mirror of the objectUrl state so the unmount cleanup can revoke the
  // latest blob URL without re-subscribing the cleanup effect.
  const objectUrlRef = useRef<string | null>(null);

  // Decide capability on mount. If unsupported, we render <AudioUpload/> inline.
  useEffect(() => {
    setSupported(supportsLiveRecording());
  }, []);

  const cleanupStream = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      // Don't await — best-effort close.
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Unmount / page-leave safety: stop the recorder and release mic.
  useEffect(() => {
    return () => {
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        /* noop */
      }
      recorderRef.current = null;
      cleanupStream();
      // Read the latest URL from the ref — the state value captured at mount
      // is always null here, which would leak any recorded blob URL.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [cleanupStream]);

  const startVisualizer = useCallback((stream: MediaStream) => {
    const W = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx: typeof AudioContext | undefined = window.AudioContext ?? W.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    src.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const step = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(buf);
      // Split spectrum into BAR_COUNT equal slices; average magnitude per slice.
      const slice = Math.floor(buf.length / BAR_COUNT);
      const next: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < slice; j++) sum += buf[i * slice + j];
        const avg = sum / slice / 255; // 0..1
        // Floor so idle input still shows a faint pulse.
        next.push(Math.max(0.08, Math.min(1, avg * 1.4)));
      }
      setLevels(next);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const onStart = useCallback(async () => {
    if (disabled || phase === "recording") return;
    setStartErr(null);
    setPermDenied(false);
    if (!supportsLiveRecording()) {
      setSupported(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const b = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        // Revoke any old URL before creating a new one.
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          const next = URL.createObjectURL(b);
          objectUrlRef.current = next;
          return next;
        });
        setBlob(b);
        setPhase("review");
        cleanupStream();
      };

      startedAtRef.current = Date.now();
      setElapsed(0);
      tickRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);

      startVisualizer(stream);
      rec.start();
      setPhase("recording");
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermDenied(true);
      } else {
        setStartErr((e as Error).message || "Could not start recording");
      }
      cleanupStream();
    }
  }, [cleanupStream, disabled, phase, startVisualizer]);

  const onStop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
  }, []);

  const onRerecord = useCallback(() => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    objectUrlRef.current = null;
    setObjectUrl(null);
    setBlob(null);
    setElapsed(0);
    setPhase("idle");
  }, [objectUrl]);

  async function handleSend() {
    if (!blob || disabled || busy) return;
    const ext = (blob.type && blob.type.includes("ogg")) ? "ogg"
      : (blob.type && blob.type.includes("mp4")) ? "mp4"
      : "webm";
    await onSend(blob, `consultation-${Date.now()}.${ext}`);
  }

  // Unsupported browser — render the upload fallback inline per spec step 2.
  if (!supported) {
    return (
      <AudioUpload
        onSend={(f) => (onUploadFallback ? onUploadFallback(f) : onSend(f, f.name))}
        disabled={disabled}
        busy={busy}
        caption="Your browser doesn't support live recording — you can upload an audio file instead."
      />
    );
  }

  return (
    <div className="voice-recorder">
      {permDenied && (
        <div className="banner banner-error" role="alert">
          Microphone permission denied — check your browser settings, or use Upload mode.
        </div>
      )}
      {startErr && (
        <div className="banner banner-error" role="alert">
          Could not start recording: {startErr}
        </div>
      )}

      <div className="voice-stage">
        <div className={`voice-visualizer is-${phase}`} aria-hidden="true">
          {levels.map((v, i) => (
            <span
              key={i}
              className="voice-bar"
              style={{ transform: `scaleY(${phase === "recording" ? v : 0.12})` }}
            />
          ))}
        </div>

        <div className="voice-meta" aria-live="polite">
          <span className="voice-time">{mmss(elapsed)}</span>
          {blob && <span className="voice-size">· {formatSize(blob.size)}</span>}
        </div>

        <div className="btn-row voice-controls">
          {phase === "idle" && (
            <button
              type="button"
              className="btn btn-primary voice-record-btn"
              onClick={onStart}
              disabled={disabled}
              aria-label="Start recording"
            >
              <span className="voice-dot" aria-hidden="true" />
              Record
            </button>
          )}
          {phase === "recording" && (
            <button
              type="button"
              className="btn btn-accent voice-record-btn"
              onClick={onStop}
              disabled={disabled}
              aria-label="Stop recording"
            >
              <span className="voice-stop-square" aria-hidden="true" />
              Stop
            </button>
          )}
          {phase === "review" && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSend}
                disabled={disabled || busy}
              >
                {busy ? "Sending…" : "Send for transcription"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={onRerecord}
                disabled={disabled || busy}
              >
                Re-record
              </button>
            </>
          )}
        </div>

        {phase === "review" && objectUrl && (
          <audio className="voice-preview" controls src={objectUrl} />
        )}
      </div>
    </div>
  );
}
