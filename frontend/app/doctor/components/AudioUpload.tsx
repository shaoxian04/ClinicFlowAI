"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export type AudioUploadProps = {
  /** Called when the doctor presses Send with a validated file. */
  onSend: (file: File) => void | Promise<void>;
  /** Disable all interaction (e.g. SOAP finalized, or upload already in-flight). */
  disabled?: boolean;
  /** True while the parent is uploading — used to swap the Send button label. */
  busy?: boolean;
  /** Optional caption rendered above the drop zone (e.g. recorder-fallback note). */
  caption?: string;
};

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AudioUpload({ onSend, disabled = false, busy = false, caption }: AudioUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function pickFile(f: File) {
    setErr(null);
    if (f.size > MAX_BYTES) {
      setFile(null);
      setErr("File too large (max 20 MB)");
      return;
    }
    setFile(f);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
    // Reset so picking the same file twice still fires a change event.
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  async function handleSend() {
    if (!file || disabled || busy) return;
    await onSend(file);
  }

  function clearFile() {
    setFile(null);
    setErr(null);
  }

  return (
    <div className="audio-upload">
      {caption ? <p className="audio-upload-caption">{caption}</p> : null}

      <div
        className={`audio-dropzone${isDragOver ? " is-drag-over" : ""}${disabled ? " is-disabled" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={openPicker}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
      >
        <div className="audio-dropzone-icon" aria-hidden="true">📎</div>
        <div className="audio-dropzone-text">
          <strong>Drop an audio file here</strong>
          <span>or click to browse · up to 20 MB · MP3/WAV/M4A/WebM</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          onChange={onInputChange}
          disabled={disabled}
          className="audio-upload-input"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {err && <div className="banner banner-error">{err}</div>}

      {file && (
        <div className="audio-file-card">
          <div className="audio-file-meta">
            <span className="audio-file-name" title={file.name}>{file.name}</span>
            <span className="audio-file-size">{formatMb(file.size)}</span>
          </div>
          <div className="btn-row">
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
              className="btn btn-ghost"
              onClick={clearFile}
              disabled={disabled || busy}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
