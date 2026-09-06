export interface FileCheckpointEntry {
  path: string;
  beforeSha256: string | null;
  afterSha256: string | null;
  beforeBlobSha256: string | null;
}

export interface FileCheckpoint {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  createdAt: string;
  operationId?: string;
  state: "captured" | "finalized" | "restored";
  entries: FileCheckpointEntry[];
}
