// LazyReactFlow.tsx — Lazy-loaded ReactFlow wrapper + lightweight re-exports
import React, { Suspense } from "react";

// ---------------------------------------------------------------------------
// Lazy components: load @xyflow/react only when first rendered
// ---------------------------------------------------------------------------
const ReactFlowLazy = React.lazy(() =>
  import("@xyflow/react").then((m) => ({ default: m.ReactFlow }))
);
const BackgroundLazy = React.lazy(() =>
  import("@xyflow/react").then((m) => ({ default: m.Background }))
);
const ControlsLazy = React.lazy(() =>
  import("@xyflow/react").then((m) => ({ default: m.Controls }))
);

const FlowFallback = () => (
  <div className="flex h-full items-center justify-center rounded border border-slate-800 bg-slate-950 text-xs text-slate-500">
    Loading graph…
  </div>
);

export function LazyReactFlowWrapper({
  children,
  fallback,
  ...props
}: any) {
  return (
    <Suspense fallback={fallback || <FlowFallback />}>
      <ReactFlowLazy {...props}>{children}</ReactFlowLazy>
    </Suspense>
  );
}

export function LazyBackground(props: any) {
  return (
    <Suspense fallback={null}>
      <BackgroundLazy {...props} />
    </Suspense>
  );
}

export function LazyControls(props: any) {
  return (
    <Suspense fallback={null}>
      <ControlsLazy {...props} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// MarkerType — inlined string values so we don't eagerly import @xyflow/react
// ---------------------------------------------------------------------------
export const MarkerType = {
  Arrow: "arrow" as const,
  ArrowClosed: "arrowclosed" as const,
} as const;

// Types are erased at compile time — safe to re-export
export type { Node, Edge } from "@xyflow/react";
