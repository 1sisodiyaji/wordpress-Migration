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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New project</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={submit} className="modal-body">
          <p className="muted" style={{ margin: 0 }}>
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

          {error && <div className="alert alert-error">{error}</div>}

          <div className="ui-actions" style={{ justifyContent: "flex-end" }}>
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
