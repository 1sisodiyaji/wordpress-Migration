export type WorkspacePane = "live" | "migrated";

export interface WorkspaceNavMessage {
  type: "wp-migrate-nav";
  pane: WorkspacePane;
  /** Human-facing URL (live WP URL or migrated route URL). */
  url: string;
}

export function isWorkspaceNavMessage(data: unknown): data is WorkspaceNavMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: string }).type === "wp-migrate-nav" &&
    typeof (data as { url?: string }).url === "string"
  );
}
