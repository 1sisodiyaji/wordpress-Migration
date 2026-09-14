import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";

export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>{children}</div>;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("text-[0.8125rem] font-medium leading-none text-studio-text", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "box-border flex h-[2.625rem] w-full rounded-[14px] border-0 bg-studio-surface px-3 py-2 font-inherit text-sm text-studio-text shadow-[inset_0_0_0_1px_var(--color-studio-border)] transition",
        "placeholder:text-studio-muted",
        "hover:not-disabled:not-focus:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-coral)_35%,var(--color-studio-border))]",
        "focus:shadow-[0_0_0_3px_var(--color-coral-soft)] focus:outline-none focus:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 text-xs leading-snug text-studio-muted">{children}</p>;
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
    <label
      className={cx(
        "inline-flex cursor-pointer items-center gap-2.5 text-sm text-studio-text select-none",
        disabled && "cursor-not-allowed opacity-55",
      )}
      htmlFor={id}
    >
      <input
        id={id}
        type="checkbox"
        className="studio-check absolute h-px w-px opacity-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className="studio-check-box inline-flex size-4 shrink-0 items-center justify-center rounded-md border border-studio-border bg-studio-surface"
        aria-hidden="true"
      />
      <span className="leading-tight">{label}</span>
    </label>
  );
}

const btnBase =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-transparent px-4 font-inherit text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-55";

const btnVariant: Record<string, string> = {
  default: "bg-coral text-white hover:not-disabled:bg-coral-hover",
  secondary: "bg-navy-soft text-navy hover:not-disabled:bg-[color-mix(in_srgb,var(--color-navy)_16%,white)]",
  outline: "bg-navy-soft text-navy hover:not-disabled:bg-[color-mix(in_srgb,var(--color-navy)_16%,white)]",
  ghost: "bg-transparent text-navy hover:not-disabled:bg-navy-soft",
  destructive: "bg-red-600 text-white hover:not-disabled:bg-red-700",
};

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
      className={cx(btnBase, btnVariant[variant], size === "sm" && "h-8 px-3 text-[0.8125rem]", className)}
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
    <div className={cx("overflow-hidden rounded-[1.375rem] bg-studio-row", className)}>
      {(title || description) && (
        <div className="px-4 pt-4 pb-1.5">
          {title ? <h4 className="m-0 text-[0.9375rem] font-extrabold text-studio-text">{title}</h4> : null}
          {description ? <p className="mt-1.5 mb-0 text-[0.8125rem] leading-snug text-studio-muted">{description}</p> : null}
        </div>
      )}
      <div className="flex flex-col gap-3.5 px-4 pt-3.5 pb-4">{children}</div>
    </div>
  );
}

export function Separator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium text-studio-muted lowercase" role="separator">
      <span className="h-px flex-1 bg-studio-border" />
      {label ? <span>{label}</span> : null}
      <span className="h-px flex-1 bg-studio-border" />
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
    <label
      className={cx(
        "relative flex min-h-22 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[1.125rem] border border-dashed border-[color-mix(in_srgb,var(--color-coral)_28%,var(--color-studio-border))] bg-studio-surface p-4 text-center transition",
        "hover:not-[.is-disabled]:border-coral hover:not-[.is-disabled]:bg-coral-soft",
        disabled && "is-disabled cursor-not-allowed opacity-55",
      )}
    >
      <input
        type="file"
        className="pointer-events-none absolute h-px w-px opacity-0"
        accept={accept}
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <span className="text-sm font-semibold text-studio-text">{file ? file.name : placeholder}</span>
      <span className="text-xs text-studio-muted">{file ? "Click to replace" : "Click to browse"}</span>
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
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl bg-studio-surface shadow-studio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-studio-border px-5 py-4">
          <h2 id="confirm-delete-title" className="m-0 text-[1.1rem] font-extrabold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full border-0 bg-transparent text-2xl text-studio-muted hover:bg-coral-soft hover:text-coral disabled:opacity-50"
            onClick={onCancel}
            aria-label="Close"
            disabled={busy}
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <p className="m-0">
            Delete <strong>{name}</strong>? This cannot be undone.
          </p>
          {detail ? <p className="m-0 text-sm text-studio-muted">{detail}</p> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
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
