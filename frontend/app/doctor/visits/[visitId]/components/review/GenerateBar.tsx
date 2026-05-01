// frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { apiPostMultipart } from "@/lib/api";
import { cn } from "@/design/cn";
import { Button } from "@/components/ui/Button";
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
  // Live recording is the primary capture path during a real consultation —
  // text mode is reserved for paste/edit, voice mode for uploading a saved
  // recording. Default to "live" so the doctor can hit record immediately.
  const [mode, setMode] = useState<Mode>("live");

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
      <section className="flex items-center gap-3 px-4 py-3 bg-mica/50 border border-ink-rim rounded-xs mb-4">
        <span className="font-mono text-xs text-fog-dim flex-1">
          Transcript: {transcript.trim().split(/\s+/).length} words
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
          Edit transcript
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={handleGenerate} disabled={generating}>
          Regenerate
        </Button>
      </section>
    );
  }

  return (
    <section className="mb-4 border border-ink-rim rounded-xs bg-ink-well">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-ink-rim">
        <label htmlFor="transcript-ta" className="font-mono text-xs text-fog-dim uppercase tracking-widest">
          Consultation transcript
        </label>
        {/* Mode tabs */}
        <div className="flex gap-0" role="tablist">
          {(["text", "voice", "live"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              className={cn(
                "px-3 py-1 text-xs font-sans transition-colors duration-150 border-b-2 -mb-px",
                mode === m
                  ? "text-cyan border-cyan"
                  : "text-fog-dim border-transparent hover:text-fog"
              )}
              onClick={() => {
                if (recording) stopRecording();
                setMode(m);
                setAudioError(null);
                setLiveError(null);
              }}
              disabled={generating}
            >
              {m === "text" ? "Text" : m === "voice" ? "Voice" : "Live"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
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
              className="w-full rounded-xs border border-ink-rim bg-ink-well px-3 py-2 text-sm font-sans text-fog placeholder:text-fog-dim/50 focus:outline-none focus:ring-1 focus:ring-cyan/40 resize-y"
            />
            <div className="flex items-center gap-3 mt-3">
              <Button
                type="button"
                variant="primary"
                onClick={handleGenerate}
                disabled={generating || !transcript.trim()}
                aria-busy={generating}
              >
                {generating ? "Generating…" : "Generate report"}
              </Button>
              {generating && <PhasedSpinner />}
            </div>
          </>
        )}

        {/* ── Voice mode: file upload ─────────────────────────────── */}
        {mode === "voice" && (
          <div
            className={cn(
              "border-2 border-dashed border-ink-rim rounded-xs p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors duration-150",
              dragOver && "border-coral bg-cyan/5",
              transcribing && "cursor-default"
            )}
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
                <span className="font-sans text-sm text-fog-dim">
                  Transcribing {selectedFile?.name}…
                </span>
              </>
            ) : (
              <>
                <svg className="w-8 h-8 text-fog-dim/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="font-sans text-sm text-fog-dim">
                  {dragOver ? "Drop audio file here" : "Click or drag an audio file to upload"}
                </span>
                <span className="font-mono text-xs text-fog-dim/50">
                  MP3 · WAV · M4A · WebM · FLAC · OGG
                </span>
              </>
            )}
            {audioError && (
              <span
                className="font-sans text-xs text-crimson"
                onClick={(e) => e.stopPropagation()}
              >
                {audioError}
              </span>
            )}
          </div>
        )}

        {/* ── Live mode: microphone recording ────────────────────── */}
        {mode === "live" && (
          <div className="flex flex-col items-center gap-4 py-6">
            {liveTranscribing ? (
              <>
                <PhasedSpinner />
                <span className="font-sans text-sm text-fog-dim">Transcribing recording…</span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center text-xl font-sans transition-colors duration-150 border-2",
                    recording
                      ? "bg-crimson border-crimson text-fog hover:bg-crimson/90"
                      : "bg-coral border-coral text-fog hover:bg-coral/90"
                  )}
                  onClick={recording ? stopRecording : startRecording}
                  aria-label={recording ? "Stop recording" : "Start live recording"}
                >
                  {recording ? "■" : "●"}
                </button>
                {recording && (
                  <span className="font-mono text-sm text-fog" aria-live="polite">
                    {formatTime(recSeconds)}
                  </span>
                )}
                <span className="font-sans text-sm text-fog-dim">
                  {recording ? "Recording… click to stop" : "Click to start live recording"}
                </span>
              </>
            )}
            {liveError && (
              <span className="font-sans text-xs text-crimson">{liveError}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
