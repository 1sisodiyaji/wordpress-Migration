import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface Props {
  onRegister: () => void;
  onForgot: () => void;
  onSuccess: () => void;
  onBack: () => void;
}

export function LoginPage({ onRegister, onForgot, onSuccess, onBack }: Props) {
  const { login, loginSocial } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: "google" | "github") {
    setError(null);
    setBusy(true);
    try {
      await loginSocial(provider);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <button type="button" className="btn btn-ghost auth-back" onClick={onBack}>
        ← Back
      </button>
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">M</span>
          <div>
            <h1>Welcome back</h1>
            <p className="muted">Sign in to your Migration Studio workspace</p>
          </div>
        </div>

        <div className="social-stack">
          <button
            type="button"
            className="btn btn-social"
            disabled={busy}
            onClick={() => social("google")}
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <button
            type="button"
            className="btn btn-social"
            disabled={busy}
            onClick={() => social("github")}
          >
            <GitHubIcon />
            Continue with GitHub
          </button>
        </div>

        <div className="auth-divider">
          <span>or email</span>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {error && <div className="alert alert-error">{error}</div>}
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </label>
          <div className="auth-form-row">
            <button type="button" className="link-btn" onClick={onForgot}>
              Forgot password?
            </button>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Signing in…" : "Sign in with email"}
          </button>
        </form>

        <p className="auth-footer">
          No account yet?{" "}
          <button type="button" className="link-btn" onClick={onRegister}>
            Create one
          </button>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3l-.8.6-2.5 1.9C5 19.4 8.2 21.2 12 21.2c2.4 0 4.4-.8 5.9-2.1l-3.1-2.4c-.8.6-1.9.9-2.8.9-2.2 0-4-1.5-4.7-3.5z"
      />
      <path
        fill="#4A90E2"
        d="M3.3 7.2C2.5 8.7 2 10.3 2 12s.5 3.3 1.3 4.8l3.3-2.5C6.3 13.5 6 12.8 6 12s.3-1.5.6-2.3L3.3 7.2z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.8c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.4 2.9 14.4 2 12 2 8.2 2 5 3.8 3.3 7.2l3.3 2.5C7.9 7.3 9.8 5.8 12 5.8z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.8c.85 0 1.71.12 2.51.35 1.91-1.32 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .26.18.58.69.48A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
    </svg>
  );
}
