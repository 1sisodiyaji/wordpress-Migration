interface Props {
  sql: File | null;
  wpContent: File | null;
  wpConfig: File | null;
  onSqlChange: (file: File | null) => void;
  onWpContentChange: (file: File | null) => void;
  onWpConfigChange: (file: File | null) => void;
  compact?: boolean;
}

export type { Props as WpFileUploadsProps };
export type WpUploadParts = {
  sql?: File;
  wpContent?: File;
  wpConfig?: File;
};

export function WpFileUploads({
  sql,
  wpContent,
  wpConfig,
  onSqlChange,
  onWpContentChange,
  onWpConfigChange,
  compact,
}: Props) {
  return (
    <div className={`wp-uploads${compact ? " wp-uploads-compact" : ""}`}>
      <p className="hint wp-uploads-intro">
        Upload each part separately. You can add missing files later before clicking Start import.
      </p>

      <label className="wp-upload-row">
        <span className="wp-upload-label">
          <strong>1. Database</strong>
          <small>.sql file</small>
        </span>
        <input
          type="file"
          accept=".sql"
          onChange={(e) => onSqlChange(e.target.files?.[0] ?? null)}
        />
        {sql && <span className="wp-upload-name">{sql.name}</span>}
      </label>

      <label className="wp-upload-row">
        <span className="wp-upload-label">
          <strong>2. wp-content</strong>
          <small>.zip of the wp-content folder</small>
        </span>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => onWpContentChange(e.target.files?.[0] ?? null)}
        />
        {wpContent && <span className="wp-upload-name">{wpContent.name}</span>}
      </label>

      <label className="wp-upload-row">
        <span className="wp-upload-label">
          <strong>3. wp-config.php</strong>
          <small>single PHP file</small>
        </span>
        <input
          type="file"
          accept=".php"
          onChange={(e) => onWpConfigChange(e.target.files?.[0] ?? null)}
        />
        {wpConfig && <span className="wp-upload-name">{wpConfig.name}</span>}
      </label>
    </div>
  );
}
