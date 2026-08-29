'use client';
/**
 * VELAR — Theming (claro/oscuro + branding por país)
 * ===================================================
 * `ThemeProvider` refleja dos ejes sobre el elemento <html>:
 *   - `data-theme="light|dark"`  → paleta clara u oscura (elección del usuario, se persiste).
 *   - `data-country="CR|CO|BR|AR"` → acento de marca por país (lo pasa la app por prop).
 *
 * El país llega por prop y no desde un contexto de la app: el design system no
 * conoce `lib/country`, así que el paquete es consumible por cualquier app del
 * monorepo. Quien tenga el contexto de país se lo pasa (ver `AppProviders`).
 *
 * Los VALORES viven en `globals.css`; acá solo conmutamos los atributos. El
 * script anti-FOUC (`themeInitScript`) aplica el tema guardado antes del primer
 * paint para que no haya parpadeo.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEMES, type Theme } from './tokens.js';

const STORE_KEY = 'velar.theme';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v);
}

/**
 * Script inline para <head>: aplica el tema persistido (o la preferencia del
 * sistema) antes de hidratar, evitando el flash de tema claro. Se inyecta como
 * string por `dangerouslySetInnerHTML`.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export type ThemeProviderProps = {
  children: ReactNode;
  /**
   * País activo, reflejado como `data-country` en <html> para el acento de
   * marca. Si se omite, el atributo no se toca y solo aplica el tema.
   */
  country?: string;
};

export function ThemeProvider({ children, country }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('light');

  // Sincroniza el tema inicial con lo que el script anti-FOUC ya dejó en <html>.
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (isTheme(current)) {
      setThemeState(current);
      return;
    }
    try {
      const stored = localStorage.getItem(STORE_KEY);
      if (isTheme(stored)) setThemeState(stored);
    } catch {
      /* localStorage no disponible */
    }
  }, []);

  // Aplica y persiste el tema elegido.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORE_KEY, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  // Refleja el país activo como acento de marca.
  useEffect(() => {
    if (!country) return;
    document.documentElement.setAttribute('data-country', country);
  }, [country]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback seguro fuera del provider: no crashea, solo no persiste.
    return { theme: 'light', setTheme: () => {}, toggleTheme: () => {} };
  }
  return ctx;
}

/** Botón accesible para alternar claro/oscuro. */
export function ThemeSwitcher({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={isDark ? 'Tema claro' : 'Tema oscuro'}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant transition hover:bg-surface-container hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container ${className}`}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
