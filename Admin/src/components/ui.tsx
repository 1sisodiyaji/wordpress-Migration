import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("ui-field", className)}>{children}</div>;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("ui-label", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("ui-input", className)} {...props} />;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="ui-hint">{children}</p>;
}

export function Checkbox({
  id,
  checked,
  onChange,
  label,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx("ui-checkbox", disabled && "is-disabled")} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ui-checkbox-box" aria-hidden="true" />
      <span className="ui-checkbox-label">{label}</span>
    </label>
  );
}

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm";
}) {
  return (
    <button
      className={cx("ui-btn", `ui-btn-${variant}`, size === "sm" && "ui-btn-sm", className)}
      {...props}
    />
  );
}

export function Card({
  children,
  className,
  title,
  description,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className={cx("ui-card", className)}>
      {(title || description) && (
        <div className="ui-card-header">
          {title ? <h4 className="ui-card-title">{title}</h4> : null}
          {description ? <p className="ui-card-desc">{description}</p> : null}
        </div>
      )}
      <div className="ui-card-body">{children}</div>
    </div>
  );
}

export function Separator({ label }: { label?: string }) {
  return (
    <div className="ui-sep" role="separator">
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function FileDrop({
  accept,
  file,
  onFile,
  placeholder = "Choose a file",
  disabled,
}: {
  accept?: string;
  file: File | null;
  onFile: (file: File | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cx("ui-filedrop", disabled && "is-disabled")}>
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <span className="ui-filedrop-title">{file ? file.name : placeholder}</span>
      <span className="ui-filedrop-hint">{file ? "Click to replace" : "Click to browse"}</span>
    </label>
  );
}

export function ConfirmDeleteModal({
  title = "Delete project?",
  name,
  detail,
  busy,
  onCancel,
  onConfirm,
}: {
  title?: string;
  name: string;
  detail?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="confirm-delete-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close" disabled={busy}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0 }}>
            Delete <strong>{name}</strong>? This cannot be undone.
          </p>
          {detail ? <p className="muted" style={{ margin: 0 }}>{detail}</p> : null}
          <div className="ui-actions" style={{ justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
