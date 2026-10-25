"use client";

import { Loader } from "@/components/motion/loader";

export function LoadingIndicator({ label }: { label: string }) {
  return <div className="loading-indicator" role="status">
    <span className="loading-indicator-mark" aria-hidden="true"><Loader variant="dot-matrix" size={32} /></span>
    <p>{label}</p>
  </div>;
}
