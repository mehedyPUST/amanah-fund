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
      className={`inline-flex items-center justify-center overflow-hidden bg-[#047857] ring-1 ring-emerald-400/35 shadow-xs shrink-0 select-none ${SIZE_CLASSES[size]} ${className}`}
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

const LOADING_FRAME_RADIUS: Record<'md' | 'lg' | 'xl', { outer: string; inner: string; glow: string }> = {
  md: {
    outer: 'p-[2px] rounded-[21px]',
    inner: 'p-1 rounded-[19px]',
    glow: '-inset-1 rounded-[24px]',
  },
  lg: {
    outer: 'p-[2.5px] rounded-[24px]',
    inner: 'p-1.5 rounded-[21.5px]',
    glow: '-inset-1.5 rounded-[28px]',
  },
  xl: {
    outer: 'p-[2.5px] rounded-[32px]',
    inner: 'p-1.5 rounded-[29.5px]',
    glow: '-inset-2 rounded-[38px]',
  },
};

export function AmanahLoadingLogo({
  size = 'xl',
  variant = 'lockup',
  className = '',
  decorative = false,
}: {
  size?: 'md' | 'lg' | 'xl';
  variant?: 'mark' | 'lockup';
  className?: string;
  decorative?: boolean;
}) {
  const frame = LOADING_FRAME_RADIUS[size];
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <span
        aria-hidden="true"
        className={`absolute ${frame.glow} bg-emerald-500/12 dark:bg-emerald-400/14 blur-md pointer-events-none`}
      />
      <div
        className={`relative inline-flex items-center justify-center overflow-hidden bg-emerald-500/18 dark:bg-emerald-400/18 shadow-lg shadow-emerald-600/15 dark:shadow-emerald-500/15 ${frame.outer}`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-[-65%] amanah-logo-orbit-sweep pointer-events-none"
        />
        <span
          className={`relative inline-flex items-center justify-center bg-white/95 dark:bg-slate-950/95 ${frame.inner}`}
        >
          <AmanahLogo
            size={size}
            variant={variant}
            decorative={decorative}
            className="shadow-none ring-1 ring-emerald-600/15 dark:ring-emerald-400/20"
          />
        </span>
      </div>
    </div>
  );
}
