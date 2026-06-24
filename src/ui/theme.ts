/**
 * Spiny theme tokens.
 *
 * Theme requirement (technical/platform.md): support `system`, `light`, `dark`.
 * Colors are resolved from the user's theme override + the system color scheme.
 */

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceSelected: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  danger: string;
  onDanger: string;
  warning: string;
  warningSurface: string;
  success: string;
  link: string;
  inputBackground: string;
  inputBorder: string;
  overlay: string;
  codeBackground: string;
}

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: (units: number) => number;
  radius: { sm: number; md: number; lg: number; pill: number };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    title: number;
  };
}

const SPACING_BASE = 4;

const shared = {
  spacing: (units: number) => SPACING_BASE * units,
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    title: 30,
  },
} as const;

const lightColors: ThemeColors = {
  background: '#FBFBFD',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F2F6',
  surfaceSelected: '#E3E9FF',
  border: '#E2E3E9',
  text: '#15171C',
  textSecondary: '#4A4E59',
  textMuted: '#7C828F',
  primary: '#3B5BFF',
  onPrimary: '#FFFFFF',
  danger: '#D7263D',
  onDanger: '#FFFFFF',
  warning: '#B26A00',
  warningSurface: '#FFF4E0',
  success: '#1F8A4C',
  link: '#2C50F0',
  inputBackground: '#FFFFFF',
  inputBorder: '#D3D5DD',
  overlay: 'rgba(15,18,30,0.45)',
  codeBackground: '#F0F1F5',
};

const darkColors: ThemeColors = {
  background: '#0E0F13',
  surface: '#16181F',
  surfaceAlt: '#1E212A',
  surfaceSelected: '#27324F',
  border: '#2A2D38',
  text: '#F3F4F8',
  textSecondary: '#C2C6D2',
  textMuted: '#878D9C',
  primary: '#5B79FF',
  onPrimary: '#0B0C10',
  danger: '#FF6B7E',
  onDanger: '#1A0408',
  warning: '#F2B45A',
  warningSurface: '#3A2C12',
  success: '#56D08A',
  link: '#8AA0FF',
  inputBackground: '#1B1E27',
  inputBorder: '#333744',
  overlay: 'rgba(0,0,0,0.6)',
  codeBackground: '#1E212A',
};

export const lightTheme: Theme = { scheme: 'light', colors: lightColors, ...shared };
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, ...shared };

export function getTheme(scheme: ColorScheme): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}
