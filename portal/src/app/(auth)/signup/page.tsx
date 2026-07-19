"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  USERNAME_RULES,
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from "@/lib/username";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!isValidUsername(username)) {
      setError(`Username must be ${USERNAME_RULES}`);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const cleanUsername = normalizeUsername(username);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: usernameToEmail(cleanUsername),
      password,
    });

    if (signUpError) {
      setLoading(false);
      setError(
        signUpError.message.toLowerCase().includes("already registered")
          ? "That username is already taken."
          : signUpError.message,
      );
      return;
    }

    if (!data.user) {
      setLoading(false);
      setError("Something went wrong creating your account.");
      return;
    }

    // Only succeeds once, thanks to the unique index on username.
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ user_id: data.user.id, username: cleanUsername });

    setLoading(false);

    if (profileError) {
      setError(
        profileError.message.toLowerCase().includes("duplicate")
          ? "That username is already taken."
          : profileError.message,
      );
      return;
    }

    if (data.session) {
      router.push("/clips");
      router.refresh();
      return;
    }

    setMessage(
      "Account created. If you're not redirected automatically, ask whoever set up this Supabase project to disable email confirmation, then sign in.",
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-1 text-sm text-muted">
          Same username and password work in the Chrome extension.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Username</span>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
            />
            <span className="block text-xs text-muted">{USERNAME_RULES}</span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 outline-none ring-primary focus:ring-2"
            />
          </label>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? "Creating…" : "Sign up"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
