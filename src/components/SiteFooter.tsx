import { ExternalLink, MapPin, Phone } from 'lucide-react';
import React from 'react';
import { BrandLogo } from './BrandLogo.tsx';

interface SiteFooterProps {
  onNavigate: (path: string) => void;
}

const SOCIAL_LINKS = [
  {
    name: 'ВКонтакте',
    href: 'https://vk.ru/yasna.vibe',
    title: 'Сообщество «Ясна» во ВКонтакте',
    bgClass: 'hover:border-[#0077FF] hover:text-[#0077FF]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M13.162 18.994c.609 0 .858-.406.851-.915-.031-1.917.714-2.949 2.059-1.604 1.488 1.488 1.796 2.519 3.603 2.519h3.2c.808 0 1.126-.26 1.126-.668 0-.863-1.421-2.386-2.625-3.504-1.686-1.565-1.765-1.602-.313-3.486 1.801-2.339 4.157-5.336 2.073-5.336h-3.981c-.772 0-.828.435-1.103 1.083-.995 2.347-2.886 5.387-3.604 4.922-.751-.485-.407-2.406-.35-5.261.015-.754.011-1.271-1.141-1.539a8.06 8.06 0 0 0-1.787-.212c-2.273 0-3.841.953-2.95 1.119 1.571.293 1.42 3.692 1.054 5.16-.638 2.556-3.036-2.024-4.035-4.305-.241-.548-.315-.974-1.175-.974H.962c-.787 0-1.158.261-.933.903.901 2.573 4.305 11.491 12.133 12.132z" />
      </svg>
    ),
  },
  {
    name: 'Telegram',
    href: 'https://t.me/yasnavibe',
    title: 'Telegram-канал мастерской «Ясна»',
    bgClass: 'hover:border-[#229ED9] hover:text-[#229ED9]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    name: 'Написать мастеру',
    href: 'https://t.me/denis_avimskiy',
    title: 'Написать руководителю Денису Авимскому в Telegram',
    bgClass: 'hover:border-[#229ED9] hover:text-[#229ED9]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    name: 'MAX',
    href: 'https://max.ru/id860230279565_biz',
    title: 'Профиль мастерской «Ясна» в мессенджере MAX',
    bgClass: 'hover:border-[#7B3FE4] hover:text-[#7B3FE4]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M12 2C6.477 2 2 6.185 2 11.347c0 2.778 1.298 5.272 3.368 6.982V22l3.47-1.912c1.002.277 2.067.427 3.162.427 5.523 0 10-4.185 10-9.168C22 6.185 17.523 2 12 2zm3.89 12.238h-1.644l-.013-3.681-1.693 2.712h-.954L9.89 10.6v3.638H8.26V8.387h1.684l1.988 3.243 1.976-3.243h1.982v5.851z" />
      </svg>
    ),
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/yasnavibe',
    title: 'Instagram мастерской «Ясна» (@yasnavibe)',
    bgClass: 'hover:border-[#E1306C] hover:text-[#E1306C]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
  },
  {
    name: 'Taplink',
    href: 'https://taplink.cc/yasna_vibe',
    title: 'Все ссылки мастерской на Taplink',
    bgClass: 'hover:border-[#C86D2D] hover:text-[#C86D2D]',
    icon: <ExternalLink className="h-4 w-4" strokeWidth={1.75} />,
  },
] as const;

export const SiteFooter: React.FC<SiteFooterProps> = ({ onNavigate }) => {
  return (
    <footer className="mt-12 border-t border-[#E5E7EB] bg-white/80">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          {/* Brand & Info */}
          <div className="flex items-start gap-3.5">
            <BrandLogo variant="theme" className="h-12 w-12 rounded-full" />
            <div>
              <div className="font-display text-sm font-bold text-[#111827]">
                Ясна — школа труда и столярная мастерская в Сургуте ☀️
              </div>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-[#6B7280]">
                Взрослые и дети от 6 лет: группы, индивидуальные занятия, семейные мастер-классы,
                дни рождения и мастер-классы для компаний.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#6B7280]">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.75} />
                  г. Сургут, ул. 30 лет Победы, 21/3
                </span>
                <a
                  href="tel:+79124120005"
                  className="inline-flex items-center gap-1.5 font-medium text-[#111827] hover:text-[#C86D2D] tabular-nums"
                >
                  <Phone className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.75} />
                  +7 (912) 412-00-05
                </a>
                <span>Руководитель Денис Авимский</span>
              </div>
            </div>
          </div>

          {/* Social Links & Quick Access */}
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2" aria-label="Социальные сети и мессенджеры">
              {SOCIAL_LINKS.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.title}
                  aria-label={item.title}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[#111827] transition-colors ${item.bgClass}`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </a>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-[#6B7280]">
              <button
                type="button"
                onClick={() => onNavigate('/schedule')}
                className="cursor-pointer font-medium text-[#111827] underline-offset-4 hover:underline"
              >
                Расписание
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/master')}
                className="cursor-pointer font-medium text-[#111827] underline-offset-4 hover:underline"
              >
                Вход для мастера
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
