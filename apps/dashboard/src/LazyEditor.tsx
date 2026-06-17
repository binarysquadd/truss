// LazyEditor.tsx — Lazy-loaded Monaco editor wrapper
import React, { Suspense } from "react";

const Editor = React.lazy(() => import("@monaco-editor/react"));

const EditorFallback = () => (
  <div className="flex h-full items-center justify-center rounded border border-slate-800 bg-slate-950 text-xs text-slate-500">
    Loading editor…
  </div>
);

export function LazyEditor(props: React.ComponentProps<typeof Editor>) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <Editor {...props} />
    </Suspense>
  );
}
