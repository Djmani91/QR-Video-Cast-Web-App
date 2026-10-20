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
    text: '#202A37',
    tint: '#2B644D',

    // Core surfaces
    background: '#F7F5EF',
    foreground: '#202A37',

    // Cards / elevated surfaces
    card: '#FCFAF5',
    cardForeground: '#202A37',

    // Primary action color (buttons, links, active states)
    primary: '#2B644D',
    primaryForeground: '#FCFAF5',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#ECE9DF',
    secondaryForeground: '#202A37',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#ECE9E1',
    mutedForeground: '#6B716F',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#E87854',
    accentForeground: '#202A37',
    // Distinct, reusable accents for the three casting tabs
    tabVideo: '#536FA8',
    tabImagesSurface: '#E7F0E8',
    tabVideosSurface: '#E9EDF6',
    tabUrlSurface: '#F8E9E2',

    // Destructive actions (delete, error states)
    destructive: '#CA3F2C',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#DFDAD0',
    input: '#DFDAD0',
  },

  dark: {
    text: '#F0EDE4',
    tint: '#79C49F',
    background: '#171E25',
    foreground: '#F0EDE4',
    card: '#202A33',
    cardForeground: '#F0EDE4',
    primary: '#79C49F',
    primaryForeground: '#171E25',
    secondary: '#29343D',
    secondaryForeground: '#F0EDE4',
    muted: '#29343D',
    mutedForeground: '#AAB1B2',
    accent: '#EE9778',
    accentForeground: '#171E25',
    tabVideo: '#9BB3E5',
    tabImagesSurface: '#26382F',
    tabVideosSurface: '#293449',
    tabUrlSurface: '#3D2D2A',
    destructive: '#E05D4A',
    destructiveForeground: '#FFFFFF',
    border: '#34414B',
    input: '#34414B',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
