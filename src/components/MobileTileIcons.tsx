import type { ComponentType, SVGProps } from 'react';

export type TileIconProps = SVGProps<SVGSVGElement> & {
  strokeWidth?: number | string;
};

export type TileIconComponent = ComponentType<TileIconProps>;

const BASE_SVG = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function ContributionIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.75" className="amanah-icon-duotone" />
      <circle cx="12" cy="12" r="2.75" className="amanah-icon-duotone-strong" />
      <path d="M6 9.5h.01M18 14.5h.01" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function QardHasanIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <circle cx="14.5" cy="7" r="3.25" className="amanah-icon-duotone-strong" />
      <rect x="2.5" y="13.5" width="3.5" height="6.5" rx="1.25" className="amanah-icon-duotone" />
      <path d="M7.5 14.5a2.4 2.4 0 0 1 2.4-2.4H13a1.4 1.4 0 0 1 0 2.8h-2.5" stroke="none" className="amanah-icon-duotone" />
      <path d="M6 16.5h1.2l4.1 2.2a2 2 0 0 0 1.85 0l6.6-3.3a1.45 1.45 0 0 0-1.35-2.58L13.7 15H9.5" />
    </svg>
  );
}

export function RequestLoanIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M14 2.75H6.5A2.25 2.25 0 0 0 4.25 5v14a2.25 2.25 0 0 0 2.25 2.25h11a2.25 2.25 0 0 0 2.25-2.25V8.5L14 2.75Z"
        className="amanah-icon-duotone"
      />
      <path d="M14 2.75V8.5h5.75" />
      <path d="M12 11.75v5.5M9.25 14.5h5.5" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function MyAmanahIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <rect x="3" y="6.5" width="18" height="13" rx="2.75" className="amanah-icon-duotone" />
      <path d="M6.5 6.5V5.25A2.25 2.25 0 0 1 8.75 3h7.5a2.25 2.25 0 0 1 2.25 2.25V6.5" />
      <path d="M15.5 11.25h5.5v3.5h-5.5a1.75 1.75 0 0 1 0-3.5Z" className="amanah-icon-duotone-strong" />
      <circle cx="15.75" cy="13" r="0.7" fill="var(--amanah-icon-accent, currentColor)" stroke="none" />
    </svg>
  );
}

export function MembersIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <circle cx="9.25" cy="8.25" r="3.25" className="amanah-icon-duotone-strong" />
      <path d="M3 19.25c0-3.1 2.75-5.25 6.25-5.25s6.25 2.15 6.25 5.25" className="amanah-icon-duotone" />
      <path d="M16 6.25a2.75 2.75 0 0 1 0 5.25M17.25 14.3c2.25.55 3.75 2.2 3.75 4.95" />
    </svg>
  );
}

export function CommunityIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M14.5 4.5h-9A2.5 2.5 0 0 0 3 7v6.25a2.5 2.5 0 0 0 2.5 2.5h1.25v2.75l3.25-2.75h4.5a2.5 2.5 0 0 0 2.5-2.5V7a2.5 2.5 0 0 0-2.5-2.5Z"
        className="amanah-icon-duotone"
      />
      <path d="M17.25 9.25h1.5A2.25 2.25 0 0 1 21 11.5v4.25a2.25 2.25 0 0 1-2.25 2.25H18v2l-2.5-2h-3.25" />
      <path d="M7.25 10h.01M10 10h.01M12.75 10h.01" strokeWidth={2.25} className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function BalanceSheetIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M4 8.25h16V5.5A2.5 2.5 0 0 0 17.5 3h-11A2.5 2.5 0 0 0 4 5.5v2.75Z"
        stroke="none"
        className="amanah-icon-accent-fill"
      />
      <rect x="4" y="3" width="16" height="18" rx="2.5" className="amanah-icon-duotone" />
      <path d="M4 8.5h16" className="amanah-icon-accent-stroke" />
      <path d="M4 13h16M10.5 8.5V21" />
    </svg>
  );
}

export function TransactionHistoryIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M5.25 3.5h13.5v16.75l-2.25-1.5-2.25 1.5-2.25-1.5-2.25 1.5-2.25-1.5-2.25 1.5V3.5Z"
        className="amanah-icon-duotone"
      />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function StatisticsIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <rect x="4.5" y="13" width="3.5" height="6.5" rx="1" className="amanah-icon-duotone" />
      <rect x="10.25" y="9" width="3.5" height="10.5" rx="1" className="amanah-icon-duotone" />
      <rect x="16" y="5" width="3.5" height="14.5" rx="1" className="amanah-icon-duotone-strong" />
      <path d="M3 19.5h18" />
    </svg>
  );
}

export function ManagerCycleIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M3.5 9.25h17V7.25a2.5 2.5 0 0 0-2.5-2.5H6a2.5 2.5 0 0 0-2.5 2.5v2Z"
        stroke="none"
        className="amanah-icon-accent-fill"
      />
      <rect x="3.5" y="4.75" width="17" height="15.5" rx="2.5" className="amanah-icon-duotone" />
      <path d="M8 2.75v3.5M16 2.75v3.5M3.5 9.5h17" />
      <path d="M8.5 13.75h4.25m2.75 0h.01M8.5 16.75h.01m2.74 0h4.25" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function VotingIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <rect x="6.5" y="3.5" width="11" height="10.5" rx="1.75" className="amanah-icon-duotone" />
      <path d="M3.5 14h17v4.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V14Z" className="amanah-icon-duotone" />
      <path d="m9.5 8.75 1.75 1.75 3.5-3.5" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function MonthlyPulseIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <rect x="3.5" y="4.75" width="17" height="15.5" rx="2.5" className="amanah-icon-duotone" />
      <path d="M8 2.75v3.5M16 2.75v3.5M3.5 9.25h17" />
      <path d="m9 14.5 2 2 4-4" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function ActiveBorrowersIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path d="m3 9.25 9-5.5 9 5.5H3Z" className="amanah-icon-duotone-strong" />
      <path d="M6 9.5v7.25M10 9.5v7.25M14 9.5v7.25M18 9.5v7.25" />
      <rect x="3" y="17" width="18" height="3.25" rx="1" className="amanah-icon-duotone" />
      <path d="M3 20.25h18" />
    </svg>
  );
}

export function ApprovalQueuesIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" className="amanah-icon-duotone" />
      <path d="m7.5 9.25 1.4 1.4 2.6-2.6M7.5 14.75l1.4 1.4 2.6-2.6" className="amanah-icon-accent-stroke" />
      <path d="M13.5 9.25h3.5M13.5 14.75h3.5" />
    </svg>
  );
}

export function CharterIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M7.5 3.75h9.25a2.25 2.25 0 0 1 2.25 2.25v11.5a2.75 2.75 0 0 1-2.75 2.75H6.5A2.5 2.5 0 0 1 4 17.75V6.25a2.5 2.5 0 0 1 2.5-2.5h1Z"
        stroke="none"
        className="amanah-icon-duotone"
      />
      <path d="M8 20.25A2.5 2.5 0 0 1 5.5 17.75V6a2.25 2.25 0 0 1 2.25-2.25h9.5A2.25 2.25 0 0 1 19.5 6v1.75h-2.75" />
      <path d="M16.75 7.75v9.75a2.75 2.75 0 0 1-2.75 2.75H7.75" />
      <path d="M8.75 8.5h5M8.75 12h5M8.75 15.5h3.25" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function HowItWorksIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <circle cx="12" cy="12" r="9" className="amanah-icon-duotone" />
      <polygon points="15.5 8.5 13.75 13.75 8.5 15.5 10.25 10.25 15.5 8.5" className="amanah-icon-duotone-strong" />
    </svg>
  );
}

export function AboutSecurityIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M12 2.75 4.5 5.8v5.8c0 4.65 3.15 8.85 7.5 9.95 4.35-1.1 7.5-5.3 7.5-9.95V5.8L12 2.75Z"
        className="amanah-icon-duotone"
      />
      <path d="m9.25 12.25 1.9 1.9 3.75-3.9" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function FaqIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M3.5 5.5A2.5 2.5 0 0 1 6 3h4.5A1.5 1.5 0 0 1 12 4.5v13a1.5 1.5 0 0 0-1.5-1.5H6a2.5 2.5 0 0 0-2.5 2.5v-13Z"
        stroke="none"
        className="amanah-icon-duotone"
      />
      <path
        d="M20.5 5.5A2.5 2.5 0 0 0 18 3h-4.5A1.5 1.5 0 0 0 12 4.5v13a1.5 1.5 0 0 1 1.5-1.5H18a2.5 2.5 0 0 1 2.5 2.5v-13Z"
        stroke="none"
        className="amanah-icon-duotone"
      />
      <path d="M12 4.5A1.5 1.5 0 0 0 10.5 3H6a2.5 2.5 0 0 0-2.5 2.5v14A2.5 2.5 0 0 1 6 17h4.5a1.5 1.5 0 0 1 1.5 1.5V4.5Zm0 0A1.5 1.5 0 0 1 13.5 3H18a2.5 2.5 0 0 1 2.5 2.5v14A2.5 2.5 0 0 0 18 17h-4.5a1.5 1.5 0 0 0-1.5 1.5V4.5Z" />
      <path d="M15.25 9.75a1.5 1.5 0 0 1 1.75 1.48c0 .9-.95 1.25-1.35 1.72M15.75 15h.01" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function PublicWebsiteIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <circle cx="12" cy="12" r="9" className="amanah-icon-duotone" />
      <ellipse cx="12" cy="12" rx="4" ry="9" className="amanah-icon-accent-stroke" />
      <path d="M3.5 9.25h17M3.5 14.75h17" />
    </svg>
  );
}

export function NotificationBellIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.75-2 6.75h16s-2-1.75-2-6.75Z"
        className="amanah-icon-duotone"
      />
      <path d="M10.25 18.75a2 2 0 0 0 3.5 0" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function ProfileIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <circle cx="12" cy="8.25" r="3.75" className="amanah-icon-duotone-strong" />
      <path d="M4.75 19.75c0-3.45 3.25-5.75 7.25-5.75s7.25 2.3 7.25 5.75" className="amanah-icon-duotone" />
    </svg>
  );
}

export function ManagerDeskIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2.5" className="amanah-icon-duotone" />
      <path d="M8.5 7V5.25A1.75 1.75 0 0 1 10.25 3.5h3.5a1.75 1.75 0 0 1 1.75 1.75V7" />
      <path d="M3 12.25h18" />
      <path d="M10.5 12.25h3" strokeWidth={2.25} className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function MemberRegistryIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <circle cx="9.75" cy="8.25" r="3.5" className="amanah-icon-duotone" />
      <path d="M3.25 19.5c0-3.25 2.9-5.5 6.5-5.5 1.35 0 2.6.3 3.65.85" />
      <path d="m15.25 16.75 1.75 1.75 3.5-3.75" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function ManagerContributionsIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M12 2.75 14.3 4.4l2.85-.15.75 2.75 2.4 1.55-.75 2.75.75 2.75-2.4 1.55-.75 2.75-2.85-.15L12 19.85l-2.3-1.65-2.85.15-.75-2.75L3.7 14.05l.75-2.75-.75-2.75L6.1 7l.75-2.75 2.85.15L12 2.75Z"
        className="amanah-icon-duotone"
      />
      <path d="m9.25 11.5 1.85 1.85 3.65-3.65" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function ManagerLoansIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <rect x="4.5" y="4.5" width="15" height="16.5" rx="2.25" className="amanah-icon-duotone" />
      <rect x="8.5" y="2.75" width="7" height="3.25" rx="1" className="amanah-icon-duotone-strong" />
      <path d="M8.5 10.5h7M8.5 14h7M8.5 17.5h4.25" />
    </svg>
  );
}

export function ManagerInstallmentsIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path d="M19.5 10.25V7a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 7v11A2.25 2.25 0 0 0 6 20.25h4.5" />
      <path d="M7.5 2.75v3.5M15.5 2.75v3.5M3.75 9.25h15.75" />
      <circle cx="16.25" cy="16.25" r="4.25" className="amanah-icon-duotone-strong" />
      <path d="M16.25 14.4v2l1.35.9" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function SiteSettingsIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path d="M4 7h9.75M18.25 7H20M4 17h3.75M12.25 17H20M4 12h1.75M10.25 12H20" />
      <circle cx="16" cy="7" r="2.25" className="amanah-icon-duotone-strong" />
      <circle cx="8" cy="12" r="2.25" className="amanah-icon-duotone-strong" />
      <circle cx="10" cy="17" r="2.25" className="amanah-icon-duotone-strong" />
    </svg>
  );
}

export function SiteActivityIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <rect x="3" y="3.5" width="18" height="17" rx="3" className="amanah-icon-duotone" />
      <path d="M6 12.25h2.5l2-4.25 3 8 2-3.75H18" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function HomeTabIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M3.75 10.25 12 3.5l8.25 6.75V19a1.75 1.75 0 0 1-1.75 1.75h-13A1.75 1.75 0 0 1 3.75 19v-8.75Z"
        className="amanah-icon-duotone"
      />
      <path d="M9.75 20.75v-6.25h4.5v6.25" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function ClockQueueIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <circle cx="12" cy="12" r="9" className="amanah-icon-duotone" />
      <path d="M12 7.5v4.75l3.25 2" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function VerifiedCheckIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <circle cx="12" cy="12" r="9" className="amanah-icon-duotone" />
      <path d="m8.75 12.25 2.25 2.25 4.5-4.75" className="amanah-icon-accent-stroke" />
    </svg>
  );
}

export function AlertNoticeIcon({ strokeWidth = 1.7, ...props }: TileIconProps) {
  return (
    <svg {...BASE_SVG} strokeWidth={strokeWidth} {...props}>
      <path
        d="M10.45 4.25 3.1 17a1.75 1.75 0 0 0 1.52 2.62h14.76A1.75 1.75 0 0 0 20.9 17L13.55 4.25a1.78 1.78 0 0 0-3.1 0Z"
        className="amanah-icon-duotone"
      />
      <path d="M12 9.5v4M12 16.5h.01" className="amanah-icon-accent-stroke" />
    </svg>
  );
}
