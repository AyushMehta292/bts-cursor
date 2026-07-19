import type { ScrollStartPayload, TypingStartPayload } from "./types";

export type BgToContent =
  | { type: "TYPING_START"; payload: TypingStartPayload }
  | { type: "TYPING_PAUSE" }
  | { type: "TYPING_RESUME" }
  | { type: "TYPING_STOP" }
  | { type: "SCROLL_START"; payload: ScrollStartPayload }
  | { type: "SCROLL_STOP" };

export type ContentToBg =
  | { type: "TYPING_PROGRESS"; runId: string; progressIndex: number }
  | { type: "TYPING_DONE"; runId: string; progressIndex: number }
  | { type: "TYPING_FAILED"; runId: string; error: string }
  | { type: "SCROLL_STOPPED" };

export type PopupToBg =
  | { type: "GET_STATUS" }
  | { type: "AUTH_CHANGED" };

export async function sendToTab<T = unknown>(
  tabId: number,
  message: BgToContent,
): Promise<T | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch {
    return undefined;
  }
}
