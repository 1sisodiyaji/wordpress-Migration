interface Props {
  sql: File | null;
  wpContent: File | null;
  wpConfig: File | null;
  onSql: (f: File | null) => void;
  onWpContent: (f: File | null) => void;
  onWpConfig: (f: File | null) => void;
  compact?: boolean;
  disabled?: boolean;
}

export function WpFileUploads({
  sql,
  wpContent,
  wpConfig,
  onSql,
  onWpContent,
  onWpConfig,
  compact,
  disabled,
}: Props) {
  return (
    <div className={`flex flex-col gap-3${compact ? " text-sm" : ""}`}>
      <p className={`m-0 text-studio-muted${compact ? " text-xs" : " text-sm"}`}>
        Optional WordPress dump files (SQL, wp-content archive, wp-config).
      </p>
      {(
        [
          ["sql-file", "Database (.sql)", "SQL dump", sql, onSql],
          ["wp-content-file", "wp-content (.zip)", "Themes, plugins, uploads", wpContent, onWpContent],
          ["wp-config-file", "wp-config.php", "Optional config", wpConfig, onWpConfig],
        ] as const
      ).map(([id, label, hint, file, onFile]) => (
        <label key={id} className="flex flex-col gap-1.5 rounded-xl border border-studio-border bg-studio-row p-3">
          <span className="flex flex-col gap-0.5 text-studio-text">
            <strong className="text-sm font-semibold">{label}</strong>
            <small className="font-normal text-studio-muted">{hint}</small>
          </span>
          <input
            id={id}
            type="file"
            disabled={disabled}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          {file && <span className="text-xs text-ok">{file.name}</span>}
        </label>
      ))}
    </div>
  );
}
