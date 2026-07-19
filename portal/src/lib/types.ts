export type Clip = {
  id: string;
  user_id: string;
  name: string;
  content: string;
  min_wpm: number;
  max_wpm: number;
  mistakes_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type RunStatus =
  | "pending"
  | "claimed"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type RunRequest = {
  id: string;
  user_id: string;
  clip_id: string;
  status: RunStatus;
  progress_index: number;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type UserSettings = {
  user_id: string;
  scroll_enabled: boolean;
  scroll_min_pause_ms: number;
  scroll_max_pause_ms: number;
  scroll_min_amount_px: number;
  scroll_max_amount_px: number;
  updated_at: string;
};

export const ACTIVE_RUN_STATUSES: RunStatus[] = [
  "pending",
  "claimed",
  "running",
  "paused",
];
