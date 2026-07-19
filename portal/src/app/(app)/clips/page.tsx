"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipCard } from "@/components/ClipCard";
import { ClipForm, type ClipFormValues } from "@/components/ClipForm";
import { createClient } from "@/lib/supabase/client";
import type { Clip } from "@/lib/types";

export default function ClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClips = useCallback(async () => {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("clips")
      .select("*")
      .order("created_at", { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setClips((data as Clip[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  async function handleCreate(values: ClipFormValues) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    const { error: insertError } = await supabase.from("clips").insert({
      ...values,
      user_id: user.id,
    });
    if (insertError) throw new Error(insertError.message);
    setShowCreate(false);
    await loadClips();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clips</h1>
          <p className="mt-1 text-sm text-muted">
            Create text clips and run them through the extension. Focus an input
            on the active tab before running.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          {showCreate ? "Close" : "New clip"}
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">New clip</h2>
          <ClipForm
            submitLabel="Create clip"
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading clips…</p>
      ) : clips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="font-medium">No clips yet</p>
          <p className="mt-1 text-sm text-muted">
            Create a clip, open a page with a focused input, then hit Run.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} onChanged={loadClips} />
          ))}
        </div>
      )}
    </div>
  );
}
