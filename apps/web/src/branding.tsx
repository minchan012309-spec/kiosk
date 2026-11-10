import { createContext, useContext, useEffect, useState } from "react";
import { api, subscribe } from "./api";
type Theme = "light" | "dark" | "system";
type Branding = {
  title: string;
  subtitle?: string;
  logoUrl?: string;
  defaultTheme?: Theme;
};
const defaults: Branding = {
  title: "PC CLUB",
  subtitle: "FESTIVAL EDITION",
  logoUrl: "",
  defaultTheme: "dark",
};
const Context = createContext<{
  branding: Branding;
  theme: Theme;
  setTheme: (v: Theme) => void;
}>({ branding: defaults, theme: "system", setTheme: () => {} });
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<Branding>(() => {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem("pcclub.branding") || "{}"),
      };
    } catch {
      return defaults;
    }
  });
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("pcclub.theme") as Theme) || "system",
  );
  useEffect(() => {
    const sync = () =>
      api("/public/state")
        .then((r) => {
          setBranding({ ...defaults, ...r.settings });
          localStorage.setItem("pcclub.branding", JSON.stringify(r.settings));
        })
        .catch(() => {});
    void sync();
    return subscribe(() => void sync());
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const selected = localStorage.getItem("pcclub.theme")
        ? theme
        : branding.defaultTheme || theme;
      document.documentElement.dataset.theme =
        selected === "system" ? (media.matches ? "dark" : "light") : selected;
      document.title = branding.title + " · FESTIVAL";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, branding]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === "pcclub.theme") {
        const next = event.newValue;
        if (next === "light" || next === "dark" || next === "system")
          setThemeState(next);
      }
      if (event.key === "pcclub.branding") {
        try {
          setBranding({ ...defaults, ...JSON.parse(event.newValue || "{}") });
        } catch {}
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const setTheme = (v: Theme) => {
    localStorage.setItem("pcclub.theme", v);
    setThemeState(v);
  };
  return (
    <Context.Provider
      value={{
        branding,
        theme: localStorage.getItem("pcclub.theme")
          ? theme
          : branding.defaultTheme || theme,
        setTheme,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useBranding = () => useContext(Context);
export function ThemeSwitcher() {
  const { theme, setTheme } = useBranding();
  return (
    <div className="theme-switch" role="group" aria-label="화면 모드">
      {(
        [
          ["light", "☀ 라이트"],
          ["dark", "☾ 다크"],
          ["system", "◐ 자동"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          aria-pressed={theme === v}
          className={theme === v ? "active" : ""}
          onClick={() => setTheme(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
