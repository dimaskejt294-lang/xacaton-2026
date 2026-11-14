import { MotionConfig } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { MasterPanelPage } from './components/MasterPanelPage.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { ParentCabinetPage } from './components/ParentCabinetPage.tsx';
import { PublicSchedulePage } from './components/PublicSchedulePage.tsx';
import { SiteFooter } from './components/SiteFooter.tsx';
import { TopNav, type ActiveView } from './components/TopNav.tsx';
import { applyTheme, getInitialTheme, type ThemeMode } from './utils/theme.ts';

const STORAGE_KEY_FAMILY_TOKEN = 'yasna_active_family_token';

function readSavedToken(): string | null {
  try {
    return (
      localStorage.getItem(STORAGE_KEY_FAMILY_TOKEN) ||
      sessionStorage.getItem(STORAGE_KEY_FAMILY_TOKEN)
    );
  } catch (err) {
    console.warn('[App] Не удалось прочитать токен семьи из storage:', err);
    return null;
  }
}

function parseRoute(pathname: string): {
  view: ActiveView;
  familyToken: string | null;
} {
  if (pathname === '/master' || pathname === '/master/login') {
    return { view: 'master', familyToken: null };
  }
  const lkMatch = pathname.match(/^\/lk\/([^/]+)\/?$/);
  if (lkMatch?.[1]) {
    return { view: 'parent', familyToken: decodeURIComponent(lkMatch[1]) };
  }
  return { view: 'schedule', familyToken: null };
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [savedFamilyToken, setSavedFamilyToken] = useState<string | null>(readSavedToken);
  const [pathname, setPathname] = useState<string>(() => {
    const initialPath = window.location.pathname;
    if (initialPath === '/') {
      const token = readSavedToken();
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      if (isStandalone && token) {
        const lkPath = `/lk/${encodeURIComponent(token)}`;
        window.history.replaceState({}, '', lkPath);
        return lkPath;
      }
    }
    return initialPath;
  });

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (nextPath !== window.location.pathname) {
      window.history.pushState({}, '', nextPath);
      setPathname(nextPath);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleTokenValid = useCallback((token: string) => {
    setSavedFamilyToken(token);
    try {
      localStorage.setItem(STORAGE_KEY_FAMILY_TOKEN, token);
      sessionStorage.setItem(STORAGE_KEY_FAMILY_TOKEN, token);
    } catch (err) {
      console.warn('[App] Не удалось сохранить токен семьи в storage:', err);
    }
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  const route = parseRoute(pathname);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-[#F5F6F8] text-[#111827] transition-colors duration-200">
        <TopNav
          activeView={route.view}
          onNavigate={navigate}
          savedFamilyToken={savedFamilyToken}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        <main className="flex-1">
          {route.view === 'schedule' && (
            <PublicSchedulePage
              onNavigate={navigate}
              savedFamilyToken={savedFamilyToken}
            />
          )}

          {route.view === 'parent' && route.familyToken && (
            <ParentCabinetPage
              token={route.familyToken}
              onNavigate={navigate}
              onTokenValid={handleTokenValid}
            />
          )}

          {route.view === 'master' && <MasterPanelPage onNavigate={navigate} />}
        </main>

        <SiteFooter onNavigate={navigate} />
        <OfflineIndicator />
      </div>
    </MotionConfig>
  );
}
