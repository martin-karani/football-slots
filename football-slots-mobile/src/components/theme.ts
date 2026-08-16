/**
 * Shared design tokens — premium dark sports/fintech aesthetic.
 * Colors and typography derived from the Football Slots Redesign reference.
 */

// ─── Colors ───────────────────────────────────────────────
const background = "#070A12";
const surface = "#0C1426";
const surfaceElevated = "#101830";
const card = "#131C33";
const cardDark = "#101A32";
const border = "#1A2744";
const borderMuted = "rgba(148, 163, 208, 0.12)";
const borderLight = "rgba(148, 163, 208, 0.22)";

const textPrimary = "#F5F8FF";
const textSecondary = "#C7D2EA";
const textMuted = "#93A0BE";
const textDim = "#6B7793";
const textDisabled = "#4B5468";

const gold = "#E7C877";
const goldLight = "#F3D98B";
const goldDark = "#C9A24B";

const blue = "#4C8DFF";
const blueDark = "#2A5CFF";
const blueLight = "#7FB0FF";

const success = "#2FD48A";
const successLight = "#34E39B";
const error = "#FF5468";
const warning = "#F3D98B";

// ─── Wallet mode colors ──────────────────────────────────
const realAccent = gold;
const realLight = "rgba(231, 200, 119, 0.14)";
const realBorder = "rgba(231, 200, 119, 0.35)";

const demoAccent = success;
const demoLight = "rgba(47, 212, 138, 0.14)";
const demoBorder = "rgba(47, 212, 138, 0.35)";

const bonusAccent = "#C4A2FF";
const bonusLight = "rgba(196, 162, 255, 0.14)";
const bonusBorder = "rgba(196, 162, 255, 0.35)";

// ─── Glass / translucent ─────────────────────────────────
const glassLight = "rgba(255, 255, 255, 0.04)";
const glassMedium = "rgba(148, 163, 208, 0.08)";
const glassDark = "rgba(0, 0, 0, 0.5)";

// ─── Status backgrounds ──────────────────────────────────
const successBg = "rgba(47, 212, 138, 0.14)";
const errorBg = "rgba(255, 84, 104, 0.14)";
const warningBg = "rgba(231, 200, 119, 0.16)";
const infoBg = "rgba(76, 141, 255, 0.14)";

export const theme = {
  colors: {
    // Backgrounds
    background,
    surface,
    surfaceElevated,
    card,
    cardDark,

    // Borders
    border,
    borderMuted,
    borderLight,
    borderHighlight: "rgba(255, 255, 255, 0.1)",

    // Text
    textPrimary,
    textSecondary,
    textMuted,
    textDim,
    textDisabled,

    // Primary accents
    gold,
    goldLight,
    goldDark,
    blue,
    blueDark,
    blueLight,

    // Status
    success,
    successLight,
    error,
    warning,

    // Status backgrounds
    successBg,
    errorBg,
    warningBg,
    infoBg,

    // Wallet modes
    realAccent,
    realLight,
    realBorder,
    demoAccent,
    demoLight,
    demoBorder,
    bonusAccent,
    bonusLight,
    bonusBorder,

    // Glass
    glassLight,
    glassMedium,
    glassDark,

    // Legacy aliases
    accent: gold,
    demo: success,
    demoLight: demoLight,
    real: gold,
    realLight: realLight,
    positive: success,
    positiveLight: successBg,
    negative: error,
    negativeLight: errorBg,
    danger: error,
  },

  // ─── Radius scale ──────────────────────────────────────
  radius: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xl2: 28,
    full: 999,
  },

  // ─── Spacing scale ─────────────────────────────────────
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xl2: 40,
    xl3: 48,
  },

  // ─── Shadows ───────────────────────────────────────────
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
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 5,
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
      elevation: 8,
    },
    glowGold: {
      shadowColor: gold,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
    glowBlue: {
      shadowColor: blue,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
    glowSuccess: {
      shadowColor: success,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
  },

  // ─── Fonts ─────────────────────────────────────────────
  fonts: {
    // Headings, branding
    heading: "RussoOne-Regular",
    headingBold: "RussoOne-Regular",

    // Numbers, monetary values, multipliers
    numbers: "ChakraPetch-Bold",
    numbersItalic: "ChakraPetch-BoldItalic",
    numbersRegular: "ChakraPetch-Regular",

    // Body text, labels, navigation
    body: "Exo2-Regular",
    bodyMedium: "Exo2-SemiBold",
    bodyBold: "Exo2-Bold",

    // Legacy aliases
    marquee: "RussoOne-Regular",
    digital: "ChakraPetch-BoldItalic",
    digitalRegular: "ChakraPetch-Bold",
    digitalBody: "ChakraPetch-Regular",
    button: "Exo2-Bold",
  },

  // ─── Typography sizes ──────────────────────────────────
  typography: {
    xs: { size: 10, line: 14 },
    sm: { size: 12, line: 16 },
    md: { size: 14, line: 20 },
    lg: { size: 16, line: 24 },
    xl: { size: 20, line: 28 },
    xl2: { size: 24, line: 32 },
    xl3: { size: 32, line: 40 },
    xl4: { size: 40, line: 48 },
  },
};
