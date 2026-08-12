import { useId, useState } from "react";

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
}

export function PasswordField({
  value,
  onChange,
  label = "Password",
  placeholder = "••••••••",
  autoComplete = "current-password",
  required = true,
  minLength,
  disabled,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const tip = visible ? "Hide password" : "Show password";

  return (
    <label className="auth-field" htmlFor={inputId}>
      <span className="auth-field-label">{label}</span>
      <div className="auth-password">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          disabled={disabled}
          className="auth-password-input"
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={tip}
          aria-pressed={visible}
          title={tip}
          disabled={disabled}
        >
          <span className="auth-tooltip" role="tooltip">
            {tip}
          </span>
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6A3.1 3.1 0 0 0 12 15.1a3.1 3.1 0 0 0 2.5-4.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M6.2 6.5C4.3 7.8 2.9 9.6 2.5 12c0 0 3.5 6.5 9.5 6.5 1.7 0 3.2-.5 4.5-1.2M17.6 15.3c1.4-1.1 2.5-2.6 3-3.3 0 0-3.5-6.5-9.5-6.5-1 .0-1.9.2-2.8.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
