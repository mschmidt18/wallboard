export interface ThemeValues {
  background: string;
  text_color: "light" | "dark";
  widget_background: "transparent" | "semi-transparent" | "solid";
  font_family: "system" | "serif" | "monospace" | "rounded";
  font_scale: "small" | "medium" | "large";
}

export const DEFAULT_THEME: ThemeValues = {
  background: "#1a1a2e",
  text_color: "light",
  widget_background: "semi-transparent",
  font_family: "system",
  font_scale: "medium",
};
