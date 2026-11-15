export type UserRole = 'admin' | 'manager' | 'member';
export type UserStatus = 'pending_approval' | 'active' | 'suspended';

export type DashboardSectionId =
  | 'fund-overview'
  | 'monthly-contribution'
  | 'quard-hasan'
  | 'my-profile'
  | 'notification'
  | 'statistics'
  | 'ballot'
  | 'transaction-history'
  | 'community'
  | 'site-activity'
  | 'member-registry'
  | 'site-settings';

export interface EncryptedEnvelope {
  iv: string;
  tag: string;
  ciphertext: string;
  keyVersion: string;
}

export interface UserRegistrationDetails {
  dateOfBirth: string;
  referenceMemberName: string;
  mobile: string;
  occupation: string;
  companyOrganization: string;
  nid: string;
  presentAddress: string;
  permanentAddress: string;
  photoUrl: string;
  agreementPhotoUrl?: string;
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
  photoUrl?: string;
  authProvider?: 'password' | 'google' | 'both';
  communityMuted?: boolean;
  registrationDetails?: UserRegistrationDetails;
}

export interface MemberSummary extends PublicUser {
  totalContributed: number;
  approvedContributionsCount: number;
  loansThisYear: number;
  activeLoanBalance: number;
  hasActiveLoan: boolean;
}

export interface ActiveMemberDirectoryItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  memberCode: string;
  status: UserStatus;
  joinedAt: string;
  photoUrl?: string;
  mobile: string;
  occupation?: string;
  companyOrganization?: string;
  presentAddress?: string;
  totalContributed: number;
  approvedContributionsCount: number;
  monthlyTarget: number;
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
  isSelf?: boolean;
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
  adminDecision?: 'approved' | 'rejected';
  adminReviewedAt?: string;
  adminReviewedBy?: string;
  adminReviewNote?: string;
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
  isSelf?: boolean;
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
  | 'loan_vote_requested'
  | 'loan_approved_confirmation'
  | 'loan_rejected_notice'
  | 'loan_repayment_notice'
  | 'monthly_contribution_reminder'
  | 'community_moderation';

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
    | 'workspace_sync'
    | 'community';
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

export interface LeaderboardEntry {
  userId: string;
  memberName: string;
  memberCode: string;
  photoUrl?: string;
  totalContributed: number;
  approvedContributionsCount: number;
  approvedMonthsCount: number;
  currentStreakMonths: number;
  consistencyScore: number;
  currentMonthPaid: boolean;
  isSelf: boolean;
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
  leaderboard: LeaderboardEntry[];
  storageEngine: 'mongodb_atlas' | 'encrypted_local_vault';
}

export type CommunityCategory =
  | 'General'
  | 'Qard Hasan'
  | 'Halal Ventures'
  | 'Announcements'
  | 'Help & Support';

export type CommunityReactionType = 'like' | 'support' | 'celebrate' | 'helpful';

export interface CommunityReaction {
  userId: string;
  userName: string;
  type: CommunityReactionType;
  createdAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorCode: string;
  authorRole: UserRole;
  authorPhotoUrl?: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorCode: string;
  authorRole: UserRole;
  authorPhotoUrl?: string;
  authorMuted?: boolean;
  category: CommunityCategory;
  title: string;
  content: string;
  imageUrl?: string;
  reactions: CommunityReaction[];
  comments: CommunityComment[];
  isPinned: boolean;
  commentsLocked: boolean;
  status: 'active' | 'hidden';
  moderationReason?: string;
  moderatedByName?: string;
  moderatedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PrivateMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderCode: string;
  senderRole: UserRole;
  senderPhotoUrl?: string;
  recipientId: string;
  recipientName: string;
  recipientCode: string;
  recipientRole: UserRole;
  recipientPhotoUrl?: string;
  body: string;
  createdAt: string;
  readAt?: string;
}

export interface ConversationThreadSummary {
  peerId: string;
  peerName: string;
  peerCode: string;
  peerRole: UserRole;
  peerPhotoUrl?: string;
  lastMessageBody: string;
  lastMessageAt: string;
  lastMessageSenderId: string;
  unreadCount: number;
}
