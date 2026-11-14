import { MotionConfig } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { MasterPanelPage } from './components/MasterPanelPage.tsx';
import { ParentCabinetPage } from './components/ParentCabinetPage.tsx';
import { PublicSchedulePage } from './components/PublicSchedulePage.tsx';
import { TopNav, type ActiveView } from './components/TopNav.tsx';

const STORAGE_KEY_FAMILY_TOKEN = 'yasna_active_family_token';

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
  const [pathname, setPathname] = useState<string>(() => window.location.pathname);
  const [savedFamilyToken, setSavedFamilyToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_FAMILY_TOKEN);
    } catch {
      return null;
    }
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
      sessionStorage.setItem(STORAGE_KEY_FAMILY_TOKEN, token);
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  const route = parseRoute(pathname);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#F5F6F8] text-[#111827]">
        <TopNav
          activeView={route.view}
          onNavigate={navigate}
          savedFamilyToken={savedFamilyToken}
        />

        <main>
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
      </div>
    </MotionConfig>
  );
}
