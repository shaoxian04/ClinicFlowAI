import React, { ReactNode } from "react";

type EmptyStateProps = {
  glyph: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
};

/**
 * Presentational, centred empty-state block with a halo-wrapped glyph,
 * title, optional body, and optional action (CTA button or link).
 * Styled via .empty-state* classes in globals.css.
 */
export function EmptyState({ glyph, title, body, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-glyph" aria-hidden="true">
        {glyph}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {body && <p className="empty-state-body">{body}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
