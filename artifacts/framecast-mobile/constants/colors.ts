/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#54248F',
    tint: '#54248F',

    // Core surfaces
    background: '#FFFFFF',
    foreground: '#54248F',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#54248F',

    // Primary action color (buttons, links, active states)
    primary: '#54248F',
    primaryForeground: '#FFFFFF',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#FFDF4F',
    secondaryForeground: '#54248F',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#FFF7CC',
    mutedForeground: '#54248F',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#FFDF4F',
    accentForeground: '#54248F',
    // Category surfaces use tints of the shared purple/yellow palette.
    tabVideo: '#54248F',
    tabImagesSurface: '#FFF7CC',
    tabVideosSurface: '#EEE8F5',
    tabUrlSurface: '#FFFFFF',

    // Destructive actions (delete, error states)
    destructive: '#54248F',
    destructiveForeground: '#FFDF4F',

    // Borders and input outlines
    border: '#DDD3E9',
    input: '#DDD3E9',
  },

  dark: {
    text: '#54248F',
    tint: '#54248F',
    background: '#FFFFFF',
    foreground: '#54248F',
    card: '#FFFFFF',
    cardForeground: '#54248F',
    primary: '#54248F',
    primaryForeground: '#FFFFFF',
    secondary: '#FFDF4F',
    secondaryForeground: '#54248F',
    muted: '#FFF7CC',
    mutedForeground: '#54248F',
    accent: '#FFDF4F',
    accentForeground: '#54248F',
    tabVideo: '#54248F',
    tabImagesSurface: '#FFF7CC',
    tabVideosSurface: '#EEE8F5',
    tabUrlSurface: '#FFFFFF',
    destructive: '#54248F',
    destructiveForeground: '#FFDF4F',
    border: '#DDD3E9',
    input: '#DDD3E9',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
