import { readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export interface WorkspaceDirectoryListing {
  path: string;
  parent: string | null;
  directories: Array<{ name: string; path: string }>;
}

export function listWorkspaceDirectories(requestedPath: string): WorkspaceDirectoryListing {
  const path = realpathSync(requestedPath);
  if (!statSync(path).isDirectory()) throw new Error("Path is not a directory");

  const directories = readdirSync(path, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isDirectory()) return true;
      if (!entry.isSymbolicLink()) return false;
      try { return statSync(join(path, entry.name)).isDirectory(); }
      catch { return false; }
    })
    .map((entry) => ({ name: entry.name, path: join(path, entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const root = parse(path).root;

  return { path, parent: path === root ? null : dirname(path), directories };
}
