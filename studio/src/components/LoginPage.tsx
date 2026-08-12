import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { StudioLogo } from "./StudioLogo";
import { PasswordField } from "./PasswordField";

interface Props {
  onRegister: () => void;
  onForgot: () => void;
  onSuccess: () => void;
  onBack: () => void;
}

export function LoginPage({ onRegister, onForgot, onSuccess, onBack }: Props) {
  const { login } = useAuth();
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

  return (
    <div className="auth-screen">
      <button type="button" className="btn btn-ghost auth-back" onClick={onBack}>
        ← Back
      </button>
      <div className="auth-card">
        <div className="auth-brand">
          <StudioLogo size={36} />
          <div>
            <h1>Welcome back</h1>
            <p className="muted">Sign in to your Migration Studio workspace</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {error && <div className="alert alert-error">{error}</div>}
          <label className="auth-field">
            <span className="auth-field-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              disabled={busy}
            />
          </label>
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            disabled={busy}
          />
          <div className="auth-form-row">
            <button type="button" className="link-btn" onClick={onForgot}>
              Forgot password?
            </button>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
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
