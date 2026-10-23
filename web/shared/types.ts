export interface SessionSummary {
  id: string;
  path: string;
  name: string;
  preview: string;
  updatedAt: string;
  persisted?: boolean;
}

export interface WorkspaceData {
  renderedAt: string;
  project: {
    name: string;
    path: string;
    branch: string;
    dirtyFiles: number;
    files: string[];
    changes: Array<{ status: string; path: string }>;
  };
}

export interface SessionCollections {
  active: SessionSummary[];
  archived: SessionSummary[];
  trash: SessionSummary[];
}

export type SessionAction =
  | { type: "archive"; sessionPath: string }
  | { type: "restore"; sessionPath: string }
  | { type: "restore_deleted"; sessionPath: string }
  | { type: "delete"; sessionPath: string; collection: "active" | "archived" };
