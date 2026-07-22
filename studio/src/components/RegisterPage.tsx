import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface Props {
  onLogin: () => void;
  onSuccess: (verify: { verifyToken: string; verifyUrl: string }) => void;
  onBack: () => void;
}

export function RegisterPage({ onLogin, onSuccess, onBack }: Props) {
  const { register, loginSocial } = useAuth();
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

  async function social(provider: "google" | "github") {
    setError(null);
    setBusy(true);
    try {
      await loginSocial(provider);
      onSuccess({ verifyToken: "", verifyUrl: "" });
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
            <h1>Create your account</h1>
            <p className="muted">Start migrating WordPress sites in minutes</p>
          </div>
        </div>

        <div className="social-stack">
          <button type="button" className="btn btn-social" disabled={busy} onClick={() => social("google")}>
            Continue with Google
          </button>
          <button type="button" className="btn btn-social" disabled={busy} onClick={() => social("github")}>
            Continue with GitHub
          </button>
        </div>

        <div className="auth-divider">
          <span>or email</span>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {error && <div className="alert alert-error">{error}</div>}
          <label>
            Full name
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Alex Rivera"
            />
          </label>
          <label>
            Work email
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </label>
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
