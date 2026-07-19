"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVE_RUN_STATUSES,
  type Clip,
  type RunRequest,
  type RunStatus,
} from "@/lib/types";
import { ClipForm, type ClipFormValues } from "./ClipForm";

type Props = {
  clip: Clip;
  onChanged: () => void;
};

const STATUS_LABEL: Record<RunStatus, string> = {
  pending: "Pending",
  claimed: "Claimed",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

function statusColor(status: RunStatus) {
  switch (status) {
    case "running":
      return "bg-green-100 text-success";
    case "paused":
      return "bg-amber-100 text-warning";
    case "pending":
    case "claimed":
      return "bg-blue-100 text-primary";
    case "failed":
      return "bg-red-100 text-danger";
    default:
      return "bg-slate-100 text-muted";
  }
}

export function ClipCard({ clip, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [activeRun, setActiveRun] = useState<RunRequest | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function poll() {
      const { data } = await supabase
        .from("run_requests")
        .select("*")
        .eq("clip_id", clip.id)
        .in("status", ACTIVE_RUN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setActiveRun((data as RunRequest | null) ?? null);
      }
    }

    poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [clip.id]);

  async function handleUpdate(values: ClipFormValues) {
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("clips")
      .update(values)
      .eq("id", clip.id);
    if (updateError) throw new Error(updateError.message);
    setEditing(false);
    onChanged();
  }

  async function handleDelete() {
    if (!window.confirm(`Delete clip "${clip.name}"?`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("clips")
      .delete()
      .eq("id", clip.id);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onChanged();
  }

  async function handleRun() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError("Not signed in.");
      return;
    }
    const { data, error: insertError } = await supabase
      .from("run_requests")
      .insert({
        user_id: user.id,
        clip_id: clip.id,
        status: "pending",
        progress_index: 0,
      })
      .select("*")
      .single();
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setActiveRun(data as RunRequest);
  }

  async function setRunStatus(status: "running" | "paused" | "cancelled") {
    if (!activeRun) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const patch: Partial<RunRequest> = { status };
    if (status === "cancelled") {
      patch.completed_at = new Date().toISOString();
    }
    const { data, error: updateError } = await supabase
      .from("run_requests")
      .update(patch)
      .eq("id", activeRun.id)
      .select("*")
      .single();
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const next = data as RunRequest;
    if (ACTIVE_RUN_STATUSES.includes(next.status)) {
      setActiveRun(next);
    } else {
      setActiveRun(null);
    }
    setConfirmStop(false);
    setMenuOpen(false);
  }

  const isActive = !!activeRun;
  const isPaused = activeRun?.status === "paused";
  const canPauseResume =
    activeRun?.status === "running" ||
    activeRun?.status === "paused" ||
    activeRun?.status === "claimed";

  if (editing) {
    return (
      <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Edit clip</h2>
        <ClipForm
          initial={clip}
          submitLabel="Save changes"
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{clip.name}</h2>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted">
            {clip.content}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">
              {clip.min_wpm}–{clip.max_wpm} WPM
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">
              Mistakes {clip.mistakes_enabled ? "on" : "off"}
            </span>
            {activeRun && (
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${statusColor(activeRun.status)}`}
              >
                {STATUS_LABEL[activeRun.status]}
                {activeRun.progress_index > 0
                  ? ` · ${activeRun.progress_index} chars`
                  : ""}
              </span>
            )}
          </div>
        </div>

        {/* Overflow menu: edit / delete / stop (kept away from primary Run/Pause) */}
        <div className="relative">
          <button
            type="button"
            aria-label="More actions"
            onClick={() => {
              setMenuOpen((o) => !o);
              setConfirmStop(false);
            }}
            className="rounded-md px-2 py-1 text-lg leading-none text-muted hover:bg-slate-100"
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-border bg-white py-1 shadow-lg">
              <button
                type="button"
                disabled={isActive}
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={isActive || busy}
                onClick={() => {
                  setMenuOpen(false);
                  handleDelete();
                }}
                className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-red-50 disabled:opacity-40"
              >
                Delete
              </button>
              {isActive && (
                <>
                  <div className="my-1 border-t border-border" />
                  {!confirmStop ? (
                    <button
                      type="button"
                      onClick={() => setConfirmStop(true)}
                      className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-red-50"
                    >
                      Stop run…
                    </button>
                  ) : (
                    <div className="px-3 py-2">
                      <p className="mb-2 text-xs text-muted">Stop this run?</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRunStatus("cancelled")}
                          className="rounded bg-danger px-2 py-1 text-xs font-medium text-white hover:bg-danger-hover"
                        >
                          Stop
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmStop(false)}
                          className="rounded px-2 py-1 text-xs text-muted hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {!isActive ? (
          <button
            type="button"
            disabled={busy}
            onClick={handleRun}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
          >
            Run
          </button>
        ) : canPauseResume ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setRunStatus(isPaused ? "running" : "paused")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-muted"
          >
            Waiting for extension…
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </article>
  );
}
