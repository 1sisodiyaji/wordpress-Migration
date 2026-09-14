import { useState } from "react";
import { Button, Field, Input, Label } from "./ui";

interface Props {
  onClose: () => void;
  onCreate: (body: { name: string }) => Promise<void>;
}

export function NewProjectPanel({ onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a project name");
      return;
    }
    setBusy(true);
    try {
      await onCreate({ name: trimmed });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl bg-studio-surface shadow-studio"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-studio-border px-5 py-4">
          <h2 className="m-0 text-[1.1rem] font-extrabold tracking-tight">New project</h2>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full border-0 bg-transparent text-2xl text-studio-muted hover:bg-coral-soft hover:text-coral"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 p-5">
          <p className="m-0 text-sm text-studio-muted">
            Name the project first. Next you can upload an export ZIP or sync from a WordPress URL.
          </p>

          <Field>
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My website"
              autoComplete="off"
              autoFocus
            />
          </Field>

          {error && (
            <div className="rounded-[1.125rem] bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={busy}>
              {busy ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
