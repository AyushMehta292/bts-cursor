"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    async function loadUsername() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle();
      setUsername((data?.username as string | undefined) ?? null);
    }
    void loadUsername();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const linkClass = (href: string) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      pathname.startsWith(href)
        ? "bg-primary text-white"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/clips" className="text-lg font-semibold tracking-tight">
            Bypass
          </Link>
          <nav className="flex gap-1">
            <Link href="/clips" className={linkClass("/clips")}>
              Clips
            </Link>
            <Link href="/settings" className={linkClass("/settings")}>
              Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {username && (
            <span className="text-sm text-muted">
              Signed in as <span className="font-medium text-foreground">{username}</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-slate-100 hover:text-foreground"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
