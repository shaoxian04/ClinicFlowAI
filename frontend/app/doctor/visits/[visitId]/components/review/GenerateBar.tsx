// frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { apiPostMultipart } from "@/lib/api";
import { PhasedSpinner } from "./PhasedSpinner";

type Mode = "text" | "voice" | "live";

export interface GenerateBarProps {
  visitId: string;
  onGenerate: (transcript: string) => Promise<void>;
  generating: boolean;
  hasReport: boolean;
  initialTranscript?: string;
}

const ACCEPTED_AUDIO = ".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.ogg,.flac";

export function GenerateBar({ visitId, onGenerate, generating, hasReport, initialTranscript }: GenerateBarProps) {
  const [transcript, setTranscript] = useState(initialTranscript ?? "");
  const [expanded, setExpanded] = useState(!hasReport);
  const [mode, setMode] = useState<Mode>("text");

  // Voice (file upload) state
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live (microphone) state
  const [recording, setRecording] = useState(false);
  const [liveTranscribing, setLiveTranscribing] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mediaRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function handleGenerate() {
    if (!transcript.trim()) return;
    await onGenerate(transcript);
    setExpanded(false);
  }

  // ── Voice tab: upload file ────────────────────────────────────────────────

  async function transcribeFile(file: File) {
    setAudioError(null);
    setSelectedFile(file);
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", file, file.name);
      const resp = await apiPostMultipart<{ transcript: string }>(`/visits/${visitId}/audio`, fd);
      if (mountedRef.current) {
        setTranscript(resp.transcript);
        setMode("text");
      }
    } catch (e) {
      if (mountedRef.current) setAudioError((e as Error).message);
    } finally {
      if (mountedRef.current) setTranscribing(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) transcribeFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) transcribeFile(file);
  }

  // ── Live tab: microphone recording ────────────────────────────────────────

  async function startRecording() {
    setLiveError(null);
    setRecSeconds(0);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream!.getTracks().forEach((t) => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "live-recording.webm");
        if (!mountedRef.current) return;
        setLiveTranscribing(true);
        try {
          const resp = await apiPostMultipart<{ transcript: string }>(`/visits/${visitId}/audio`, fd);
          if (mountedRef.current) {
            setTranscript(resp.transcript);
            setMode("text");
          }
        } catch (e) {
          if (mountedRef.current) setLiveError((e as Error).message);
        } finally {
          if (mountedRef.current) setLiveTranscribing(false);
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      timerRef.current = setInterval(() => {
        if (mountedRef.current) setRecSeconds((s) => s + 1);
      }, 1000);
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      setLiveError("Microphone access denied or unavailable.");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  // ── Collapsed state ───────────────────────────────────────────────────────

  if (hasReport && !expanded) {
    return (
      <section className="generate-bar collapsed">
        <span>Transcript: {transcript.trim().split(/\s+/).length} words</span>
        <button type="button" onClick={() => setExpanded(true)}>Edit transcript</button>
        <button type="button" onClick={handleGenerate} disabled={generating}>Regenerate</button>
      </section>
    );
  }

  return (
    <section className="generate-bar">
      <div className="generate-bar-header">
        <label htmlFor="transcript-ta">Consultation transcript</label>
        <div className="mode-tabs" role="tablist">
          {(["text", "voice", "live"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              className={`mode-tab${mode === m ? " active" : ""}`}
              onClick={() => {
                if (recording) stopRecording();
                setMode(m);
                setAudioError(null);
                setLiveError(null);
              }}
              disabled={generating}
              aria-selected={mode === m}
            >
              {m === "text" ? "Text" : m === "voice" ? "Voice" : "Live"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Text mode ──────────────────────────────────────────── */}
      {mode === "text" && (
        <>
          <textarea
            id="transcript-ta"
            aria-label="Consultation transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder="Paste or type the consultation transcript…"
          />
          <div className="generate-bar-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={handleGenerate}
              disabled={generating || !transcript.trim()}
              aria-busy={generating}
            >
              {generating ? "Generating…" : "Generate report"}
            </button>
            {generating && <PhasedSpinner />}
          </div>
        </>
      )}

      {/* ── Voice mode: file upload ─────────────────────────────── */}
      {mode === "voice" && (
        <div
          className={`voice-zone upload-zone${dragOver ? " drag-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !transcribing && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          aria-label="Upload audio file"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_AUDIO}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {transcribing ? (
            <>
              <PhasedSpinner />
              <span className="voice-hint">Transcribing {selectedFile?.name}…</span>
            </>
          ) : (
            <>
              <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="voice-hint">
                {dragOver ? "Drop audio file here" : "Click or drag an audio file to upload"}
              </span>
              <span className="upload-formats">MP3 · WAV · M4A · WebM · FLAC · OGG</span>
            </>
          )}
          {audioError && <span className="voice-error" onClick={(e) => e.stopPropagation()}>{audioError}</span>}
        </div>
      )}

      {/* ── Live mode: microphone recording ────────────────────── */}
      {mode === "live" && (
        <div className="live-zone">
          {liveTranscribing ? (
            <>
              <PhasedSpinner />
              <span className="voice-hint">Transcribing recording…</span>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`record-btn${recording ? " recording" : ""}`}
                onClick={recording ? stopRecording : startRecording}
                aria-label={recording ? "Stop recording" : "Start live recording"}
              >
                {recording ? "■" : "●"}
              </button>
              {recording && (
                <span className="live-timer" aria-live="polite">{formatTime(recSeconds)}</span>
              )}
              <span className="voice-hint">
                {recording ? "Recording… click to stop" : "Click to start live recording"}
              </span>
            </>
          )}
          {liveError && <span className="voice-error">{liveError}</span>}
        </div>
      )}
    </section>
  );
}
