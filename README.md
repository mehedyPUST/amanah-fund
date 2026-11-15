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
  - **Fund Overview (`fund-overview`)**: Central balance, liquidity, overdue installment warning banner, Cooperative Net Equity & Halal profit dividends, pre-maturity countdown, **Repayment Schedule**, **Contribution Leaderboard**, and **Recent Transactions**.
  - **Monthly Contribution (`monthly-contribution`)**: Bank/MFS deposit submission (`TrxID` and sender account encrypted at rest), **Multi-Month Advance Payment** batching (`billingMonths` with `batchGroupId`), **Gemini AI Receipt Slip Verification** (`POST /api/gemini/verify-receipt` auto-filling reference, amount, and provider), yearly **Contribution Goal Tracker**, and manager/admin verification queue.
  - **Quard Hasan (`quard-hasan`)**: Interactive **Request Qard Hasan Modal**, automated 4-point eligibility checks (no active loan, zero overdue installments, annual loan quota, pre-maturity window), **Guarantor / Co-Signer Workflow** for loans above configurable threshold (`pending_guarantor` -> co-sign acceptance -> 2/3 ballot), **0% Fee Loan Rescheduling** requests, installment repayment receipts with Gemini slip scan, and overdue installment alerts.
  - **My Profile (`my-profile`)**: View and update encrypted KYC details, configure **Step-Up 2FA (TOTP Authenticator)** QR/secret enrollment, and manage **In-App Alert & Subtle Web Audio Sound Chime** preferences.
  - **Notification (`notification`)**: In-app dispatch & alerts center with notification/sound toggles, unread tracking, **Header Notification Bell**, and Gmail notification dispatch sync.
  - **Statistics (`statistics`)**: **Monthly Financial Snapshot**, **Treasury Growth Chart**, and **Audit Trends Charts** built with Recharts.
  - **Ballot (`ballot`)**: Guarantor co-signature review cards plus live anonymized **2/3 Supermajority Voting** (`⌈2/3 × active members⌉`) for Qard Hasan loan requests and Halal investment placements.
  - **Transaction History (`transaction-history`)**: Filterable General Ledger with automated **CSV**, **PDF Financial Statement**, and **Annual Zakat & Cooperative Equity PDF** (`2.5%` indicative Zakat certificate) exports.
  - **Community (`community`)**: Registered-member discussion feed with category filters, image uploads, **Interactive Multi/Single-Choice Polls**, **`@mention` Autocomplete & Notifications**, multi-reactions, threaded comments, and **AES-256-GCM encrypted 1-on-1 Private Messages** with live read timestamps.

- **Administrator & Staff Pages**:
  - **Site Activity (`site-activity`)**: Live SSE-streamed activity feed covering member and system telemetry with action/role/search filters, Pause/Resume live stream toggle, and SHA-256 hash-chain status.
  - **System Audit Logs (`system-audit-logs`)**: Dedicated immutable governance ledger tracking timestamped administrative actions (user approvals, RBAC/status updates, site setting modifications with before/after field diffs, financial authorizations, and moderation actions), per-block SHA-256 verification (`Verify Chain Integrity`), date-range/actor filters, and CSV/JSON proof exports.
  - **Member Registry (`member-registry`)**: Combined KYC Onboarding Queue (inspect portraits, signed agreements, NID, and addresses), active directory, and full RBAC management (`admin`, `manager`, `member`, create, edit, approve, suspend, delete).
  - **Site Settings (`site-settings`)**: Fund policy editor (fund name, currency, monthly contribution target, annual loan quota, loan cap, max installment months, guarantor threshold & required co-signers, maturity date, Halal thesis), **Post-Maturity Halal Ventures & Pro-Rata Profit Distribution Engine**, **7-Tab Google Sheets Treasury Sync**, and automated CSV compliance exports.

### 3. Central Fund Balance Accounting
```text
Central Balance = (+ Approved Contributions) − (Approved / Active Loans) + (Verified Repayments)
```

### 4. Security, Cryptography, Rate Limiting & Persistence
- **Single-Origin Express + Next.js 16 Monolith**: Shares origin on port `3000`, enforces security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), and protects `/api/auth`, `/api/upload`, and `/api/gemini` with sliding-window rate limiters.
- **Step-Up Two-Factor Authentication (TOTP)**: Optional RFC 6238 authenticator verification (`X-TOTP-Code`) enforced on sensitive disbursements, policy changes, and admin member actions.
- **AES-256-GCM Field Encryption**: Sensitive KYC details, Bank/MFS transaction IDs, loan payout accounts, TOTP secrets, audit payloads, and 1-on-1 private direct message bodies are encrypted at rest.
- **SHA-256 Hash-Chained Audit Log**: Every mutating operation appends an immutable, non-editable cryptographic entry linking `prevHash -> entryHash` with per-block SHA-256 verification and before/after diffs for administrative changes.
- **Automated Overdue Scheduler**: Background sweep checks active loan installment deadlines on startup and hourly intervals, marking past-due items `overdue` and dispatching single-send reminder alerts.
- **Dual Persistence Engine**: Connects to **MongoDB Atlas** (`amanah_coop`) with startup indexes and atomic `bulkWrite`/`deleteMany` sync when `MONGODB_URI` is configured, or falls back seamlessly to an encrypted local JSON vault (`data/amanah-coop-vault.json`) serialized via a promise write queue.

---

## Semantic Project Structure

```text
/
├── server.ts                              # Custom Next.js 16 + Express server (port 3000) + overdue scheduler
├── firebase-applet-config.json            # Firebase client config (Google Sign-In & Workspace)
├── tests/coop.test.ts                     # Vitest unit & domain verification suite
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
│   │   ├── AppProviders.tsx               # Session context, theme state, Workspace & global 2FA prompt
│   │   ├── PublicShell.tsx                # Public layout wrapper
│   │   ├── Navbar.tsx                     # Scrollspy top navigation & theme toggle
│   │   ├── Footer.tsx                     # Public footer with section jump links & theme switcher
│   │   ├── Hero.tsx                       # Landing hero, metrics & Halal investment lifecycle
│   │   ├── About.tsx                      # Governance & cryptographic architecture pillars
│   │   ├── Rules.tsx                      # Shariah & cooperative operating bylaws
│   │   ├── SignInForm.tsx                 # Email/password & Continue with Google sign-in
│   │   ├── SignUpForm.tsx                 # Progressive KYC & Google-verified registration
│   │   ├── DashboardShell.tsx             # Multi-page dashboard shell, sidebar, Web Audio chime & SSE sync
│   │   ├── HeaderNotificationBell.tsx     # Loan approval & contribution reminder popover
│   │   ├── OverviewView.tsx               # Fund Overview KPIs, equity, overdue alert & standings
│   │   ├── RepaymentSchedule.tsx          # Active loan installment progress & deadline tracker
│   │   ├── ContributionLeaderboard.tsx    # Top contributors & consistent payers ranking
│   │   ├── RecentTransactions.tsx         # Latest monthly contributions & loan repayments
│   │   ├── ContributionsView.tsx          # Multi-month deposits, Gemini receipt scan & manager verification
│   │   ├── ContributionGoalTracker.tsx    # Yearly savings goal progress bar
│   │   ├── LoansView.tsx                  # Qard Hasan eligibility, guarantors, rescheduling & repayments
│   │   ├── RequestQardHasanLoanForm.tsx   # Qard Hasan application form with guarantor selector
│   │   ├── RequestQardHasanModal.tsx      # Accessible modal wrapper for loan requests
│   │   ├── StatisticsView.tsx             # Treasury analytics page container
│   │   ├── MonthlyFinancialSnapshot.tsx   # Current-month deposits vs. withdrawn loans
│   │   ├── TreasuryGrowthChart.tsx        # Recharts treasury trajectory chart
│   │   ├── CashflowChart.tsx              # Monthly cashflow breakdown chart
│   │   ├── AuditTrendsCharts.tsx          # Recharts compliance & audit analytics
│   │   ├── VotingView.tsx                 # Guarantor co-signing & anonymized 2/3 member ballots
│   │   ├── HalalProjectsView.tsx          # Post-maturity Halal ventures & pro-rata profit distribution
│   │   ├── TransactionHistory.tsx         # Full General Ledger, CSV, PDF & Zakat statement exports
│   │   ├── CommunityView.tsx              # Member discussions, polls, @mentions, reactions & DMs
│   │   ├── NotificationsView.tsx          # Alerts outbox, sound preferences & Gmail dispatch
│   │   ├── MemberProfile.tsx              # Encrypted KYC viewer/editor, TOTP 2FA & alert controls
│   │   ├── AdminAuditLog.tsx              # Live SSE Site Activity & hash-chain verification
│   │   ├── SystemAuditLogsView.tsx        # Immutable admin audit log ledger, before/after diffs & JSON/CSV proofs
│   │   ├── MemberRegistrySection.tsx      # Unified Member Registry & KYC inspection
│   │   ├── PendingRegistrationsView.tsx   # Admin Onboarding Queue for KYC verification
│   │   ├── ActiveMembersView.tsx          # Active member directory
│   │   ├── AdminUserManagementPanel.tsx   # RBAC roles, create/edit/suspend/delete controls
│   │   ├── AdminSiteSettingsView.tsx      # Site Settings, guarantor policies, fund rules & CSV exports
│   │   ├── AdminReportsView.tsx           # Legacy/auxiliary compliance report view
│   │   ├── GoogleSheetSyncCard.tsx        # 7-tab Google Sheets sync controls
│   │   ├── GoogleSignInButton.tsx         # Google Workspace OAuth connector
│   │   └── StatusText.tsx                 # Unified semantic status typography
│   ├── server/
│   │   ├── auth.ts                        # HttpOnly JWT sessions, RBAC & Google ID verification
│   │   ├── crypto.ts                      # AES-256-GCM encryption & SHA-256 hashing
│   │   ├── totp.ts                        # RFC 6238 TOTP secret & verification helpers
│   │   ├── geminiService.ts               # Server-side @google/genai receipt OCR verification
│   │   ├── rateLimit.ts                   # Sliding-window route rate limiter
│   │   ├── db.ts                          # MongoDB Atlas + encrypted local vault persistence
│   │   ├── coopService.ts                 # Accounting, overdue checks, eligibility, mentions & Sheets blueprint
│   │   ├── realtime.ts                    # Broadcast & user-targeted SSE manager
│   │   └── routes.ts                      # Express API routes & ImgBB upload proxy
│   ├── types/coop.ts                      # Shared TypeScript interfaces
│   └── utils/
│       ├── api.ts                         # Typed API client with global 2FA step-up retry
│       ├── format.ts                      # Currency & date formatters
│       ├── googleAuth.ts                  # Firebase Google Sign-In popup helper
│       ├── googleWorkspace.ts             # Google Workspace OAuth helper (Sheets & Gmail)
│       └── pdfStatement.ts                # jsPDF financial statement & Annual Zakat Equity generator
```

---

## Environment Variables (`.env`)

Copy `.env.example` to `.env` and configure values as needed:

```env
ENCRYPTION_KEY=       # Optional 64-char hex key for AES-256-GCM encryption (falls back to SHA-256 of JWT_SECRET)
JWT_SECRET=           # Secret for signing HttpOnly JWT session cookies & onboarding tokens
MONGODB_URI=          # Optional MongoDB Atlas URI (falls back to data/amanah-coop-vault.json if omitted)
IMGBB_API_KEY=        # Optional server-side ImgBB API key (falls back to data/uploads/ if omitted)
GEMINI_API_KEY=       # Optional server-side Gemini API key (enables AI receipt slip extraction)
FIREBASE_PROJECT_ID=  # Optional override for firebase-applet-config.json projectId
```

> **Security Note**: Always set strong, unique values for `JWT_SECRET` and `ENCRYPTION_KEY` in production environments rather than relying on development fallbacks.

---

## Export Policy

Amanah provides transparent, self-service and assisted record exports so every cooperative member can obtain an accurate summary of their contributions, Qard Hasan loan repayments, and cooperative equity for personal accounting, Zakat calculation, or external verification.

### 1. Member Self-Service Exports (Personal Records)
Active authenticated members can download their personal financial records anytime from **Dashboard -> Transaction History**:
- **CSV Ledger Summary (`Export CSV`)**: Downloads a UTF-8 spreadsheet (`amanah-transactions-YYYY-MM-DD.csv`) scoped to your current filters (type, status, and search query). Columns include transaction type, member code/name, description, billing or due period, submission/verification timestamp, payment channel/provider, reference ID, status, and amount.
- **PDF Financial Statement (`Download PDF Statement`)**: Generates an itemized A4 statement summarizing your approved monthly contributions, active loan balance, verified installment repayments, and chronological ledger entries.
- **Annual Zakat & Equity Statement (`Zakat & Equity PDF`)**: Generates an annual cooperative equity summary showing paid-in contributions, distributed post-maturity Halal profit dividends, outstanding Qard Hasan liabilities, net cooperative equity, and an indicative `2.5%` Zakat reference calculation.

### 2. Assisted Record Requests (Offline, Pending, or Historical Archives)
If a member cannot access the self-service dashboard (for example, following account suspension, archive/exit reconciliation, or when requesting a certified cooperative-wide reconciliation excerpt):
1. **Submit a Request**: Send a formal request to a Cooperative Administrator via an in-app **Direct Message** (from **Community -> Private Messages**, if active) or through the cooperative's registered administrative email, specifying your **Member Code** (e.g., `AC-002`), requested date range, and preferred format (`CSV` or `PDF Statement`).
2. **Identity & Privacy Verification**: Administrators verify the requester's identity against the encrypted KYC record in **Member Registry** before fulfilling any off-portal export. Sensitive payment references (`TrxID` and sender accounts) are decrypted exclusively for the verified record owner or authorized staff, and anonymized 2/3 ballot identities are never disclosed in any export.
3. **Auditability**: Every administrative ledger export (`/api/reports/export`) is permanently recorded with the administrator's identity and timestamp in the immutable **System Audit Logs** (`REPORT_EXPORTED`).

---

## Running Locally, Testing & Initial Administrator Credentials

1. Install dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```
2. Run the automated verification suite and typecheck:
   ```bash
   npm test
   npm run lint
   npm run build
   ```
3. Open `http://localhost:3000`.
4. Clean bootstrap starts with **only the Administrator account** (no fake members or demo ledger entries):
   - **Email**: `admin@amanahcoop.org`
   - **Password**: `Amanah@2026`
   - **Member Code**: `AC-001`
