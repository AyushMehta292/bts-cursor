export type Clip = {
  id: string;
  user_id: string;
  name: string;
  content: string;
  min_wpm: number;
  max_wpm: number;
  mistakes_enabled: boolean;
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
  scroll_min_speed_px_s: number;
  scroll_max_speed_px_s: number;
};

export type Mode = "idle" | "typing" | "paused" | "scrolling";

export type TypingStartPayload = {
  runId: string;
  content: string;
  minWpm: number;
  maxWpm: number;
  mistakesEnabled: boolean;
  startIndex: number;
};

export type ScrollStartPayload = {
  minPauseMs: number;
  maxPauseMs: number;
  minAmountPx: number;
  maxAmountPx: number;
  minSpeedPxS: number;
  maxSpeedPxS: number;
};

export type ExtensionStatus = {
  mode: Mode;
  signedIn: boolean;
  username: string | null;
  activeRunId: string | null;
  lastError: string | null;
};
