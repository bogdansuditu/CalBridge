export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Applies the selected theme mode to the document root element (html).
 */
export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;

  if (mode === 'system') {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (systemDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } else if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Returns the appropriate Tailwind classes for a primary button.
 * If a custom accentColor is defined, it strips gradient classes so the solid color is shown.
 */
export function getPrimaryButtonClass(
  accentColor: string | null | undefined,
  defaultGradientClass: string = 'bg-linear-to-r from-indigo-500 to-pink-500 hover:from-indigo-600 hover:to-pink-600'
): string {
  if (accentColor) {
    return 'text-white shadow-xs hover:brightness-95 active:scale-98 transition-all cursor-pointer';
  }
  return `${defaultGradientClass} text-white shadow-xs active:scale-98 transition-all cursor-pointer`;
}

/**
 * Returns a React style object with custom background color if an accent color is defined.
 */
export function getPrimaryButtonStyle(accentColor: string | null | undefined): React.CSSProperties {
  if (accentColor) {
    return {
      backgroundColor: accentColor,
      backgroundImage: 'none',
    };
  }
  return {};
}
