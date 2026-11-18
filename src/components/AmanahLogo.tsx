interface AmanahLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'mark' | 'lockup';
  className?: string;
  decorative?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AmanahLogoProps['size']>, string> = {
  xs: 'w-7 h-7 rounded-lg',
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-12 h-12 rounded-2xl',
  lg: 'w-16 h-16 rounded-2xl',
  xl: 'w-24 h-24 rounded-3xl',
};

export function AmanahLogo({
  size = 'sm',
  variant = 'mark',
  className = '',
  decorative = false,
}: AmanahLogoProps) {
  const src = variant === 'lockup' ? '/brand-lockup.png' : '/brand-logo.png';
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden bg-white ring-1 ring-emerald-800/15 dark:ring-white/25 shadow-xs shrink-0 select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src={src}
        alt={decorative ? '' : 'Amanah'}
        aria-hidden={decorative || undefined}
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain"
      />
    </span>
  );
}
