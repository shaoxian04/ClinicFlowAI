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

export function GenerateBar({ visitId, onGenerate, generating, hasReport, initialTranscript }: GenerateBarProps) {
  const [transcript, setTranscript] = useState(initialTranscript ?? "");
  const [expanded, setExpanded] = useState(!hasReport);
  const [mode, setMode] = useState<Mode>("text");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mediaRef.current?.stop();
      mediaRef.current = null;
    };
  }, []);

  async function handleGenerate() {
    if (!transcript.trim()) return;
    await onGenerate(transcript);
    setExpanded(false);
  }

  async function startRecording() {
    setAudioError(null);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream!.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "recording.webm");
        if (!mountedRef.current) return;
        setTranscribing(true);
        try {
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
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      setAudioError("Microphone access denied or unavailable.");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }

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
              }}
              disabled={generating}
              aria-selected={mode === m}
            >
              {m === "text" ? "Text" : m === "voice" ? "Voice" : "Live"}
            </button>
          ))}
        </div>
      </div>

      {mode === "text" && (
        <>
          <textarea
            id="transcript-ta"
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

      {mode === "voice" && (
        <div className="voice-zone">
          {transcribing ? (
            <PhasedSpinner />
          ) : (
            <button
              type="button"
              className={`record-btn${recording ? " recording" : ""}`}
              onClick={recording ? stopRecording : startRecording}
              aria-label={recording ? "Stop recording" : "Start recording"}
            >
              {recording ? "■" : "●"}
            </button>
          )}
          <span className="voice-hint">
            {transcribing
              ? "Transcribing audio…"
              : recording
              ? "Recording… click to stop"
              : "Click to record your consultation"}
          </span>
          {audioError && <span className="voice-error">{audioError}</span>}
        </div>
      )}

      {mode === "live" && (
        <div className="live-zone">
          <button type="button" className="live-btn" disabled>Start live recording</button>
          <span className="coming-soon">Live consultation recording — coming soon</span>
        </div>
      )}
    </section>
  );
}
