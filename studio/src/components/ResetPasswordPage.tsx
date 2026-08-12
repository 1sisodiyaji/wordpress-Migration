import { useState } from "react";
import { forgotPassword, resetAccountPassword } from "../auth-api";
import { useAuth } from "../hooks/useAuth";
import { PasswordField } from "./PasswordField";
import { StudioLogo } from "./StudioLogo";

interface ForgotProps {
  onBack: () => void;
  onHaveToken: (token: string) => void;
}

export function ForgotPasswordPage({ onBack, onHaveToken }: ForgotProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await forgotPassword(email.trim());
      setMessage(result.message);
      if (result.resetUrl) setResetUrl(result.resetUrl);
      if (result.resetToken) onHaveToken(result.resetToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <button type="button" className="btn btn-ghost auth-back" onClick={onBack}>
        ← Back to sign in
      </button>
      <div className="auth-card auth-card-narrow">
        <h1>Reset password</h1>
        <p className="muted">Enter your account email and we’ll prepare a reset link.</p>
        <form className="auth-form" onSubmit={submit}>
          {error && <div className="alert alert-error">{error}</div>}
          {message && <div className="alert alert-ok">{message}</div>}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
            {resetUrl && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => {
                const q = resetUrl.includes("?") ? resetUrl.slice(resetUrl.indexOf("?") + 1) : "";
                const t = new URLSearchParams(q).get("token");
                if (t) onHaveToken(t);
              }}
            >
              Open reset link (dev)
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

interface ResetProps {
  token: string;
  onDone: () => void;
  onBack: () => void;
}

export function ResetPasswordPage({ token, onDone, onBack }: ResetProps) {
  const { setUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await resetAccountPassword({ token, password });
      setUser(result.user);
      onDone();
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
      <div className="auth-card auth-card-narrow">
        <div className="auth-brand">
          <StudioLogo size={36} />
          <div>
            <h1>Choose a new password</h1>
            <p className="muted">Use at least 8 characters.</p>
          </div>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {error && <div className="alert alert-error">{error}</div>}
          <PasswordField
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
            placeholder="At least 8 characters"
            disabled={busy}
          />
          <PasswordField
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            minLength={8}
            placeholder="Re-enter password"
            disabled={busy}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
