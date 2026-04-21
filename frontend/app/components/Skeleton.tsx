import React from "react";

type SkeletonLineProps = {
  width?: string;
  height?: string;
};

export function SkeletonLine({ width = "60%", height = "1em" }: SkeletonLineProps) {
  return (
    <span
      className="skeleton skeleton-line"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonTile() {
  return (
    <div className="skeleton-tile" aria-hidden="true">
      <SkeletonLine width="45%" height="1.2em" />
      <SkeletonLine width="85%" height="0.95em" />
    </div>
  );
}

type SkeletonGridProps = {
  count: number;
};

export function SkeletonGrid({ count }: SkeletonGridProps) {
  return (
    <div className="skeleton-grid" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonTile key={i} />
      ))}
    </div>
  );
}
