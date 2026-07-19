import type { BgToContent, ContentToBg } from "../lib/messages";
import type { ScrollStartPayload } from "../lib/types";

let scrolling = false;
let scrollPromise: Promise<void> | null = null;
let config: ScrollStartPayload | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function report(message: ContentToBg) {
  try {
    void chrome.runtime.sendMessage(message);
  } catch {
    // ignore
  }
}

async function smoothScrollBy(amount: number, durationMs: number) {
  const steps = Math.max(1, Math.floor(durationMs / 16));
  const stepAmount = amount / steps;
  for (let i = 0; i < steps; i++) {
    if (!scrolling) return;
    window.scrollBy(0, stepAmount);
    await sleep(16);
  }
}

async function runScrollLoop() {
  while (scrolling && config) {
    const amount = randInt(config.minAmountPx, config.maxAmountPx);
    const direction = Math.random() < 0.5 ? -1 : 1;
    // A fresh random speed per burst (never above the configured max) is
    // what makes this look like a human scrolling at varying pace rather
    // than a fixed-rate bot.
    const speedPxPerSec = randInt(config.minSpeedPxS, config.maxSpeedPxS);
    const duration = Math.max(120, (amount / speedPxPerSec) * 1000);
    await smoothScrollBy(amount * direction, duration);

    if (!scrolling) break;

    // Occasionally "stop and read"
    if (Math.random() < 0.35) {
      await sleep(randInt(config.minPauseMs, config.maxPauseMs));
    } else {
      await sleep(randInt(config.minPauseMs, Math.max(config.minPauseMs, Math.floor(config.maxPauseMs * 0.6))));
    }
  }
  report({ type: "SCROLL_STOPPED" });
}

chrome.runtime.onMessage.addListener((message: BgToContent, _sender, sendResponse) => {
  if (message.type === "SCROLL_START") {
    config = message.payload;
    if (!scrolling) {
      scrolling = true;
      scrollPromise = runScrollLoop().finally(() => {
        scrollPromise = null;
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SCROLL_STOP") {
    scrolling = false;
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
