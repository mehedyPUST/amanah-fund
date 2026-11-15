# Amanah

An encrypted, Shariah-governed cooperative fund management and member community platform built with **Next.js 16 (App Router)**, **Express 4**, **TypeScript**, and **Tailwind CSS v4**. Members contribute monthly via Bank or Mobile Financial Services (MFS), track repayment schedules and participation streaks, democratically vote on 0% interest **Qard Hasan** loans using an anonymized 2/3 supermajority quorum, collaborate in a moderated **Community** hub with encrypted 1-on-1 messaging, and transition accumulated capital into vetted Halal real-economy investments upon reaching a pre-specified maturity date.

---

## Core Architecture & Features

### 1. One-Page Public Site (Scrollspy) & Admin-Gated KYC Onboarding
- **Scrollspy Landing Page (`/`)**: Combines `#overview` (`Hero`), `#architecture` (`About`), and `#governance-charter` (`Rules`) into a single scrollable public experience with `IntersectionObserver` scrollspy underline tracking and smooth click-to-scroll navigation. Dedicated `/about` and `/rules` routes remain available alongside `/login` and `/signup`.
- **2-Stage Google Sign-In + Progressive KYC (`/login`, `/signup`)**:
  - Clicking **Continue with Google** authenticates via Firebase Auth (`email` and `profile` scopes only—isolated from admin Google Workspace scopes) and verifies the RS256 ID token server-side (`POST /api/auth/google`).
  - **Approved Active Members** receive an `amanah_session` HttpOnly JWT cookie and enter `/dashboard`.
  - **Pending or Suspended Accounts** are blocked (`403`) with clear status messaging.
  - **New Applicants** receive a signed `20m` onboarding token and transition to `/signup?mode=google` with Full Name pre-filled, verified email locked, and optional backup password—while all cooperative KYC fields remain mandatory.
- **Extended Application & Document Uploads**:
  - Full Name, Email, Password, Date of Birth, Reference Member (autocomplete), Mobile Number, National ID (NID), Occupation & Organization, Present & Permanent Addresses.
  - **Member Photo** (required) & **Signed Agreement Paper Photo** (optional) uploaded via `/api/upload/imgbb` (with automatic local vault fallback).

### 2. Multi-Page Authenticated Dashboard (`/dashboard?page=...`)
URL-synced (`?page=<sectionId>`) multi-page workspace with `AnimatePresence` transitions, persistent light/dark theme toggle, and real-time Server-Sent Events (`/api/events`) updates:

- **Member Pages**:
  - **Fund Overview (`fund-overview`)**: Central balance & liquidity KPIs, pre-maturity countdown, **Repayment Schedule** (per-installment progress segments, remaining balance, upcoming deadline countdown, and quick installment payment link), **Contribution Leaderboard** (`Top Contributors` and `Consistent Payers` modes with monthly streak tracking), and **Recent Transactions**.
  - **Monthly Contribution (`monthly-contribution`)**: Bank/MFS deposit submission (`TrxID` and sender account encrypted at rest), yearly **Contribution Goal Tracker** (`12 × monthlyContributionAmount`), and manager/admin verification queue.
  - **Quard Hasan (`quard-hasan`)**: Interactive **Request Qard Hasan Modal**, automated eligibility checks (1 active/pending loan at a time, configurable annual loan quota, pre-maturity window enforcement), installment schedules, and verified repayments.
  - **My Profile (`my-profile`)**: View and update encrypted KYC and contact details.
  - **Notification (`notification`)**: In-app dispatch & alerts center with unread tracking, **Header Notification Bell**, and Gmail notification dispatch sync.
  - **Statistics (`statistics`)**: **Monthly Financial Snapshot**, **Treasury Growth Chart**, and **Audit Trends Charts** built with Recharts.
  - **Ballot (`ballot`)**: Live anonymized **2/3 Supermajority Voting** (`⌈2/3 × active members⌉`) for Qard Hasan loan requests and Halal investment placements. Voter identities are anonymized (`Anonymized Verified Member`) from other members and admins while preserving SHA-256 `signatureHash` auditability.
  - **Transaction History (`transaction-history`)**: Filterable General Ledger with automated **CSV** and **jsPDF** member financial statement exports.
  - **Community (`community`)**: Registered-member discussion feed with category filters, optional image uploads, multi-reactions (`like`, `support`, `celebrate`, `helpful`), and threaded comments. Members can edit/delete their own posts and comments, and exchange **AES-256-GCM encrypted 1-on-1 Private Messages** delivered over targeted user SSE streams. Admins can pin/unpin, lock/unlock comments, hide/restore posts, delete any post or comment, and mute/unmute members.

- **Administrator & Staff Pages**:
  - **Site Activity (`site-activity`)**: Live SSE-streamed audit trail with action/resource/search filters, Pause/Resume live stream toggle, and real-time **SHA-256 hash-chain verification** (`chainValid`).
  - **Member Registry (`member-registry`)**: Combined KYC Onboarding Queue (inspect portraits, signed agreements, NID, and addresses), active directory, and full RBAC management (`admin`, `manager`, `member`, create, edit, approve, suspend, delete).
  - **Site Settings (`site-settings`)**: Fund policy editor (fund name, currency, monthly contribution target, annual loan quota, loan cap, max installment months, maturity date, Halal thesis), **Post-Maturity Halal Ventures** (`Mudarabah`, `Musharakah`, `Murabahah`), **7-Tab Google Sheets Treasury Sync**, and automated CSV compliance exports.

### 3. Central Fund Balance Accounting
```text
Central Balance = (+ Approved Contributions) − (Approved / Active Loans) + (Verified Repayments)
```

### 4. Security, Cryptography & Persistence
- **Single-Origin Express 4 + Next.js 16 Monolith**: Shares origin on port `3000`, avoiding CORS complexity and securing `HttpOnly`, `SameSite` JWT cookies (`amanah_session`, 7d expiry).
- **AES-256-GCM Field Encryption**: Sensitive KYC details, Bank/MFS transaction IDs, loan payout accounts, audit payloads, and 1-on-1 private direct message bodies are encrypted at rest.
- **SHA-256 Hash-Chained Audit Log**: Every mutating operation appends a cryptographic entry linking `prevHash -> entryHash`.
- **Dual Persistence Engine**: Automatically connects to **MongoDB Atlas** (`amanah_coop`) when `MONGODB_URI` is configured, or falls back seamlessly to an encrypted local JSON vault (`data/amanah-coop-vault.json`) serialized via a promise write queue.

---

## Semantic Project Structure

```text
/
├── server.ts                              # Custom Next.js 16 + Express 4 server (port 3000)
├── firebase-applet-config.json            # Firebase client config (Google Sign-In & Workspace)
├── data/                                  # Local JSON vault & image upload fallback storage
├── src/
│   ├── app/
│   │   ├── globals.css                    # Tailwind CSS v4 & custom subtle scrollbars
│   │   ├── layout.tsx                     # Root layout, fonts & AppProviders
│   │   ├── page.tsx                       # One-page scrollspy landing (Hero + About + Rules)
│   │   ├── about/page.tsx                 # Dedicated architecture & security page
│   │   ├── rules/page.tsx                 # Dedicated cooperative rules & Shariah charter page
│   │   ├── login/page.tsx                 # Member Sign In (/login)
│   │   ├── signup/page.tsx                # Membership KYC Application (/signup)
│   │   └── dashboard/page.tsx             # Authenticated Multi-Page Dashboard (/dashboard)
│   ├── components/
│   │   ├── AppProviders.tsx               # Session context, theme state & Google Workspace state
│   │   ├── PublicShell.tsx                # Public layout wrapper
│   │   ├── Navbar.tsx                     # Scrollspy top navigation & theme toggle
│   │   ├── Footer.tsx                     # Public footer with section jump links & theme switcher
│   │   ├── Hero.tsx                       # Landing hero, metrics & Halal investment lifecycle
│   │   ├── About.tsx                      # Governance & cryptographic architecture pillars
│   │   ├── Rules.tsx                      # Shariah & cooperative operating bylaws
│   │   ├── SignInForm.tsx                 # Email/password & Continue with Google sign-in
│   │   ├── SignUpForm.tsx                 # Progressive KYC & Google-verified registration
│   │   ├── DashboardShell.tsx             # Multi-page dashboard shell, sidebar & SSE sync
│   │   ├── HeaderNotificationBell.tsx     # Loan approval & contribution reminder popover
│   │   ├── OverviewView.tsx               # Fund Overview KPIs, quick quota edit & standings
│   │   ├── RepaymentSchedule.tsx          # Active loan installment progress & deadline tracker
│   │   ├── ContributionLeaderboard.tsx    # Top contributors & consistent payers ranking
│   │   ├── RecentTransactions.tsx         # Latest monthly contributions & loan repayments
│   │   ├── ContributionsView.tsx          # Capital deposits submission & manager verification
│   │   ├── ContributionGoalTracker.tsx    # Yearly savings goal progress bar
│   │   ├── LoansView.tsx                  # Qard Hasan eligibility, loan cards & repayments
│   │   ├── RequestQardHasanLoanForm.tsx   # Qard Hasan application form
│   │   ├── RequestQardHasanModal.tsx      # Accessible modal wrapper for loan requests
│   │   ├── StatisticsView.tsx             # Treasury analytics page container
│   │   ├── MonthlyFinancialSnapshot.tsx   # Current-month deposits vs. withdrawn loans
│   │   ├── TreasuryGrowthChart.tsx        # Recharts treasury trajectory chart
│   │   ├── CashflowChart.tsx              # Monthly cashflow breakdown chart
│   │   ├── AuditTrendsCharts.tsx          # Recharts compliance & audit analytics
│   │   ├── VotingView.tsx                 # Anonymized 2/3 member ballots
│   │   ├── HalalProjectsView.tsx          # Post-maturity Halal ventures & ballot proposals
│   │   ├── TransactionHistory.tsx         # Full General Ledger & CSV/PDF exports
│   │   ├── CommunityView.tsx              # Member discussions, reactions, comments & DMs
│   │   ├── NotificationsView.tsx          # Alerts outbox & Gmail notification dispatch
│   │   ├── MemberProfile.tsx              # Encrypted member profile & KYC viewer/editor
│   │   ├── AdminAuditLog.tsx              # Live SSE Site Activity & hash-chain verification
│   │   ├── MemberRegistrySection.tsx      # Unified Member Registry & KYC inspection
│   │   ├── PendingRegistrationsView.tsx   # Admin Onboarding Queue for KYC verification
│   │   ├── ActiveMembersView.tsx          # Active member directory
│   │   ├── AdminUserManagementPanel.tsx   # RBAC roles, create/edit/suspend/delete controls
│   │   ├── AdminSiteSettingsView.tsx      # Site Settings, fund policies & CSV exports
│   │   ├── AdminReportsView.tsx           # Legacy/auxiliary compliance report view
│   │   ├── GoogleSheetSyncCard.tsx        # 7-tab Google Sheets sync controls
│   │   ├── GoogleSignInButton.tsx         # Google Workspace OAuth connector
│   │   └── StatusText.tsx                 # Unified semantic status typography
│   ├── server/
│   │   ├── auth.ts                        # HttpOnly JWT sessions, RBAC & Google ID verification
│   │   ├── crypto.ts                      # AES-256-GCM encryption & SHA-256 hashing
│   │   ├── db.ts                          # MongoDB Atlas + encrypted local vault persistence
│   │   ├── coopService.ts                 # Accounting, eligibility, leaderboard & Sheets blueprint
│   │   ├── realtime.ts                    # Broadcast & user-targeted SSE manager
│   │   └── routes.ts                      # Express API routes & ImgBB upload proxy
│   ├── types/coop.ts                      # Shared TypeScript interfaces
│   └── utils/
│       ├── api.ts                         # Typed API client
│       ├── format.ts                      # Currency & date formatters
│       ├── googleAuth.ts                  # Firebase Google Sign-In popup helper
│       ├── googleWorkspace.ts             # Google Workspace OAuth helper (Sheets & Gmail)
│       └── pdfStatement.ts                # jsPDF member financial statement generator
```

---

## Environment Variables (`.env`)

Copy `.env.example` to `.env` and configure values as needed:

```env
ENCRYPTION_KEY=       # Optional 64-char hex key for AES-256-GCM encryption (falls back to SHA-256 of JWT_SECRET)
JWT_SECRET=           # Secret for signing HttpOnly JWT session cookies & onboarding tokens
MONGODB_URI=          # Optional MongoDB Atlas URI (falls back to data/amanah-coop-vault.json if omitted)
IMGBB_API_KEY=        # Optional server-side ImgBB API key (falls back to data/uploads/ if omitted)
GEMINI_API_KEY=       # Optional server-side Gemini API key
FIREBASE_PROJECT_ID=  # Optional override for firebase-applet-config.json projectId
```

> **Security Note**: Always set strong, unique values for `JWT_SECRET` and `ENCRYPTION_KEY` in production environments rather than relying on development fallbacks.

---

## Running Locally & Initial Administrator Credentials

1. Install dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```
2. Open `http://localhost:3000`.
3. Clean bootstrap starts with **only the Administrator account** (no fake members or demo ledger entries):
   - **Email**: `admin@amanahcoop.org`
   - **Password**: `Amanah@2026`
   - **Member Code**: `AC-001`
