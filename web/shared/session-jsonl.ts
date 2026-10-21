/** Passive, byte-bounded snapshot of an exact registered session's original history. */
export interface SessionJsonlDocument {
  projectId: string;
  sessionId: string;
  fileName?: string;
  content: string;
  /** UTF-8 byte length of content, not its character count. */
  bytes: number;
  /** Source file size observed before reading; later appends belong to a later read. */
  totalBytes: number;
  truncated: boolean;
}
