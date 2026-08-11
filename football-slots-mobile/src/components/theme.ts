/**
 * Shared design tokens — keeps all screens visually consistent.
 * Colors derived from existing Wallet / Settings palette.
 */
export const theme = {
  colors: {
    /** Page background */
    background: "#1a0d3d",
    /** Card / surface background */
    surface: "#250d50",
    /** Slightly lighter card surface */
    surfaceAlt: "#2d1b4e",
    /** Section-group background (translucent) */
    group: "rgba(255,255,255,0.05)",
    /** Primary accent */
    accent: "#FFD700",
    /** Border colour */
    border: "#3d1a6e",
    /** Muted border */
    borderMuted: "#3d2b5e",
    /** Body text */
    textPrimary: "#fff",
    /** Muted / subtitle text */
    textMuted: "#aaa",
    /** Very muted */
    textDim: "#666",
    /** Positive / win */
    positive: "#4CAF50",
    /** Negative / loss */
    negative: "#dc3545",
    /** Danger accent (logout etc.) */
    danger: "#ff4d4d",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
};
