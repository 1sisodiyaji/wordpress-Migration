import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { StudioLogo } from "./StudioLogo";
import { PasswordField } from "./PasswordField";

interface Props {
  onLogin: () => void;
  onSuccess: (verify: { verifyToken: string; verifyUrl: string }) => void;
  onBack: () => void;
}

export function RegisterPage({ onLogin, onSuccess, onBack }: Props) {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await register(name.trim(), email.trim(), password);
      onSuccess({ verifyToken: result.verifyToken, verifyUrl: result.verifyUrl });
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
            <h1>Create your account</h1>
            <p className="muted">Start migrating WordPress sites in minutes</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {error && <div className="alert alert-error">{error}</div>}
          <label className="auth-field">
            <span className="auth-field-label">Full name</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Alex Rivera"
              disabled={busy}
            />
          </label>
          <label className="auth-field">
            <span className="auth-field-label">Work email</span>
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
            autoComplete="new-password"
            minLength={8}
            placeholder="At least 8 characters"
            disabled={busy}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{" "}
          <button type="button" className="link-btn" onClick={onLogin}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
