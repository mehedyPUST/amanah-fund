interface AmanahLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  decorative?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AmanahLogoProps['size']>, string> = {
  xs: 'w-7 h-7 rounded-lg',
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-12 h-12 rounded-2xl',
  lg: 'w-16 h-16 rounded-2xl',
  xl: 'w-20 h-20 rounded-3xl',
};

export function AmanahLogo({
  size = 'sm',
  className = '',
  decorative = false,
}: AmanahLogoProps) {
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden bg-[#072f2e] ring-1 ring-amber-400/40 shadow-xs shrink-0 select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src="/brand-logo.png"
        alt={decorative ? '' : 'Amanah'}
        aria-hidden={decorative || undefined}
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover"
      />
    </span>
  );
}
