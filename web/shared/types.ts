export interface SessionSummary {
  id: string;
  name: string;
  preview: string;
  updatedAt: string;
}

export interface BootstrapData {
  project: { name: string; path: string; branch: string; dirtyFiles: number };
  runtime: { piVersion: string; modelConfigFound: boolean; status: "ready" | "needs-model" };
  sessions: SessionSummary[];
}
