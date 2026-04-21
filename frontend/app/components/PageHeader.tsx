import React, { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  sub?: string;
  actions?: ReactNode;
};

/**
 * Presentational page header: eyebrow label, display title, optional sub,
 * and optional actions row. Styled via .page-header* and reuses existing
 * .eyebrow / .page-title / .page-sub rules in globals.css.
 */
export function PageHeader({ eyebrow, title, sub, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h1 className="page-title">{title}</h1>
      {sub ? <p className="page-sub">{sub}</p> : null}
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}
