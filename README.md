# Amanah Co-op Treasury

An encrypted, Shariah-governed cooperative fund management platform built with **Next.js 16 (App Router)**, **Express 4**, **TypeScript**, and **Tailwind CSS v4**. Members contribute monthly via Bank or Mobile Financial Services (MFS), democratically vote on 0% interest **Qard Hasan** loans using a 2/3 supermajority quorum, and transition accumulated capital into vetted Halal real-economy investments upon reaching a pre-specified maturity date.

---

## Core Architecture & Features

### 1. Admin-Gated Membership & Extended KYC Onboarding (`/signup`)
- **Dedicated Sign-Up (`/signup`) & Sign-In (`/login`) Flows**: Clean separation between new member applications and approved member authentication.
- **Extended Application Fields**:
  - Full Name, Email, Password, Date of Birth
  - Reference (Existing Active Member Name with autocomplete suggestions)
  - Mobile Number, National ID (NID)
  - Occupation & Company / Organization
  - Present Address & Permanent Address
  - **Member Photo** (required) & **Signed Agreement Paper Photo** (optional) uploaded via the server-side **ImgBB API** proxy (`/api/upload/imgbb`).
- **Admin Inspection & Approval**:
  - Newly registered applicants are placed in `pending_approval` status and cannot sign in until approved.
  - Administrators can open a dedicated **Registration Details** modal in **Admin & Reports** to inspect uploaded photos, agreement papers, NID, reference member, occupation, and addresses before approving or declining.

### 2. Monthly Contributions & Central Fund Balance Accounting
- Members submit monthly Bank or MFS contributions (bKash, Nagad, Rocket, Islami Bank, Dutch-Bangla Bank, etc.) with encrypted transaction references (`TrxID`) and sender accounts.
- Treasury Managers and Administrators review pending deposits and verify them against settlement statements.
- **Live Central Balance Arithmetic**:
  ```
  Central Balance = (+ Approved Contributions) − (Approved / Active Loans) + (Verified Repayments)
  ```

### 3. 0% Interest Qard Hasan Loans & 2/3 Supermajority Voting
- **Automated Eligibility Checks**:
  - Only **one active or pending Qard Hasan loan** per member at a time.
  - Configurable **annual loan quota** per calendar year (default `3`, dynamically adjustable by Administrators).
  - Pre-maturity lending window enforcement.
- **2/3 Democratic Member Voting**:
  - Both Qard Hasan loan proposals and Halal investment placements require affirmative ballots from at least `⌈2/3 × active members⌉`.
  - Every ballot records a SHA-256 voter signature hash and broadcasts live across connected dashboards via **Server-Sent Events (`/api/events`)**.
- **Installment Repayments**: Verified monthly repayments credit the central fund balance immediately and unlock future eligibility once settled.

### 4. Post-Maturity Halal Investment Mandate
- After the configurable maturity date, cooperative capital transitions to Shariah-screened **Mudarabah**, **Musharakah**, and **Murabahah** ventures subject to member 2/3 approval voting.

### 5. Security & Cryptography
- **HttpOnly JWT Sessions**: Signed session tokens stored in `HttpOnly`, `SameSite` cookies (`bcryptjs` password hashing).
- **AES-256-GCM Field Encryption**: Sensitive registration details, Bank/MFS transaction IDs, payout accounts, and audit payloads are encrypted at rest.
- **SHA-256 Hash-Chained Audit Trail**: Immutable append-only audit log where every action hashes and links to the preceding entry.
- **Role-Based Access Control (RBAC)**: Strict route and UI enforcement across `admin`, `manager`, and `member` roles.

### 6. Google Workspace Integration & Compliance Reports
- **7-Tab Google Sheets Treasury Blueprint Sync** (`Fund_Summary`, `Members`, `Contributions`, `Loans`, `Installments`, `Investment_Placements`, `Email_Notifications`).
- **Gmail API Notification Dispatch** for signup approvals, contribution receipts, vote requests, and monthly reminders.
- **Automated CSV Compliance Exports** and **Recharts** time-series analytics.

---

## Semantic Project Structure

```text
/
├── server.ts                         # Custom Next.js + Express 4 server (port 3000)
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
│   │   ├── Navbar.tsx                # Public top navigation bar
│   │   ├── Footer.tsx                # Public footer with theme switcher
│   │   ├── Hero.tsx                  # Landing hero, highlights, & Halal investment lifecycle
│   │   ├── About.tsx                 # Governance & security pillars
│   │   ├── Rules.tsx                 # Shariah & cooperative operating rules
│   │   ├── SignInForm.tsx            # Dedicated Sign-In form
│   │   ├── SignUpForm.tsx            # Extended KYC Sign-Up form with ImgBB upload
│   │   ├── DashboardShell.tsx        # 4-grid authenticated dashboard layout + SSE sync
│   │   ├── OverviewView.tsx          # Treasury balance & personal standing overview
│   │   ├── ContributionsView.tsx     # Monthly Bank/MFS contribution submissions & review
│   │   ├── LoansView.tsx             # Qard Hasan requests, eligibility, & repayments
│   │   ├── VotingView.tsx            # Real-time 2/3 member ballots
│   │   ├── HalalProjectsView.tsx     # Post-maturity Halal investment proposals & voting
│   │   ├── NotificationsView.tsx     # Automated reminders & Gmail dispatch outbox
│   │   └── AdminReportsView.tsx      # Signup KYC inspection modal, RBAC, policy, charts & audit log
│   ├── server/
│   │   ├── auth.ts                   # JWT cookie session & RBAC middleware
│   │   ├── crypto.ts                 # AES-256-GCM encryption & SHA-256 hashing
│   │   ├── db.ts                     # MongoDB Atlas + encrypted local vault persistence
│   │   ├── coopService.ts            # Treasury accounting, eligibility & Sheets blueprint
│   │   ├── realtime.ts               # SSE event broadcaster
│   │   └── routes.ts                 # Express API routes & ImgBB upload proxy
│   ├── types/coop.ts                 # Shared TypeScript interfaces
│   └── utils/                        # API client, formatters, & Google Workspace OAuth
```

---

## Environment Variables (`.env`)

Copy `.env.example` to `.env` and configure values as needed:

```env
ENCRYPTION_KEY=       # Optional 32-byte hex or passphrase for AES-256-GCM vault encryption
JWT_SECRET=           # Secret for signing HttpOnly JWT session cookies
MONGODB_URI=          # Optional MongoDB Atlas URI (falls back to encrypted local vault if omitted)
IMGBB_API_KEY=        # Server-side ImgBB API key for member photo & agreement uploads
```

> **Note**: When `IMGBB_API_KEY` is omitted during local development, `/api/upload/imgbb` automatically stores uploaded images in `data/uploads/` and serves them via `/api/uploads/:filename`.

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
