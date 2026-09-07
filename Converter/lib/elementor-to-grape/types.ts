/** GrapeJS component definition (JSON tree passed to editor.setComponents). */
export interface GrapeBlock {
  tagName?: string;
  type?: string;
  name?: string;
  content?: string;
  attributes?: Record<string, string>;
  style?: Record<string, string>;
  classes?: string[];
  /** GrapeJS accepts HTML string or nested block array. */
  components?: GrapeBlock[] | string;
  customData?: Record<string, unknown>;
}

export interface ElementorNode {
  id: string;
  elType: "container" | "widget" | string;
  settings?: Record<string, unknown>;
  elements?: ElementorNode[];
  widgetType?: string;
  isInner?: boolean;
}
