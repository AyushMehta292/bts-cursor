import { sendToTab, type ContentToBg, type PopupToBg } from "../lib/messages";
import { getSupabase } from "../lib/supabase";
import type {
  Clip,
  ExtensionStatus,
  Mode,
  RunRequest,
  UserSettings,
} from "../lib/types";

const IDLE_POLL_ALARM = "bypass-idle-poll";
const ACTIVE_POLL_ALARM = "bypass-active-poll";
const IDLE_POLL_MS = 5000;
const ACTIVE_POLL_MS = 1000;

let mode: Mode = "idle";
let activeRunId: string | null = null;
let activeTabId: number | null = null;
let lastError: string | null = null;
let scrollSettings: UserSettings | null = null;
let idleTimer: ReturnType<typeof setInterval> | null = null;
let activeTimer: ReturnType<typeof setInterval> | null = null;
let lastKnownStatus: string | null = null;

async function publishStatus() {
  const status = await getStatus();
  await chrome.storage.local.set({ bypass_status: status });
}

async function getStatus(): Promise<ExtensionStatus> {
  let username: string | null = null;
  let signedIn = false;
  try {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    signedIn = !!session;
    if (session) {
      // Username is just for display - a missing profile row (e.g. an
      // account created before this table existed) should not make the
      // popup think you're signed out.
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", session.user.id)
        .maybeSingle();
      username = (profile?.username as string | undefined) ?? null;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
  return { mode, signedIn, username, activeRunId, lastError };
}

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab?.id || tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
    return null;
  }
  return tab.id;
}

async function pingTab(tabId: number): Promise<boolean> {
  const result = await sendToTab<{ ok?: boolean }>(tabId, { type: "TYPING_STOP" });
  return result?.ok === true || result !== undefined;
}

async function stopScrolling() {
  if (activeTabId != null) {
    await sendToTab(activeTabId, { type: "SCROLL_STOP" });
  }
  if (mode === "scrolling") {
    mode = "idle";
    await publishStatus();
  }
}

async function startScrollingIfNeeded() {
  if (mode === "typing" || mode === "paused") return;
  if (!scrollSettings?.scroll_enabled) {
    if (mode === "scrolling") await stopScrolling();
    return;
  }

  const tabId = await getActiveTabId();
  if (tabId == null) return;

  if (mode === "scrolling" && activeTabId === tabId) return;

  if (mode === "scrolling" && activeTabId != null && activeTabId !== tabId) {
    await sendToTab(activeTabId, { type: "SCROLL_STOP" });
  }

  activeTabId = tabId;
  await sendToTab(tabId, {
    type: "SCROLL_START",
    payload: {
      minPauseMs: scrollSettings.scroll_min_pause_ms,
      maxPauseMs: scrollSettings.scroll_max_pause_ms,
      minAmountPx: scrollSettings.scroll_min_amount_px,
      maxAmountPx: scrollSettings.scroll_max_amount_px,
      minSpeedPxS: scrollSettings.scroll_min_speed_px_s,
      maxSpeedPxS: scrollSettings.scroll_max_speed_px_s,
    },
  });
  mode = "scrolling";
  await publishStatus();
}

async function markRun(
  runId: string,
  patch: Partial<RunRequest>,
) {
  const supabase = getSupabase();
  await supabase.from("run_requests").update(patch).eq("id", runId);
}

async function claimAndStartRun(run: RunRequest) {
  const supabase = getSupabase();

  await stopScrolling();

  const { data: claimed, error: claimError } = await supabase
    .from("run_requests")
    .update({
      status: "claimed",
      claimed_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimError || !claimed) {
    return;
  }

  const { data: clip, error: clipError } = await supabase
    .from("clips")
    .select("*")
    .eq("id", run.clip_id)
    .single();

  if (clipError || !clip) {
    await markRun(run.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
    });
    lastError = clipError?.message ?? "Clip not found";
    await publishStatus();
    return;
  }

  const tabId = await getActiveTabId();
  if (tabId == null) {
    await markRun(run.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
    });
    lastError =
      "No suitable active tab. Focus a normal webpage with an input selected.";
    await publishStatus();
    return;
  }

  activeTabId = tabId;
  activeRunId = run.id;
  lastError = null;

  // Portal may have paused/cancelled between claim and start.
  const { data: latest } = await supabase
    .from("run_requests")
    .select("status, progress_index")
    .eq("id", run.id)
    .single();

  if (latest?.status === "cancelled") {
    mode = "idle";
    activeRunId = null;
    await publishStatus();
    return;
  }

  const startPaused = latest?.status === "paused";
  if (!startPaused) {
    await markRun(run.id, { status: "running" });
    mode = "typing";
    lastKnownStatus = "running";
  } else {
    mode = "paused";
    lastKnownStatus = "paused";
  }
  await publishStatus();

  const typedClip = clip as Clip;
  const reachable = await pingTab(tabId);
  const response = await sendToTab<{ ok?: boolean }>(tabId, {
    type: "TYPING_START",
    payload: {
      runId: run.id,
      content: typedClip.content,
      minWpm: typedClip.min_wpm,
      maxWpm: typedClip.max_wpm,
      mistakesEnabled: typedClip.mistakes_enabled,
      startIndex: latest?.progress_index ?? run.progress_index ?? 0,
    },
  });

  if (startPaused) {
    await sendToTab(tabId, { type: "TYPING_PAUSE" });
  }

  if (!reachable && !response?.ok) {
    await markRun(run.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
    });
    lastError =
      "Could not reach the page content script. Reload the tab and try again.";
    mode = "idle";
    activeRunId = null;
    await publishStatus();
  }

  startActivePolling();
}

async function handleActiveRunControl(run: RunRequest) {
  if (!activeRunId || run.id !== activeRunId) return;

  if (run.status === lastKnownStatus) return;
  lastKnownStatus = run.status;

  const tabId = activeTabId ?? (await getActiveTabId());
  if (tabId == null) return;
  activeTabId = tabId;

  if (run.status === "paused") {
    await sendToTab(tabId, { type: "TYPING_PAUSE" });
    mode = "paused";
    await publishStatus();
    return;
  }

  if (run.status === "running" && mode === "paused") {
    await sendToTab(tabId, { type: "TYPING_RESUME" });
    mode = "typing";
    await publishStatus();
    return;
  }

  if (run.status === "cancelled") {
    await sendToTab(tabId, { type: "TYPING_STOP" });
    mode = "idle";
    activeRunId = null;
    lastKnownStatus = null;
    stopActivePolling();
    await publishStatus();
  }
}

async function finishRun(
  runId: string,
  status: "completed" | "failed" | "cancelled",
  progressIndex?: number,
  error?: string,
) {
  const patch: Partial<RunRequest> = {
    status,
    completed_at: new Date().toISOString(),
  };
  if (typeof progressIndex === "number") {
    patch.progress_index = progressIndex;
  }
  await markRun(runId, patch);
  if (error) lastError = error;
  if (activeRunId === runId) {
    activeRunId = null;
    mode = "idle";
    lastKnownStatus = null;
    stopActivePolling();
    await publishStatus();
  }
}

async function pollIdle() {
  try {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      if (mode === "scrolling") await stopScrolling();
      await publishStatus();
      return;
    }

    const { data: settings } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();
    scrollSettings = (settings as UserSettings | null) ?? null;

    if (mode === "typing" || mode === "paused") {
      return;
    }

    const { data: pending } = await supabase
      .from("run_requests")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pending) {
      await claimAndStartRun(pending as RunRequest);
      return;
    }

    // Resume an orphaned running/paused run after service worker restart
    const { data: active } = await supabase
      .from("run_requests")
      .select("*")
      .eq("user_id", session.user.id)
      .in("status", ["running", "paused", "claimed"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active && !activeRunId) {
      const run = active as RunRequest;
      activeRunId = run.id;
      mode = run.status === "paused" ? "paused" : "typing";
      lastKnownStatus = run.status;
      await publishStatus();

      const tabId = await getActiveTabId();
      if (tabId != null) {
        activeTabId = tabId;
        const { data: clip } = await supabase
          .from("clips")
          .select("*")
          .eq("id", run.clip_id)
          .single();
        if (clip) {
          const typedClip = clip as Clip;
          await sendToTab(tabId, {
            type: "TYPING_START",
            payload: {
              runId: run.id,
              content: typedClip.content,
              minWpm: typedClip.min_wpm,
              maxWpm: typedClip.max_wpm,
              mistakesEnabled: typedClip.mistakes_enabled,
              startIndex: run.progress_index ?? 0,
            },
          });
          if (run.status === "paused") {
            await sendToTab(tabId, { type: "TYPING_PAUSE" });
          }
        }
      }
      startActivePolling();
      return;
    }

    await startScrollingIfNeeded();
    lastError = null;
    await publishStatus();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    await publishStatus();
  }
}

async function pollActive() {
  if (!activeRunId) {
    stopActivePolling();
    return;
  }
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("run_requests")
      .select("*")
      .eq("id", activeRunId)
      .maybeSingle();

    if (!data) {
      mode = "idle";
      activeRunId = null;
      stopActivePolling();
      await publishStatus();
      return;
    }

    await handleActiveRunControl(data as RunRequest);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    await publishStatus();
  }
}

function startIdlePolling() {
  if (idleTimer) return;
  void pollIdle();
  idleTimer = setInterval(() => void pollIdle(), IDLE_POLL_MS);
  // Chrome clamps alarms to >= 30s; used only as a service-worker wake backstop.
  void chrome.alarms.create(IDLE_POLL_ALARM, { periodInMinutes: 0.5 });
}

function startActivePolling() {
  if (activeTimer) return;
  void pollActive();
  activeTimer = setInterval(() => void pollActive(), ACTIVE_POLL_MS);
  void chrome.alarms.create(ACTIVE_POLL_ALARM, { periodInMinutes: 0.5 });
}

function stopActivePolling() {
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
  void chrome.alarms.clear(ACTIVE_POLL_ALARM);
}

chrome.runtime.onInstalled.addListener(() => {
  startIdlePolling();
});

chrome.runtime.onStartup.addListener(() => {
  startIdlePolling();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === IDLE_POLL_ALARM) void pollIdle();
  if (alarm.name === ACTIVE_POLL_ALARM) void pollActive();
});

chrome.tabs.onActivated.addListener(() => {
  if (mode === "scrolling" || (mode === "idle" && scrollSettings?.scroll_enabled)) {
    void startScrollingIfNeeded();
  }
});

chrome.runtime.onMessage.addListener(
  (message: ContentToBg | PopupToBg, _sender, sendResponse) => {
    if (message.type === "GET_STATUS") {
      void getStatus().then(sendResponse);
      return true;
    }

    if (message.type === "AUTH_CHANGED") {
      void pollIdle().then(() => getStatus().then(sendResponse));
      return true;
    }

    if (message.type === "TYPING_PROGRESS") {
      void markRun(message.runId, { progress_index: message.progressIndex });
      return false;
    }

    if (message.type === "TYPING_DONE") {
      void finishRun(message.runId, "completed", message.progressIndex);
      return false;
    }

    if (message.type === "TYPING_FAILED") {
      void finishRun(message.runId, "failed", undefined, message.error);
      return false;
    }

    if (message.type === "SCROLL_STOPPED") {
      if (mode === "scrolling") {
        mode = "idle";
        void publishStatus();
      }
      return false;
    }

    return false;
  },
);

startIdlePolling();
void publishStatus();
