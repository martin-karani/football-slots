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
    
    /** Primary accents */
    accent: "#FFD700",
    fun: "#22c55e",       // Green for Fun Mode
    funLight: "rgba(34,197,94,0.15)", // Translucent Fun
    real: "#FFD700",      // Gold for Real Mode
    realLight: "rgba(255,215,0,0.15)", // Translucent Real
    
    /** Border colours */
    border: "#3d1a6e",
    borderMuted: "#3d2b5e",
    borderHighlight: "rgba(255,255,255,0.15)",
    
    /** Translucent elements for glassmorphism */
    glassLight: "rgba(255,255,255,0.06)",
    glassMedium: "rgba(255,255,255,0.1)",
    glassDark: "rgba(0,0,0,0.25)",
    
    /** Text */
    textPrimary: "#fff",
    textMuted: "#aaa",
    textDim: "#666",
    
    /** Status */
    positive: "#4CAF50",
    positiveLight: "rgba(76,175,80,0.15)",
    negative: "#dc3545",
    negativeLight: "rgba(220,53,69,0.15)",
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
  shadows: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    glowFun: {
      shadowColor: "#22c55e",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 6,
    },
    glowReal: {
      shadowColor: "#FFD700",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 6,
    }
  }
};
