// VectorDocsCard.tsx — pgvector documentation card (extracted from DatabasePanel.tsx)
import React from "react";
import { BookOpenText, ArrowSquareOut } from "@phosphor-icons/react";

export function VectorDocsCard() {
  return (
    <a href="https://docs.truss.binarysquad.org/guides/vectors/" target="_blank" rel="noopener noreferrer"
      className="group block rounded-lg border border-slate-700/50 bg-gradient-to-br from-slate-900/60 to-slate-800/30 p-5 transition-all hover:border-accent-500/30 hover:from-slate-900/80 hover:to-slate-800/50">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <BookOpenText size={16} weight="regular" />
        Integration Guide
      </div>
      <p className="mt-1.5 text-xs text-slate-400">Code examples, SDK snippets, and setup instructions for pgvector similarity search.</p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-300 group-hover:text-accent-200">Read the docs <ArrowSquareOut size={13} /></span>
    </a>
  );
}
