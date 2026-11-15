# Amanah Co-op Treasury

An encrypted, Shariah-governed cooperative fund management platform built with **Next.js 16 (App Router)**, **Express 4**, **TypeScript**, and **Tailwind CSS v4**. Members contribute monthly via Bank or Mobile Financial Services (MFS), democratically vote on 0% interest **Qard Hasan** loans using a 2/3 supermajority quorum, and transition accumulated capital into vetted Halal real-economy investments upon reaching a pre-specified maturity date.

---

## Core Architecture & Features

### 1. Admin-Gated Membership, Google Sign-In & Progressive KYC Onboarding
- **Dedicated Sign-Up (`/signup`) & Sign-In (`/login`) Flows**: Clean separation between new member applications and approved member authentication.
- **2-Stage Sign in with Google + KYC Flow**:
  - Clicking **Continue with Google** authenticates via Firebase Auth (`email` and `profile` scopes only—kept separate from admin Google Workspace permissions) and verifies the RS256 ID token on the server (`POST /api/auth/google`).
  - **Approved Active Members** are issued an `amanah_session` HttpOnly JWT cookie and signed straight into `/dashboard`.
  - **Pending or Suspended Accounts** are blocked (`403`) with clear status feedback.
  - **New Applicants** receive a short-lived signed onboarding token (`20m`) and transition to `/signup?mode=google`, where Full Name is pre-filled, the Google-verified Email is locked, and creating a password is optional—while all cooperative KYC fields remain mandatory.
- **Extended Application Fields**:
  - Full Name, Email, Password (required for email sign-up; optional backup password for Google-verified sign-up), Date of Birth
  - Reference (Existing Active Member Name with autocomplete suggestions)
  - Mobile Number, National ID (NID)
  - Occupation & Company / Organization
  - Present Address & Permanent Address
  - **Member Photo** (required) & **Signed Agreement Paper Photo** (optional) uploaded via the server-side **ImgBB API** proxy (`/api/upload/imgbb`).
- **Admin Onboarding Queue**:
  - Newly registered applicants are placed in `pending_approval` status and cannot sign in until approved.
  - Administrators review full encrypted KYC details, Google verification status, NID, reference member, residential addresses, member portraits, and agreement documents in **Onboarding Queue** and **Administration** before approving or rejecting access.

### 2. Executive Summary, Goal Tracking & Financial Snapshots
- **Monthly Financial Snapshot**: Compares current-month verified contributions against withdrawn Qard Hasan loans and net monthly cash flow.
- **Contribution Goal Tracker**: Tracks each member's cumulative monthly progress bar against their yearly savings goal (`12 × monthlyContributionAmount`).
- **Recent Transactions & General Ledger**: Displays latest monthly contributions and loan installment repayments with clear status indicators, plus full ledger filtering and PDF/CSV statement exports.
- **Header Notification Bell & Dual Theme**: Live header dropdown alerting members to approved/disbursed loans and pending monthly contribution reminders, alongside persistent light/dark theme switching from both the public navbar/footer and dashboard header.

### 3. Monthly Capital Deposits & Central Fund Balance Accounting
- Members submit monthly Bank or MFS contributions (bKash, Nagad, Rocket, Islami Bank, Dutch-Bangla Bank, etc.) with encrypted transaction references (`TrxID`) and sender accounts.
- Treasury Managers and Administrators review pending deposits and verify them against settlement statements.
- **Live Central Balance Arithmetic**:
  ```
  Central Balance = (+ Approved Contributions) − (Approved / Active Loans) + (Verified Repayments)
  ```

### 4. 0% Interest Qard Hasan Loans & 2/3 Supermajority Voting
- **Automated Eligibility Checks**:
  - Only **one active or pending Qard Hasan loan** per member at a time.
  - Configurable **annual loan quota** per calendar year (default `3`, dynamically adjustable by Administrators).
  - Pre-maturity lending window enforcement.
- **2/3 Democratic Member Voting**:
  - Both Qard Hasan loan proposals and Halal investment placements require affirmative ballots from at least `⌈2/3 × active members⌉`.
  - Every ballot records a SHA-256 voter signature hash and broadcasts live across connected dashboards via **Server-Sent Events (`/api/events`)**.
- **Installment Repayments**: Verified monthly repayments credit the central fund balance immediately and unlock future eligibility once settled.

### 5. Post-Maturity Halal Ventures
- After the configurable maturity date, cooperative capital transitions to Shariah-screened **Mudarabah**, **Musharakah**, and **Murabahah** ventures subject to member 2/3 approval voting.

### 6. Security & Cryptography
- **HttpOnly JWT Sessions**: Signed session tokens stored in `HttpOnly`, `SameSite` cookies (`bcryptjs` password hashing).
- **Server-Side Google ID Token Verification**: Verifies Firebase Auth RS256 signatures against Google's public x509 certificates, `projectId` audience/issuer, and `email_verified` claims before issuing sessions or onboarding tokens.
- **AES-256-GCM Field Encryption**: Sensitive registration details, Bank/MFS transaction IDs, payout accounts, and audit payloads are encrypted at rest.
- **SHA-256 Hash-Chained Audit Trail**: Immutable append-only audit log where every action hashes and links to the preceding entry.
- **Role-Based Access Control (RBAC)**: Strict route and UI enforcement across `admin`, `manager`, and `member` roles.

### 7. Google Workspace Integration & Compliance Reports
- **7-Tab Google Sheets Treasury Blueprint Sync** (`Fund_Summary`, `Members`, `Contributions`, `Loans`, `Installments`, `Investment_Placements`, `Email_Notifications`).
- **Gmail API Notification Dispatch** for signup approvals, contribution receipts, vote requests, and monthly reminders.
- **Automated CSV & PDF Compliance Exports** and **Recharts** time-series analytics.

---

## Semantic Project Structure

```text
/
├── server.ts                         # Custom Next.js + Express 4 server (port 3000)
├── firebase-applet-config.json       # Firebase client configuration (Google Auth & Workspace)
├── data/                             # Encrypted local JSON vault & upload fallback storage
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Public landing page (Hero)
│   │   ├── about/page.tsx            # Security & platform overview (About)
│   │   ├── rules/page.tsx            # Cooperative bylaws & Shariah charter (Rules)
│   │   ├── login/page.tsx            # Dedicated Member Sign In (/login)
│   │   ├── signup/page.tsx           # Dedicated Membership Application (/signup)
│   │   └── dashboard/page.tsx        # Authenticated Members Dashboard
│   ├── components/
│   │   ├── AppProviders.tsx          # Session context, theme state, wheel-guard & Workspace state
│   │   ├── PublicShell.tsx           # Public layout wrapper
│   │   ├── Navbar.tsx                # Public top navigation bar with theme toggle
│   │   ├── Footer.tsx                # Public footer with theme switcher
│   │   ├── Hero.tsx                  # Landing hero, highlights, & Halal investment lifecycle
│   │   ├── About.tsx                 # Governance & security pillars
│   │   ├── Rules.tsx                 # Shariah & cooperative operating rules
│   │   ├── SignInForm.tsx            # Email/password & Continue with Google sign-in
│   │   ├── SignUpForm.tsx            # Progressive KYC & Google-verified Sign-Up form
│   │   ├── DashboardShell.tsx        # Authenticated dashboard layout, sidebar & SSE sync
│   │   ├── HeaderNotificationBell.tsx# Loan approval & contribution reminder alerts
│   │   ├── OverviewView.tsx          # Executive Summary & personal standing
│   │   ├── MonthlyFinancialSnapshot.tsx # Current-month contributions vs. withdrawn loans card
│   │   ├── ContributionGoalTracker.tsx  # Yearly savings goal progress tracker
│   │   ├── RecentTransactions.tsx    # Latest monthly contributions & loan payments list
│   │   ├── TreasuryGrowthChart.tsx   # Recharts central fund trajectory chart
│   │   ├── ContributionsView.tsx     # Capital Deposits submission & manager review
│   │   ├── LoansView.tsx             # Qard Hasan requests, eligibility, & repayments
│   │   ├── RequestQardHasanLoanForm.tsx # Qard Hasan loan application form
│   │   ├── TransactionHistory.tsx    # Full General Ledger & statement exports
│   │   ├── VotingView.tsx            # Real-time 2/3 member ballots
│   │   ├── HalalProjectsView.tsx     # Post-maturity Halal ventures & voting
│   │   ├── ActiveMembersView.tsx     # Active Member Registry directory
│   │   ├── NotificationsView.tsx     # Dispatch & Alerts outbox + Gmail sync
│   │   ├── MemberProfile.tsx         # Profile & encrypted KYC details view/editor
│   │   ├── PendingRegistrationsView.tsx # Admin Onboarding Queue for KYC verification
│   │   ├── AdminAuditLog.tsx         # Immutable hash-chained Audit Trail viewer
│   │   ├── AdminUserManagementPanel.tsx # Member role & status administration
│   │   ├── AdminReportsView.tsx      # Administration, policy config, & charts
│   │   ├── AuditTrendsCharts.tsx     # Recharts compliance analytics
│   │   ├── GoogleSheetSyncCard.tsx   # 7-tab Google Sheets sync controls
│   │   ├── GoogleSignInButton.tsx    # Google Workspace Sheets/Gmail connector button
│   │   └── StatusText.tsx            # Unified status typography indicators
│   ├── server/
│   │   ├── auth.ts                   # JWT cookie session, RBAC & Firebase Google ID verification
│   │   ├── crypto.ts                 # AES-256-GCM encryption & SHA-256 hashing
│   │   ├── db.ts                     # MongoDB Atlas + encrypted local vault persistence
│   │   ├── coopService.ts            # Treasury accounting, eligibility & Sheets blueprint
│   │   ├── realtime.ts               # SSE event broadcaster
│   │   └── routes.ts                 # Express API routes & ImgBB upload proxy
│   ├── types/coop.ts                 # Shared TypeScript interfaces
│   └── utils/
│       ├── api.ts                    # Typed fetch client
│       ├── format.ts                 # Currency & date formatters
│       ├── googleAuth.ts             # Firebase Google Sign-In popup helper (identity scopes)
│       ├── googleWorkspace.ts        # Google Workspace OAuth helper (Sheets & Gmail scopes)
│       └── pdfStatement.ts           # jsPDF member financial statement generator
```

---

## Environment Variables (`.env`)

Copy `.env.example` to `.env` and configure values as needed:

```env
ENCRYPTION_KEY=       # Optional 32-byte hex or passphrase for AES-256-GCM vault encryption
JWT_SECRET=           # Secret for signing HttpOnly JWT session cookies & onboarding tokens
MONGODB_URI=          # Optional MongoDB Atlas URI (falls back to encrypted local vault if omitted)
IMGBB_API_KEY=        # Server-side ImgBB API key for member photo & agreement uploads
GEMINI_API_KEY=       # Optional server-side Gemini API key
```

> **Note**: When `IMGBB_API_KEY` is omitted during local development, `/api/upload/imgbb` automatically stores uploaded images in `data/uploads/` and serves them via `/api/uploads/:filename`. Firebase Auth configuration for Google Sign-In and Workspace OAuth is loaded from `firebase-applet-config.json` (and can optionally be overridden on the server via `FIREBASE_PROJECT_ID`).

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
