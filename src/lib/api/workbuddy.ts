import { invoke } from "@tauri-apps/api/core";

export type WorkBuddyMemoryKind = "MEMORY.md" | "USER.md" | "SOUL.md";
export interface WorkBuddyMemoryFile {
  content: string;
  revision: string;
  exists: boolean;
}
export const workbuddyMemoryApi = {
  read: (filename: WorkBuddyMemoryKind) =>
    invoke<WorkBuddyMemoryFile>("workbuddy_read_memory", { filename }),
  save: (
    filename: WorkBuddyMemoryKind,
    content: string,
    expectedRevision: string,
  ) =>
    invoke<WorkBuddyMemoryFile>("workbuddy_save_memory", {
      filename,
      content,
      expectedRevision,
    }),
};
