export type UserRole = 'admin' | 'manager' | 'member';
export type UserStatus = 'pending_approval' | 'active' | 'suspended';

export interface EncryptedEnvelope {
  iv: string;
  tag: string;
  ciphertext: string;
  keyVersion: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  memberCode: string;
  status: UserStatus;
  joinedAt: string;
  phoneMasked?: string;
}

export interface MemberSummary extends PublicUser {
  totalContributed: number;
  approvedContributionsCount: number;
  loansThisYear: number;
  activeLoanBalance: number;
  hasActiveLoan: boolean;
}

export interface FundConfig {
  id: string;
  fundName: string;
  currency: 'BDT' | 'USD' | 'MYR' | 'GBP';
  monthlyContributionAmount: number;
  maxLoansPerYear: number;
  maxLoanAmount: number;
  maxInstallmentMonths: number;
  voteThresholdNumerator: number;
  voteThresholdDenominator: number;
  maturityDate: string; // YYYY-MM-DD
  halalInvestmentThesis: string;
  googleSheetId?: string;
  googleSheetUrl?: string;
  lastSheetSyncAt?: string;
  autoSyncSheet?: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface ContributionSensitiveDetails {
  referenceId: string;
  senderAccount: string;
  notes?: string;
}

export interface Contribution {
  id: string;
  userId: string;
  memberName: string;
  memberCode: string;
  billingMonth: string; // YYYY-MM
  amount: number;
  channel: 'bank' | 'mfs';
  providerName: string;
  maskedReference: string;
  encryptedDetails: EncryptedEnvelope;
  decryptedDetails?: ContributionSensitiveDetails;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewerName?: string;
  reviewNote?: string;
  entryHash: string;
}

export interface LoanVote {
  voterId: string;
  voterName: string;
  voterRole: UserRole;
  decision: 'approve' | 'reject';
  comment?: string;
  castAt: string;
  signatureHash: string;
}

export interface RepaymentReceiptDetails {
  referenceId: string;
  senderAccount: string;
  notes?: string;
}

export interface InstallmentItem {
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'scheduled' | 'pending_verification' | 'paid' | 'overdue';
  submittedAt?: string;
  paidAt?: string;
  repaymentChannel?: 'bank' | 'mfs';
  repaymentProvider?: string;
  maskedReference?: string;
  encryptedReceipt?: EncryptedEnvelope;
  decryptedReceipt?: RepaymentReceiptDetails;
  verifiedBy?: string;
  verifierName?: string;
}

export interface LoanSensitiveDetails {
  emergencyContext: string;
  disbursementAccount: string;
  channel: 'bank' | 'mfs';
  provider: string;
}

export interface EligibilityCheck {
  noActiveLoan: boolean;
  activeLoanId?: string;
  loansUsedThisYear: number;
  maxLoansPerYear: number;
  quotaAvailable: boolean;
  beforeMaturityDate: boolean;
  eligible: boolean;
  reasons: string[];
}

export interface LoanRequest {
  id: string;
  borrowerId: string;
  borrowerName: string;
  borrowerCode: string;
  amount: number;
  installmentMonths: number;
  monthlyInstallment: number;
  purpose: string;
  encryptedSensitiveNotes: EncryptedEnvelope;
  decryptedSensitiveNotes?: LoanSensitiveDetails;
  status:
    | 'pending_vote'
    | 'approved_pending_disbursement'
    | 'active'
    | 'repaid'
    | 'rejected';
  eligibilitySnapshot: EligibilityCheck;
  votes: LoanVote[];
  requiredApprovals: number;
  totalEligibleVoters: number;
  disbursementSignature?: {
    signedById: string;
    signedByName: string;
    signedByRole: UserRole;
    signedAt: string;
    signatureHash: string;
  };
  installments: InstallmentItem[];
  totalRepaid: number;
  remainingBalance: number;
  requestedAt: string;
  approvedAt?: string;
  disbursedAt?: string;
  completedAt?: string;
  entryHash: string;
}

export interface PlacementVote {
  voterId: string;
  voterName: string;
  voterRole: UserRole;
  decision: 'yes' | 'no';
  comment?: string;
  castAt: string;
  signatureHash: string;
}

export interface HalalProject {
  id: string;
  title: string;
  sector: string;
  shariahStructure: 'Mudarabah' | 'Musharakah' | 'Murabahah';
  targetAllocation: number;
  projectedAnnualReturn: string;
  riskTier: 'Conservative' | 'Balanced' | 'Growth';
  status: 'proposed' | 'vetted' | 'active_post_maturity';
  shariahScholarNote: string;
  createdAt: string;
  votingStatus: 'open' | 'approved' | 'rejected';
  votes: PlacementVote[];
  requiredApprovals: number;
  totalEligibleVoters: number;
  proposedBy?: string;
  approvedAt?: string;
}

export type NotificationType =
  | 'signup_pending_admin'
  | 'signup_approved'
  | 'contribution_placed_manager'
  | 'contribution_accepted'
  | 'loan_approved_confirmation'
  | 'loan_repayment_notice'
  | 'monthly_contribution_reminder';

export interface EmailNotification {
  id: string;
  type: NotificationType;
  recipientEmail: string;
  recipientName: string;
  recipientUserId?: string;
  subject: string;
  body: string;
  deliveryChannel: 'gmail_api' | 'in_app_outbox';
  deliveryStatus: 'queued' | 'sent_via_gmail';
  relatedId?: string;
  createdAt: string;
  sentAt?: string;
  readByRecipient?: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  resourceType:
    | 'auth'
    | 'contribution'
    | 'loan'
    | 'vote'
    | 'repayment'
    | 'config'
    | 'halal_project'
    | 'report'
    | 'notification'
    | 'workspace_sync';
  resourceId: string;
  summary: string;
  encryptedPayload: EncryptedEnvelope;
  decryptedPayload?: Record<string, unknown>;
  prevHash: string;
  entryHash: string;
}

export interface MonthlyCashflowPoint {
  month: string;
  contributions: number;
  disbursed: number;
  repaid: number;
}

export interface DashboardOverview {
  config: FundConfig;
  phase: 'qard_hasan' | 'halal_investment';
  daysUntilMaturity: number;
  treasury: {
    totalContributionsPool: number;
    totalLoansDisbursed: number;
    approvedLoansDeducted: number;
    totalRepaid: number;
    activeLoansOutstanding: number;
    centralBalance: number;
    availableLiquidity: number;
    pendingContributionsAmount: number;
    pendingContributionsCount: number;
    pendingVotesCount: number;
    pendingDisbursementsCount: number;
    pendingRepaymentsCount: number;
    activeMembersCount: number;
    pendingMembersCount: number;
    unreadNotificationsCount: number;
  };
  personal: {
    totalContributed: number;
    approvedContributionsCount: number;
    pendingContributionsCount: number;
    activeLoanBalance: number;
    totalRepaidPersonal: number;
    eligibility: EligibilityCheck;
  };
  monthlySeries: MonthlyCashflowPoint[];
  storageEngine: 'mongodb_atlas' | 'encrypted_local_vault';
}
