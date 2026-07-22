import { useEffect, useState } from "react";
import { resendVerification, verifyAccount } from "../auth-api";
import { useAuth } from "../hooks/useAuth";

interface Props {
  token?: string;
  initialVerifyUrl?: string;
  onDone: () => void;
  onBack: () => void;
}

export function VerifyPage({ token, initialVerifyUrl, onDone, onBack }: Props) {
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState<"idle" | "working" | "ok" | "error">(
    token ? "working" : "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState(initialVerifyUrl ?? "");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await verifyAccount(token);
        await refresh();
        if (!cancelled) {
          setStatus("ok");
          setMessage("Email verified. You can continue to your dashboard.");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  async function resend() {
    setStatus("working");
    setMessage(null);
    try {
      const result = await resendVerification();
      setVerifyUrl(result.verifyUrl);
      setStatus("idle");
      setMessage("New verification link ready (dev mode — use the button below).");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  if (user?.emailVerified && status !== "working") {
    return (
      <div className="auth-screen">
        <div className="auth-card auth-card-narrow">
          <h1>You’re verified</h1>
          <p className="muted">Your email is confirmed.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={onDone}>
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <button type="button" className="btn btn-ghost auth-back" onClick={onBack}>
        ← Back
      </button>
      <div className="auth-card auth-card-narrow">
        <h1>Verify your email</h1>
        <p className="muted">
          {user
            ? `We sent a verification link for ${user.email}. In local/dev mode, use the link below.`
            : "Open the verification link from your email, or paste the token from registration."}
        </p>

        {message && (
          <div className={`alert ${status === "error" ? "alert-error" : "alert-ok"}`}>{message}</div>
        )}

        {status === "working" && <p className="muted">Verifying…</p>}

        {status === "ok" ? (
          <button type="button" className="btn btn-primary btn-block" onClick={onDone}>
            Continue to dashboard
          </button>
        ) : (
          <div className="auth-form">
            {verifyUrl && (
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={status === "working"}
                onClick={async () => {
                  const q = verifyUrl.includes("?") ? verifyUrl.slice(verifyUrl.indexOf("?") + 1) : "";
                  const t = new URLSearchParams(q).get("token");
                  if (!t) return;
                  setStatus("working");
                  try {
                    await verifyAccount(t);
                    await refresh();
                    setStatus("ok");
                    setMessage("Email verified. You can continue to your dashboard.");
                  } catch (err) {
                    setStatus("error");
                    setMessage(err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                Verify now
              </button>
            )}
            {user && !user.emailVerified && (
              <button type="button" className="btn btn-ghost btn-block" onClick={resend} disabled={status === "working"}>
                Resend verification link
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-block" onClick={onDone}>
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
