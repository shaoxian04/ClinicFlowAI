"use client";

import {
  forwardRef,
  KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { apiPost, apiPostFormData } from "@/lib/api";
import { AudioUpload } from "./AudioUpload";
import { VoiceRecorder } from "./VoiceRecorder";

export type CaptureMode = "record" | "upload" | "type";

export type ConsultationCaptureHandle = {
  /**
   * Switch to Type mode with the given transcript preloaded in the textarea.
   * Called by the parent when the doctor clicks "Edit transcript" in the
   * TranscriptReview panel.
   */
  switchToType: (initial: string) => void;
};

export type ConsultationCaptureProps = {
  /** Visit id — appended to the audio / notes-text endpoint paths. */
  visitId: string;
  /** Fired when the backend returns a transcript for any of the three modes. */
  onTranscriptReady: (transcript: string) => void;
  /**
   * Optional notifier for in-flight send state (upload / transcribe / POST notes-text).
   * Separate from the Generate SOAP busy flag.
   */
  onBusyChange?: (busy: boolean) => void;
  /** Disable the entire capture UI (e.g. SOAP finalized). */
  locked?: boolean;
};

type TabDef = { key: CaptureMode; label: string };

const TABS: TabDef[] = [
  { key: "record", label: "🎙 Record" },
  { key: "upload", label: "📎 Upload" },
  { key: "type", label: "⌨ Type" },
];

type TranscriptResponse = { transcript: string };

function isMissingEndpoint(err: Error): boolean {
  const m = err.message || "";
  return m.includes("HTTP 404") || m.includes("HTTP 501");
}

const MISSING_ENDPOINT_MSG =
  "Audio transcription endpoint is not yet available. Try Type mode and paste the transcript.";

export const ConsultationCapture = forwardRef<ConsultationCaptureHandle, ConsultationCaptureProps>(
  function ConsultationCapture({ visitId, onTranscriptReady, onBusyChange, locked = false }, ref) {
    const [mode, setMode] = useState<CaptureMode>("record");
    const [textDraft, setTextDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const tabRefs = useRef<Record<CaptureMode, HTMLButtonElement | null>>({
      record: null,
      upload: null,
      type: null,
    });

    useImperativeHandle(
      ref,
      (): ConsultationCaptureHandle => ({
        switchToType: (initial: string) => {
          setTextDraft(initial);
          setMode("type");
          setErr(null);
          // Hand focus to the Type tab so keyboard users land sensibly.
          // A microtask delay lets the tab actually mount before focus().
          queueMicrotask(() => {
            tabRefs.current.type?.focus();
          });
        },
      }),
      [],
    );

    useEffect(() => {
      onBusyChange?.(busy);
    }, [busy, onBusyChange]);

    const selectTab = useCallback((key: CaptureMode, focus: boolean) => {
      setMode(key);
      setErr(null);
      if (focus) tabRefs.current[key]?.focus();
    }, []);

    const onTabKeyDown = useCallback(
      (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
        switch (e.key) {
          case "ArrowRight": {
            e.preventDefault();
            const next = TABS[(idx + 1) % TABS.length];
            selectTab(next.key, true);
            break;
          }
          case "ArrowLeft": {
            e.preventDefault();
            const prev = TABS[(idx - 1 + TABS.length) % TABS.length];
            selectTab(prev.key, true);
            break;
          }
          case "Home": {
            e.preventDefault();
            selectTab(TABS[0].key, true);
            break;
          }
          case "End": {
            e.preventDefault();
            selectTab(TABS[TABS.length - 1].key, true);
            break;
          }
          default:
            break;
        }
      },
      [selectTab],
    );

    async function sendAudio(blob: Blob, filename: string) {
      if (locked) return;
      setErr(null);
      setBusy(true);
      try {
        const form = new FormData();
        form.append("audio", blob, filename);
        const res = await apiPostFormData<TranscriptResponse>(`/visits/${visitId}/audio`, form);
        if (!res.transcript) {
          setErr("Server returned empty transcript");
          return;
        }
        onTranscriptReady(res.transcript);
      } catch (e) {
        const error = e as Error;
        setErr(isMissingEndpoint(error) ? MISSING_ENDPOINT_MSG : error.message);
      } finally {
        setBusy(false);
      }
    }

    async function sendText() {
      if (locked) return;
      const text = textDraft.trim();
      if (!text) {
        setErr("Transcript is required");
        return;
      }
      setErr(null);
      setBusy(true);
      try {
        const res = await apiPost<TranscriptResponse>(`/visits/${visitId}/notes-text`, { text });
        // Some environments echo the text back verbatim; fall back to the
        // doctor's typed transcript if the envelope omits a transcript value
        // so the review pane still populates.
        onTranscriptReady(res.transcript ?? text);
      } catch (e) {
        const error = e as Error;
        setErr(isMissingEndpoint(error) ? MISSING_ENDPOINT_MSG : error.message);
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="capture">
        <div role="tablist" aria-label="Consultation capture mode" className="capture-tablist">
          {TABS.map((t, idx) => {
            const isActive = t.key === mode;
            const panelId = `capture-panel-${t.key}`;
            const tabId = `capture-tab-${t.key}`;
            return (
              <button
                key={t.key}
                id={tabId}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                className={`capture-tab${isActive ? " is-active" : ""}`}
                onClick={() => selectTab(t.key, false)}
                onKeyDown={(e) => onTabKeyDown(e, idx)}
                disabled={locked}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {err && <div className="banner banner-error" role="alert">{err}</div>}

        <div
          role="tabpanel"
          id={`capture-panel-${mode}`}
          aria-labelledby={`capture-tab-${mode}`}
          className="capture-panel"
        >
          {mode === "record" && (
            <VoiceRecorder
              onSend={(blob, name) => sendAudio(blob, name)}
              onUploadFallback={(f) => sendAudio(f, f.name)}
              disabled={locked}
              busy={busy}
            />
          )}
          {mode === "upload" && (
            <AudioUpload
              onSend={(f) => sendAudio(f, f.name)}
              disabled={locked}
              busy={busy}
            />
          )}
          {mode === "type" && (
            <div className="capture-type">
              <label className="field">
                <span className="field-label">Typed transcript</span>
                <textarea
                  className="textarea"
                  rows={8}
                  placeholder="Patient reports 3 days of productive cough with low-grade fever. Vitals…"
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  disabled={locked || busy}
                />
              </label>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={sendText}
                  disabled={locked || busy || !textDraft.trim()}
                >
                  {busy ? "Sending…" : "Use this transcript"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);
