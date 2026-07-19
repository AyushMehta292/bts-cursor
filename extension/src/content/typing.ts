import type { BgToContent, ContentToBg } from "../lib/messages";
import type { TypingStartPayload } from "../lib/types";

type RunState = "running" | "paused" | "stopped";

const QWERTY_NEIGHBORS: Record<string, string> = {
  a: "sqwz",
  b: "vghn",
  c: "xdfv",
  d: "sfcxe",
  e: "wrsd",
  f: "dgcrt",
  g: "fhvty",
  h: "gjbun",
  i: "ujko",
  j: "hknum",
  k: "jlim",
  l: "kop",
  m: "njk",
  n: "bhjm",
  o: "iklp",
  p: "ol",
  q: "wa",
  r: "edft",
  s: "adwexz",
  t: "rfgy",
  u: "yhji",
  v: "cfgb",
  w: "qase",
  x: "zsdc",
  y: "tghu",
  z: "asx",
};

let runState: RunState = "stopped";
let activeRunId: string | null = null;
let progressIndex = 0;
let typingPromise: Promise<void> | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWrongChar(correct: string): string {
  const lower = correct.toLowerCase();
  const neighbors = QWERTY_NEIGHBORS[lower];
  if (!neighbors || neighbors.length === 0) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    return alphabet[randInt(0, alphabet.length - 1)];
  }
  const wrong = neighbors[randInt(0, neighbors.length - 1)];
  return correct === correct.toUpperCase() ? wrong.toUpperCase() : wrong;
}

function wpmToDelayMs(wpm: number) {
  const safe = Math.max(1, wpm);
  return 60000 / (safe * 5);
}

function isEditable(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "text").toLowerCase();
    return ![
      "button",
      "checkbox",
      "radio",
      "submit",
      "reset",
      "file",
      "image",
      "hidden",
      "color",
      "range",
    ].includes(type);
  }
  if (el instanceof HTMLTextAreaElement) return true;
  return el.isContentEditable;
}

function dispatchKeyEvents(el: HTMLElement, key: string) {
  const opts = {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    bubbles: true,
    cancelable: true,
  };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keypress", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
}

function insertIntoInput(
  el: HTMLInputElement | HTMLTextAreaElement,
  char: string,
) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + char + el.value.slice(end);
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  const caret = start + char.length;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  dispatchKeyEvents(el, char);
}

function backspaceInput(el: HTMLInputElement | HTMLTextAreaElement) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  if (start === 0 && end === 0) return;
  const from = start === end ? start - 1 : start;
  const next = el.value.slice(0, from) + el.value.slice(end);
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.setSelectionRange(from, from);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  dispatchKeyEvents(el, "Backspace");
}

function insertIntoContentEditable(el: HTMLElement, char: string) {
  el.focus();
  const ok = document.execCommand("insertText", false, char);
  if (!ok) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(char));
      range.collapse(false);
    } else {
      el.textContent = (el.textContent ?? "") + char;
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: char }));
  }
  dispatchKeyEvents(el, char);
}

function backspaceContentEditable(el: HTMLElement) {
  el.focus();
  const ok = document.execCommand("delete");
  if (!ok) {
    const text = el.textContent ?? "";
    el.textContent = text.slice(0, -1);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  }
  dispatchKeyEvents(el, "Backspace");
}

function typeChar(el: HTMLElement, char: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    insertIntoInput(el, char);
  } else {
    insertIntoContentEditable(el, char);
  }
}

function deleteChar(el: HTMLElement) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    backspaceInput(el);
  } else {
    backspaceContentEditable(el);
  }
}

function report(message: ContentToBg) {
  try {
    void chrome.runtime.sendMessage(message);
  } catch {
    // Extension context may be invalidated during reload.
  }
}

async function waitWhilePaused(): Promise<boolean> {
  while (runState === "paused") {
    await sleep(120);
  }
  return runState === "running";
}

async function runTyping(payload: TypingStartPayload) {
  activeRunId = payload.runId;
  progressIndex = payload.startIndex;
  runState = "running";

  const target = document.activeElement;
  if (!isEditable(target)) {
    report({
      type: "TYPING_FAILED",
      runId: payload.runId,
      error:
        "No focused input/textarea/contenteditable. Click into a field, then run again.",
    });
    runState = "stopped";
    return;
  }

  const text = payload.content;
  let currentWpm = randInt(payload.minWpm, payload.maxWpm);

  for (let i = progressIndex; i < text.length; i++) {
    if (!(await waitWhilePaused())) break;

    const char = text[i];
    if (char === " " || char === "\n") {
      currentWpm = randInt(payload.minWpm, payload.maxWpm);
    }

    const shouldMistake =
      payload.mistakesEnabled &&
      /[a-zA-Z]/.test(char) &&
      Math.random() < 0.04;

    if (shouldMistake) {
      const wrong = pickWrongChar(char);
      typeChar(target, wrong);
      await sleep(randInt(120, 320));
      if (!(await waitWhilePaused())) break;
      deleteChar(target);
      await sleep(randInt(80, 180));
      if (!(await waitWhilePaused())) break;
    }

    typeChar(target, char);
    progressIndex = i + 1;

    if (progressIndex % 8 === 0 || char === " ") {
      report({
        type: "TYPING_PROGRESS",
        runId: payload.runId,
        progressIndex,
      });
    }

    const jitter = 0.7 + Math.random() * 0.6;
    await sleep(wpmToDelayMs(currentWpm) * jitter);

    if (Math.random() < 0.03) {
      await sleep(randInt(200, 700));
    }
  }

  if (runState === "stopped") {
    report({
      type: "TYPING_PROGRESS",
      runId: payload.runId,
      progressIndex,
    });
    return;
  }

  if (runState === "running" && progressIndex >= text.length) {
    report({
      type: "TYPING_DONE",
      runId: payload.runId,
      progressIndex,
    });
  }

  runState = "stopped";
  activeRunId = null;
}

chrome.runtime.onMessage.addListener((message: BgToContent, _sender, sendResponse) => {
  if (message.type === "TYPING_START") {
    if (typingPromise) {
      runState = "stopped";
    }
    typingPromise = runTyping(message.payload).finally(() => {
      typingPromise = null;
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "TYPING_PAUSE") {
    if (runState === "running") {
      runState = "paused";
      if (activeRunId) {
        report({
          type: "TYPING_PROGRESS",
          runId: activeRunId,
          progressIndex,
        });
      }
    }
    sendResponse({ ok: true, progressIndex });
    return true;
  }

  if (message.type === "TYPING_RESUME") {
    if (runState === "paused") {
      runState = "running";
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "TYPING_STOP") {
    runState = "stopped";
    sendResponse({ ok: true, progressIndex });
    return true;
  }

  return false;
});
