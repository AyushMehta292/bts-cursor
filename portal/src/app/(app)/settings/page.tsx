"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserSettings } from "@/lib/types";

const DEFAULTS: Omit<UserSettings, "user_id" | "updated_at"> = {
  scroll_enabled: false,
  scroll_min_pause_ms: 1500,
  scroll_max_pause_ms: 5000,
  scroll_min_amount_px: 80,
  scroll_max_amount_px: 400,
  scroll_min_speed_px_s: 200,
  scroll_max_speed_px_s: 800,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        setError("Not signed in.");
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
      } else if (data) {
        const row = data as UserSettings;
        setSettings({
          scroll_enabled: row.scroll_enabled,
          scroll_min_pause_ms: row.scroll_min_pause_ms,
          scroll_max_pause_ms: row.scroll_max_pause_ms,
          scroll_min_amount_px: row.scroll_min_amount_px,
          scroll_max_amount_px: row.scroll_max_amount_px,
          scroll_min_speed_px_s:
            row.scroll_min_speed_px_s ?? DEFAULTS.scroll_min_speed_px_s,
          scroll_max_speed_px_s:
            row.scroll_max_speed_px_s ?? DEFAULTS.scroll_max_speed_px_s,
        });
      } else {
        await supabase.from("user_settings").insert({ user_id: user.id });
      }
      setLoading(false);
    }
    load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (settings.scroll_min_pause_ms > settings.scroll_max_pause_ms) {
      setError("Min pause cannot exceed max pause.");
      return;
    }
    if (settings.scroll_min_amount_px > settings.scroll_max_amount_px) {
      setError("Min scroll amount cannot exceed max.");
      return;
    }
    if (settings.scroll_min_speed_px_s > settings.scroll_max_speed_px_s) {
      setError("Min scroll speed cannot exceed max.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setError("Not signed in.");
      return;
    }

    const { error: upsertError } = await supabase.from("user_settings").upsert({
      user_id: user.id,
      ...settings,
    });
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSaved(true);
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading settings…</p>;
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Idle-bypass scrolling mimics human activity when typing is not running.
        Only one of typing or scrolling can be active at a time.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-6 space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.scroll_enabled}
            onChange={(e) =>
              setSettings((s) => ({ ...s, scroll_enabled: e.target.checked }))
            }
            className="mt-1 size-4 rounded border-border"
          />
          <span>
            <span className="block text-sm font-medium">
              Enable idle-bypass scrolling
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              Randomly scroll up/down and pause on the active tab when no clip
              is running.
            </span>
          </span>
        </label>

        <fieldset
          disabled={!settings.scroll_enabled}
          className="grid grid-cols-2 gap-3 disabled:opacity-50"
        >
          <legend className="col-span-2 mb-1 text-sm font-medium">
            Pause between scrolls (ms)
          </legend>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Min</span>
            <input
              type="number"
              min={0}
              value={settings.scroll_min_pause_ms}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  scroll_min_pause_ms: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Max</span>
            <input
              type="number"
              min={0}
              value={settings.scroll_max_pause_ms}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  scroll_max_pause_ms: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
            />
          </label>
        </fieldset>

        <fieldset
          disabled={!settings.scroll_enabled}
          className="grid grid-cols-2 gap-3 disabled:opacity-50"
        >
          <legend className="col-span-2 mb-1 text-sm font-medium">
            Scroll distance (px)
          </legend>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Min</span>
            <input
              type="number"
              min={0}
              value={settings.scroll_min_amount_px}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  scroll_min_amount_px: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Max</span>
            <input
              type="number"
              min={0}
              value={settings.scroll_max_amount_px}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  scroll_max_amount_px: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
            />
          </label>
        </fieldset>

        <fieldset
          disabled={!settings.scroll_enabled}
          className="grid grid-cols-2 gap-3 disabled:opacity-50"
        >
          <legend className="col-span-2 mb-1 text-sm font-medium">
            Scroll speed (px/sec)
          </legend>
          <p className="col-span-2 -mt-1 mb-1 text-xs text-muted">
            Each scroll burst picks a random speed in this range, so it
            speeds up and slows down like a real person - never faster than
            the max.
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Min</span>
            <input
              type="number"
              min={1}
              value={settings.scroll_min_speed_px_s}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  scroll_min_speed_px_s: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted">Max (cap)</span>
            <input
              type="number"
              min={1}
              value={settings.scroll_max_speed_px_s}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  scroll_max_speed_px_s: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
            />
          </label>
        </fieldset>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">
            Settings saved. The extension will pick them up on its next poll.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
