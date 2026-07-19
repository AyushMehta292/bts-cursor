import { useEffect, useState, type FormEvent } from "react";
import { getSupabase } from "../lib/supabase";
import type { ExtensionStatus, Mode } from "../lib/types";
import { usernameToEmail } from "../lib/username";

function modeLabel(mode: Mode) {
  switch (mode) {
    case "typing":
      return "Typing";
    case "paused":
      return "Paused";
    case "scrolling":
      return "Scrolling (idle-bypass)";
    default:
      return "Idle";
  }
}

function modeColor(mode: Mode) {
  switch (mode) {
    case "typing":
      return "#16a34a";
    case "paused":
      return "#d97706";
    case "scrolling":
      return "#2563eb";
    default:
      return "#64748b";
  }
}

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  async function refreshStatus() {
    try {
      const next = (await chrome.runtime.sendMessage({
        type: "GET_STATUS",
      })) as ExtensionStatus;
      setStatus(next);
      if (next.lastError) setError(next.lastError);
    } catch {
      // background may be restarting
    }
  }

  useEffect(() => {
    async function boot() {
      await refreshStatus();
      setBooting(false);
    }
    void boot();
    const id = window.setInterval(() => void refreshStatus(), 1500);
    return () => window.clearInterval(id);
  }, []);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (signInError) {
        setError("Invalid username or password.");
      } else {
        await chrome.runtime.sendMessage({ type: "AUTH_CHANGED" });
        await refreshStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
      await chrome.runtime.sendMessage({ type: "AUTH_CHANGED" });
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const signedIn = !!status?.username;

  return (
    <div className="shell">
      <header>
        <h1>Bypass</h1>
        <p className="sub">Human-like typing & idle scroll</p>
      </header>

      {booting ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="status-card">
            <div className="row">
              <span className="label">Status</span>
              <span
                className="badge"
                style={{ background: modeColor(status?.mode ?? "idle") }}
              >
                {modeLabel(status?.mode ?? "idle")}
              </span>
            </div>
            <div className="row">
              <span className="label">Account</span>
              <span className="value">
                {status?.username ?? "Not signed in"}
              </span>
            </div>
            {status?.activeRunId && (
              <div className="row">
                <span className="label">Run</span>
                <span className="value mono">
                  {status.activeRunId.slice(0, 8)}…
                </span>
              </div>
            )}
          </div>

          {!signedIn ? (
            <form onSubmit={onLogin} className="form">
              <label>
                Username
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
              <p className="hint">
                Use the same username and password as the portal. Focus an
                input on a page, then click Run in the portal.
              </p>
            </form>
          ) : (
            <div className="signed-in">
              <p className="hint">
                Extension is polling for runs. Pause/Resume/Stop from the
                portal. Typing and scrolling never run at the same time.
              </p>
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={() => void onLogout()}
              >
                Log out
              </button>
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  );
}
