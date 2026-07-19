"use client";

import { FormEvent, useState } from "react";
import type { Clip } from "@/lib/types";

export type ClipFormValues = {
  name: string;
  content: string;
  min_wpm: number;
  max_wpm: number;
  mistakes_enabled: boolean;
};

type Props = {
  initial?: Partial<Clip>;
  submitLabel: string;
  onSubmit: (values: ClipFormValues) => Promise<void>;
  onCancel?: () => void;
};

export function ClipForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [minWpm, setMinWpm] = useState(initial?.min_wpm ?? 40);
  const [maxWpm, setMaxWpm] = useState(initial?.max_wpm ?? 80);
  const [mistakesEnabled, setMistakesEnabled] = useState(
    initial?.mistakes_enabled ?? true,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (minWpm > maxWpm) {
      setError("Min WPM cannot exceed Max WPM.");
      return;
    }
    if (!content.trim()) {
      setError("Content is required.");
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim() || "Untitled clip",
        content,
        min_wpm: minWpm,
        max_wpm: maxWpm,
        mistakes_enabled: mistakesEnabled,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cover letter intro"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Content to type</span>
        <textarea
          required
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Min WPM</span>
          <input
            type="number"
            min={1}
            max={300}
            required
            value={minWpm}
            onChange={(e) => setMinWpm(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Max WPM (cap)</span>
          <input
            type="number"
            min={1}
            max={300}
            required
            value={maxWpm}
            onChange={(e) => setMaxWpm(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mistakesEnabled}
          onChange={(e) => setMistakesEnabled(e.target.checked)}
          className="size-4 rounded border-border"
        />
        Enable occasional typing mistakes
      </label>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {loading ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
