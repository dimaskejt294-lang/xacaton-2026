import React from 'react';

export type BrandLogoVariant = 'theme' | 'red' | 'yellow' | 'black' | 'white';

export const LOGO_PATHS = {
  red: '/assets/aistudio/logo_ya_with_sun_3_1-1_1fe1e7fa.png',
  yellow: '/assets/aistudio/logo_ya_with_sun_3_1-3_f853d135.png',
  black: '/assets/aistudio/logo_ya_with_sun_3_1-0_9209e8e7.png',
  white: '/assets/aistudio/logo_ya_with_sun_3_1-2_c861114d.png',
} as const;

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  className?: string;
  alt?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'theme',
  className = 'h-10 w-10 rounded-full',
  alt = 'Логотип школы труда и столярной мастерской «Ясна»',
}) => {
  if (variant === 'theme') {
    return (
      <span
        className={`relative inline-flex shrink-0 overflow-hidden border border-[#E5E7EB] shadow-sm ${className}`}
      >
        <img
          src={LOGO_PATHS.white}
          alt={alt}
          className="h-full w-full object-cover dark:hidden"
        />
        <img
          src={LOGO_PATHS.black}
          alt={alt}
          className="hidden h-full w-full object-cover dark:block"
        />
      </span>
    );
  }

  return (
    <span className={`relative inline-flex shrink-0 overflow-hidden shadow-sm ${className}`}>
      <img src={LOGO_PATHS[variant]} alt={alt} className="h-full w-full object-cover" />
    </span>
  );
};
