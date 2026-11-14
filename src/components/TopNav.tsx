import { Hammer, Menu, Moon, Sun, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useState } from 'react';
import type { ThemeMode } from '../utils/theme.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

export type ActiveView = 'schedule' | 'parent' | 'master';

interface TopNavProps {
  activeView: ActiveView;
  onNavigate: (path: string) => void;
  savedFamilyToken: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  onNavigate,
  savedFamilyToken,
  theme,
  onToggleTheme,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLink = (path: string) => {
    setMobileOpen(false);
    onNavigate(path);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3 sm:px-6">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleLink('/schedule')}
          className="flex shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C86D2D]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#C86D2D] text-white shadow-sm">
            <Hammer className="h-4 w-4" strokeWidth={1.5} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-[#111827]">
            Ясна
          </span>
        </button>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden items-center gap-6 md:flex">
          <button
            type="button"
            onClick={() => handleLink('/schedule')}
            className={`cursor-pointer whitespace-nowrap shrink-0 text-sm font-medium transition-colors ${
              activeView === 'schedule'
                ? 'text-[#C86D2D]'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            Расписание
          </button>
          <button
            type="button"
            onClick={() => {
              handleLink('/schedule');
              setTimeout(() => {
                document.getElementById('formats-section')?.scrollIntoView({ behavior: 'smooth' });
              }, 80);
            }}
            className="cursor-pointer whitespace-nowrap shrink-0 text-sm font-medium text-[#6B7280] transition-colors hover:text-[#111827]"
          >
            Форматы
          </button>
          <button
            type="button"
            onClick={() => {
              if (savedFamilyToken) {
                handleLink(`/lk/${savedFamilyToken}`);
              } else {
                handleLink('/schedule');
                setTimeout(() => {
                  document.getElementById('family-link-input')?.focus();
                }, 80);
              }
            }}
            className={`cursor-pointer whitespace-nowrap shrink-0 text-sm font-medium transition-colors ${
              activeView === 'parent'
                ? 'text-[#C86D2D]'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            Кабинет родителя
          </button>
          <button
            type="button"
            onClick={() => handleLink('/master')}
            className={`cursor-pointer whitespace-nowrap shrink-0 text-sm font-medium transition-colors ${
              activeView === 'master'
                ? 'text-[#C86D2D]'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            Панель мастера
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex shrink-0 items-center gap-2">
          <PWAInstallButton variant="nav" familyToken={savedFamilyToken} />

          <button
            type="button"
            onClick={() => {
              if (savedFamilyToken && activeView !== 'parent') {
                handleLink(`/lk/${savedFamilyToken}`);
              } else if (activeView !== 'master') {
                handleLink('/master');
              } else {
                handleLink('/schedule');
              }
            }}
            className="hidden min-h-[40px] cursor-pointer items-center justify-center whitespace-nowrap shrink-0 rounded-xl bg-[#C86D2D] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#B05B20] active:scale-[0.98] sm:inline-flex"
          >
            {savedFamilyToken && activeView !== 'parent'
              ? 'Мой кабинет'
              : activeView === 'master'
              ? 'Расписание'
              : 'Вход для мастера'}
          </button>

          <button
            type="button"
            aria-label="Открыть меню"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#111827] md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="inline-flex min-h-[40px] min-w-[40px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827] transition-colors hover:bg-[#F3F4F6]"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-[#C86D2D]" strokeWidth={1.75} />
            ) : (
              <Moon className="h-4 w-4 text-[#6B7280]" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-[#E5E7EB] bg-white px-4 py-3 md:hidden"
          >
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => handleLink('/schedule')}
                className="min-h-[44px] w-full rounded-xl px-3 text-left text-sm font-medium text-[#111827] hover:bg-[#F5F6F8]"
              >
                Расписание и запись
              </button>
              <button
                type="button"
                onClick={() => {
                  if (savedFamilyToken) {
                    handleLink(`/lk/${savedFamilyToken}`);
                  } else {
                    handleLink('/schedule');
                    setTimeout(() => document.getElementById('family-link-input')?.focus(), 100);
                  }
                }}
                className="min-h-[44px] w-full rounded-xl px-3 text-left text-sm font-medium text-[#111827] hover:bg-[#F5F6F8]"
              >
                Кабинет родителя
              </button>
              <button
                type="button"
                onClick={() => handleLink('/master')}
                className="min-h-[44px] w-full rounded-xl bg-[#C86D2D] px-3 text-left text-sm font-medium text-white"
              >
                Панель мастера
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
