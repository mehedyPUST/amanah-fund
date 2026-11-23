export type UserRole = 'admin' | 'manager' | 'member';
export type UserStatus = 'pending_approval' | 'pending_activation' | 'active' | 'suspended';

export type DashboardSectionId =
  | 'fund-overview'
  | 'monthly-contribution'
  | 'quard-hasan'
  | 'my-amanah'
  | 'my-profile'
  | 'notification'
  | 'statistics'
  | 'ballot'
  | 'transaction-history'
  | 'community'
  | 'manager-desk'
  | 'site-activity'
  | 'member-registry'
  | 'site-settings'
  | 'member-profile'
  | 'manager-cycle'
  | 'members'
  | 'balance-sheet';

export interface EncryptedEnvelope {
  iv: string;
  tag: string;
  ciphertext: string;
  keyVersion: string;
}

export interface NotificationPreferences {
  inAppAlerts: boolean;
  emailBallots: boolean;
  emailRepayments: boolean;
  emailCommunity: boolean;
  soundEnabled: boolean;
  pushAlerts?: boolean;
}

export type MobileMemberTileId =
  | 'pay-monthly-contribution'
  | 'quard-hasan'
  | 'request-loan'
  | 'my-amanah'
  | 'members'
  | 'community'
  | 'balance-sheet'
  | 'transaction-history'
  | 'statistics'
  | 'manager-cycle'
  | 'voting'
  | 'charter'
  | 'how-it-works'
  | 'about'
  | 'faq'
  | 'public-website'
  | 'monthly-pulse'
  | 'active-borrowers'
  | 'approval-queues'
  | 'notification'
  | 'my-profile'
  | 'manager-desk'
  | 'member-registry'
  | 'manager-contributions'
  | 'manager-loans'
  | 'manager-installments'
  | 'site-settings'
  | 'site-activity';

export interface MobileMemberOverviewIconsConfig {
  services: MobileMemberTileId[];
  more: MobileMemberTileId[];
}

export type NomineeGender = 'male' | 'female' | 'other';
export type MemberGender = NomineeGender;
export type MaritalStatus = 'single' | 'married' | 'widowed' | 'divorced';

export interface NomineeInfo {
  name: string;
  nameBn?: string;
  dateOfBirth: string;
  gender: NomineeGender;
  occupation: string;
  relation: string;
  sharePercentage: number;
  nidOrBirthReg: string;
  mobile?: string;
  address: string;
  photoUrl?: string;
}

export interface StructuredBdAddress {
  careOf: string;
  villageRoadHouse: string;
  division: string;
  district: string;
  upazila: string;
  postOffice: string;
  postCode: string;
}

export interface MemberSocialMedia {
  whatsapp?: string;
  facebook?: string;
  linkedin?: string;
}

export interface DigitalAgreementRecord {
  agreementId: string;
  charterVersion: string;
  signedAt: string;
  activatedAt?: string;
  declarationText: string;
  sha256Hash: string;
  storageFormat: 'encrypted_json';
}

export interface PublicAgreementVerification {
  found: boolean;
  projectHeading: string;
  name: string;
  nameBn?: string;
  memberCode: string;
  agreementId?: string;
  joiningDate: string;
  approvalDate: string | null;
  activationDate?: string | null;
  verified: boolean;
  active: boolean;
  status: UserStatus;
}

export interface UserRegistrationDetails {
  nameBn?: string;
  fatherName?: string;
  fatherNameBn?: string;
  motherName?: string;
  motherNameBn?: string;
  gender?: MemberGender;
  maritalStatus?: MaritalStatus;
  spouseName?: string;
  spouseNameBn?: string;
  dateOfBirth: string;
  referenceMemberName: string;
  mobile: string;
  occupation: string;
  companyOrganization: string;
  nid: string;
  presentAddress: string;
  permanentAddress: string;
  presentAddressDetails?: StructuredBdAddress;
  permanentAddressDetails?: StructuredBdAddress;
  socialMedia?: MemberSocialMedia;
  photoUrl: string;
  signatureUrl?: string;
  agreementPhotoUrl?: string;
  nominees?: NomineeInfo[];
  digitalAgreement?: DigitalAgreementRecord;
}

export interface RegisteredDeviceSummary {
  deviceId: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string;
}

export type ThemePreference = 'light' | 'dark';

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
  totpEnabled?: boolean;
  registeredDevices?: RegisteredDeviceSummary[];
  notificationPreferences?: NotificationPreferences;
  mobileOverviewIcons?: MobileMemberOverviewIconsConfig | null;
  themePreference?: ThemePreference;
  registrationDetails?: UserRegistrationDetails;
}

export interface MemberActivationAdminView {
  memberCode: string;
  hasActiveOtp: boolean;
  issuedAt: string;
  issuedByName: string;
  emailSent: boolean;
  emailSentAt?: string;
  emailError?: string;
  activatedAt?: string;
  agreementAcceptedAt?: string;
  failedAttempts?: number;
}

export interface UsedActivationOtpRecord {
  id: string;
  otp: string;
  userId: string;
  memberCode: string;
  issuedAt: string;
  activatedAt?: string;
}

export interface MemberSummary extends PublicUser {
  totalContributed: number;
  approvedContributionsCount: number;
  loansThisYear: number;
  activeLoanBalance: number;
  hasActiveLoan: boolean;
  activationCredentials?: MemberActivationAdminView;
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

export type EmailTemplateKey =
  | 'transactionSummary'
  | 'registrationApproved'
  | 'registrationPendingAdmin'
  | 'tempPassword'
  | 'passwordResetAdminAlert'
  | 'monthlyPdfSummary';

export interface EmailTemplateFormat {
  subject: string;
  greeting: string;
  introBody: string;
  footerNote: string;
  headerColor: string;
}

export type EmailTemplateCollection = Partial<
  Record<EmailTemplateKey, Partial<EmailTemplateFormat>>
>;

export interface FundConfig {
  id: string;
  fundName: string;
  currency: 'BDT' | 'USD' | 'MYR' | 'GBP';
  monthlyContributionAmount: number;
  maxLoansPerYear: number;
  maxLoanAmount: number;
  maxInstallmentMonths: number;
  guarantorThresholdAmount?: number;
  requiredGuarantorsCount?: number;
  voteThresholdNumerator: number;
  voteThresholdDenominator: number;
  projectStartDate?: string; // YYYY-MM-DD — Starting date from which all cooperative calculations are performed
  maturityDate: string; // YYYY-MM-DD
  maxMembersCap?: number;
  membershipIntakeDeadline?: string; // YYYY-MM-DD
  loanSavingsCapPct?: number;
  monthlyDueDay?: number;
  lateFeeAmount?: number;
  registrationFeeAmount?: number;
  managerCycleMonths?: number;
  managerCycleStartDate?: string; // YYYY-MM-DD
  halalInvestmentThesis: string;
  constitutionPdfUrl?: string;
  constitutionPdfName?: string;
  constitutionUploadedAt?: string;
  constitutionUploadedBy?: string;
  googleSheetId?: string;
  googleSheetUrl?: string;
  googleSheetTitle?: string;
  lastSheetSyncAt?: string;
  autoSyncSheet?: boolean;
  lastMonthlyPdfSentMonth?: string;
  monthlyReportAutoEmail?: boolean;
  emailTemplates?: EmailTemplateCollection;
  mobileMemberOverviewIcons?: MobileMemberOverviewIconsConfig;
  faqsSeeded?: boolean;
  updatedAt: string;
  updatedBy: string;
}

export type FaqCategory = 'membership' | 'fund' | 'loans' | 'governance';

export interface FaqItem {
  id: string;
  category: FaqCategory;
  articleRef: string;
  question: string;
  answer: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type UploadDocumentCategory =
  | 'cooperative-constitution'
  | 'member-kyc-photo'
  | 'member-signature'
  | 'member-signed-agreement'
  | 'nominee-kyc-photo'
  | 'contribution-receipt'
  | 'loan-repayment-slip'
  | 'community-post-photo'
  | 'document';

export interface ConstitutionDocumentInfo {
  constitutionPdfUrl: string | null;
  constitutionPdfName: string | null;
  constitutionUploadedAt: string | null;
  constitutionUploadedBy: string | null;
  fundName: string;
}

export interface ReceiptAiExtraction {
  channel: 'bank' | 'mfs';
  providerName: string;
  referenceId: string;
  senderAccount: string;
  amount: number | null;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
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
  receiptPhotoUrl?: string;
  receiptAiSummary?: string;
  batchGroupId?: string;
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

export interface LoanGuarantor {
  memberId: string;
  memberName: string;
  memberCode: string;
  status: 'pending' | 'accepted' | 'declined';
  respondedAt?: string;
  note?: string;
}

export interface LoanRescheduleRequest {
  requestedMonths: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
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
  overdueNotifiedAt?: string;
  repaymentChannel?: 'bank' | 'mfs';
  repaymentProvider?: string;
  maskedReference?: string;
  receiptPhotoUrl?: string;
  encryptedReceipt?: EncryptedEnvelope;
  decryptedReceipt?: RepaymentReceiptDetails;
  verifiedBy?: string;
  verifierName?: string;
  rejectionNote?: string;
  rejectedBy?: string;
  rejectedAt?: string;
}

export interface LoanSensitiveDetails {
  emergencyContext: string;
  disbursementAccount: string;
  channel: 'bank' | 'mfs';
  provider: string;
}

export interface EligibilityCheck {
  noActiveLoan: boolean;
  noOverdueInstallments: boolean;
  overdueCount?: number;
  activeLoanId?: string;
  loansUsedThisYear: number;
  maxLoansPerYear: number;
  quotaAvailable: boolean;
  beforeMaturityDate: boolean;
  memberTotalSavings?: number;
  effectiveMaxLoanAmount?: number;
  effectiveMaxInstallmentMonths?: number;
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
    | 'pending_guarantor'
    | 'pending_manager_review'
    | 'pending_vote'
    | 'approved_pending_disbursement'
    | 'active'
    | 'repaid'
    | 'rejected';
  guarantors?: LoanGuarantor[];
  rescheduleRequest?: LoanRescheduleRequest;
  eligibilitySnapshot: EligibilityCheck;
  votes: LoanVote[];
  requiredApprovals: number;
  totalEligibleVoters: number;
  voteInitiatedAt?: string;
  voteInitiatedBy?: string;
  /** ISO timestamp when the secret ballot closes; members may change votes until this time (or until reveal). */
  voteDeadlineAt?: string;
  voteDurationHours?: number;
  voteResultRevealed?: boolean;
  voteResultRevealedAt?: string;
  voteResultRevealedBy?: string;
  totalVotesCast?: number;
  approveCount?: number;
  rejectCount?: number;
  adminVoteLedger?: LoanVote[];
  disbursementSignature?: {
    signedById: string;
    signedByName: string;
    signedByRole: UserRole;
    signedAt: string;
    signatureHash: string;
    transactionNumber?: string;
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

export interface ProfitDistributionAllocation {
  userId: string;
  memberName: string;
  memberCode: string;
  contributionWeightPct: number;
  payoutAmount: number;
}

export interface ProfitDistributionRecord {
  id: string;
  periodLabel: string;
  realizedProfit: number;
  coopSharePct: number;
  distributablePool: number;
  distributedAt: string;
  distributedBy: string;
  allocations: ProfitDistributionAllocation[];
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
  voteResultRevealed?: boolean;
  revealedAt?: string;
  revealedBy?: string;
  totalVotesCast?: number;
  yesCount?: number;
  noCount?: number;
  adminVoteLedger?: PlacementVote[];
  proposedBy?: string;
  approvedAt?: string;
  realizedProfitTotal?: number;
  distributions?: ProfitDistributionRecord[];
}

export interface DecisionPollVote {
  voterId: string;
  voterName: string;
  voterRole: UserRole;
  optionId: string;
  comment?: string;
  castAt: string;
  signatureHash: string;
  isSelf?: boolean;
}

export interface DecisionPollOption {
  id: string;
  label: string;
  voteCount?: number;
}

export interface DecisionPoll {
  id: string;
  title: string;
  description: string;
  category: 'policy' | 'project' | 'qard_hasan' | 'general';
  options: DecisionPollOption[];
  status: 'open' | 'closed';
  voteResultRevealed: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
  closesAt?: string;
  revealedAt?: string;
  revealedByName?: string;
  votes: DecisionPollVote[];
  totalVotesCast?: number;
  adminVoteLedger?: DecisionPollVote[];
}

export interface CoopMeeting {
  id: string;
  title: string;
  agenda: string;
  scheduledFor: string;
  locationOrLink: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  createdById: string;
  createdByName: string;
  createdAt: string;
}

export interface ProfileChangePayload {
  name?: string;
  nameBn?: string;
  email?: string;
  fatherName?: string;
  fatherNameBn?: string;
  motherName?: string;
  motherNameBn?: string;
  gender?: MemberGender;
  maritalStatus?: MaritalStatus;
  spouseName?: string;
  spouseNameBn?: string;
  dateOfBirth?: string;
  referenceMemberName?: string;
  mobile?: string;
  occupation?: string;
  companyOrganization?: string;
  nid?: string;
  presentAddress?: string;
  permanentAddress?: string;
  presentAddressDetails?: StructuredBdAddress;
  permanentAddressDetails?: StructuredBdAddress;
  socialMedia?: MemberSocialMedia;
  photoUrl?: string;
  signatureUrl?: string;
  nominees?: NomineeInfo[];
}

export interface ProfileChangeRequest {
  id: string;
  userId: string;
  memberName: string;
  memberCode: string;
  memberRole: UserRole;
  requestedChanges: ProfileChangePayload;
  previousValues?: ProfileChangePayload;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  reviewedBy?: string;
  reviewerName?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface ActiveBorrowerSummary {
  loanId: string;
  borrowerId: string;
  borrowerName: string;
  borrowerCode: string;
  mainAmount: number;
  dueAmount: number;
  totalRepaid: number;
  nextDueDate?: string;
  missedInstallmentsCount: number;
}

export interface MonthClearanceEntry {
  userId: string;
  memberName: string;
  memberCode: string;
  role: UserRole;
  cleared: boolean;
  contributedAmount: number;
  targetAmount: number;
  status: 'cleared' | 'pending' | 'due';
}

export type NotificationType =
  | 'signup_pending_admin'
  | 'signup_activation_issued'
  | 'signup_approved'
  | 'contribution_placed_manager'
  | 'contribution_accepted'
  | 'contribution_rejected'
  | 'loan_vote_requested'
  | 'loan_guarantor_requested'
  | 'loan_approved_confirmation'
  | 'loan_rejected_notice'
  | 'loan_repayment_notice'
  | 'loan_repayment_rejected'
  | 'monthly_contribution_reminder'
  | 'profit_distribution_notice'
  | 'meeting_scheduled'
  | 'decision_vote_requested'
  | 'profile_update_requested'
  | 'profile_update_reviewed'
  | 'community_post_created'
  | 'community_moderation'
  | 'community_mention'
  | 'cooperative_notice';

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

export type FcmPushPlatform = 'web' | 'pwa' | 'android' | 'ios';

export interface FcmDeviceTokenRecord {
  id: string;
  userId: string;
  token: string;
  platform: FcmPushPlatform;
  userAgentLabel?: string;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt?: string;
}

export interface FirebaseClientWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface PushNotificationStatusResponse {
  configuredServer: boolean;
  configuredClient: boolean;
  vapidPublicKey: string;
  firebaseConfig: FirebaseClientWebConfig | null;
  devicesCount: number;
  devices: Array<{
    id: string;
    platform: FcmPushPlatform;
    userAgentLabel?: string;
    updatedAt: string;
    lastSuccessAt?: string;
  }>;
  pushAlertsEnabled: boolean;
}

export interface PushTestResponse {
  ok: boolean;
  deliveredCount: number;
  failedCount: number;
  removedInvalidCount: number;
  totalDevices: number;
  configuredServer: boolean;
  reason?: string;
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
  hashVerified?: boolean;
  chainLinkVerified?: boolean;
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
    amanahHeight: number;
    currentBalance: number;
    quardHasanTotalCurrent: number;
    totalLoansDisbursed: number;
    approvedLoansDeducted: number;
    totalRepaid: number;
    activeLoansOutstanding: number;
    centralBalance: number;
    availableLiquidity: number;
    pendingContributionsAmount: number;
    pendingContributionsCount: number;
    pendingLoansReviewCount: number;
    pendingVotesCount: number;
    pendingDisbursementsCount: number;
    pendingRepaymentsCount: number;
    overdueInstallmentsCount: number;
    totalProfitDistributedPool: number;
    activeMembersCount: number;
    contributingMembersCount: number;
    pendingMembersCount: number;
    pendingProfileRequestsCount: number;
    openDecisionPollsCount: number;
    upcomingMeetingsCount: number;
    unreadNotificationsCount: number;
    emailQueueAttentionCount?: number;
    thisMonthKey: string;
    thisMonthContributionTarget: number;
    thisMonthContributionCollected: number;
    thisMonthDueTarget: number;
    thisMonthDueRemaining: number;
    thisMonthHasanInstallmentNeed: number;
    thisMonthHasanInstallmentCollected: number;
    thisMonthClearanceTotalMembers: number;
    thisMonthClearanceClearedMembers: number;
    activeBorrowers: ActiveBorrowerSummary[];
    thisMonthMemberClearance: MonthClearanceEntry[];
  };
  personal: {
    totalContributed: number;
    approvedContributionsCount: number;
    pendingContributionsCount: number;
    lastContribution: {
      id: string;
      billingMonth: string;
      amount: number;
      submittedAt: string;
      status: Contribution['status'];
    } | null;
    nextContributionDeadline: string;
    dueContributionMonths: number;
    dueContributionAmount: number;
    activeLoanBalance: number;
    activeLoanMainAmount: number;
    activeLoanDueAmount: number;
    totalRepaidPersonal: number;
    lastHasanInstallment: {
      loanId: string;
      installmentNumber: number;
      amount: number;
      paidAt: string;
    } | null;
    missedInstallmentsCount: number;
    missedInstallmentsAmount: number;
    nextLoanDeadline: string | null;
    nextOverallDeadline: string;
    totalProfitDistributed: number;
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
  mentions?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface CommunityPollOption {
  id: string;
  text: string;
  voterIds: string[];
}

export interface CommunityPoll {
  question: string;
  allowMultiple: boolean;
  closesAt?: string;
  options: CommunityPollOption[];
}

export type CommunityPostLinkKind = 'link' | 'photo' | 'video' | 'document';

export interface CommunityPostLink {
  url: string;
  label?: string;
  kind?: CommunityPostLinkKind;
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
  links?: CommunityPostLink[];
  poll?: CommunityPoll;
  mentions?: string[];
  reactions: CommunityReaction[];
  comments: CommunityComment[];
  isPinned: boolean;
  commentsLocked: boolean;
  status: 'active' | 'hidden' | 'draft';
  moderationReason?: string;
  moderatedByName?: string;
  moderatedAt?: string;
  /** Optional link to the loan that triggered this auto-generated post (drafts from loan approval). */
  relatedLoanId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MemberPublicProfileAbout {
  email: string;
  mobile?: string;
  occupation?: string;
  companyOrganization?: string;
  presentAddress?: string;
  referenceMemberName?: string;
  joinedAt: string;
  postsCount: number;
  commentsCount: number;
  reactionsReceivedCount: number;
}

export interface MemberPublicProfileContributionItem {
  id: string;
  billingMonth: string;
  amount: number;
  channel: 'bank' | 'mfs';
  submittedAt: string;
  status: 'approved';
}

export interface MemberPublicProfileFundSummary {
  currency: FundConfig['currency'];
  monthlyTarget: number;
  totalContributed: number;
  approvedContributionsCount: number;
  pendingContributionsCount: number;
  approvedMonthsCount: number;
  currentStreakMonths: number;
  consistencyScore: number;
  currentMonthPaid: boolean;
  fundSharePct: number;
  totalProfitDistributed: number;
  activeLoanBalance: number;
  totalRepaid: number;
  totalLoansTakenCount: number;
  loansRepaidCount: number;
  guarantorCount: number;
  recentContributions: MemberPublicProfileContributionItem[];
}

export interface MemberPublicProfile {
  id: string;
  name: string;
  memberCode: string;
  role: UserRole;
  status: UserStatus;
  joinedAt: string;
  photoUrl?: string;
  isSelf: boolean;
  about: MemberPublicProfileAbout;
  fundSummary: MemberPublicProfileFundSummary;
  communityPosts: CommunityPost[];
}

export interface ManagerCycleSlot {
  cycleNumber: number;
  memberId: string;
  memberName: string;
  memberCode: string;
  currentRole: UserRole;
  joinedAt?: string;
  photoUrl?: string;
  startDate: string;
  endDate: string;
  status: 'completed' | 'current' | 'upcoming';
}

export interface ManagerCycleSchedule {
  cycleMonths: number;
  cycleStartDate: string;
  eligibleMembersCount: number;
  currentCycleNumber: number | null;
  currentSlot: ManagerCycleSlot | null;
  nextSlot: ManagerCycleSlot | null;
  activeDesignatedManagers: Array<{
    id: string;
    name: string;
    memberCode: string;
    photoUrl?: string;
  }>;
  slots: ManagerCycleSlot[];
}

export type NoticePriority = 'normal' | 'important' | 'urgent';

export interface CoopNotice {
  id: string;
  title: string;
  body: string;
  priority: NoticePriority;
  pinned?: boolean;
  authorId: string;
  authorName: string;
  authorCode: string;
  authorRole: UserRole;
  createdAt: string;
  updatedAt?: string;
}

export interface PasswordResetRequest {
  id: string;
  userId: string;
  memberName: string;
  memberCode: string;
  email: string;
  reason?: string;
  status: 'pending' | 'completed' | 'declined';
  requestedAt: string;
  resolvedAt?: string;
  resolvedById?: string;
  resolvedByName?: string;
  emailSent?: boolean;
  resolutionNote?: string;
}

export type EmailQueueStatus = 'pending' | 'retrying' | 'sent' | 'failed';

export type EmailQueueCategory =
  | 'transaction'
  | 'registration'
  | 'password_reset'
  | 'monthly_pdf'
  | 'template_test'
  | 'general';

export interface EmailQueueAttachment {
  filename: string;
  contentBase64: string;
  contentType?: string;
}

export interface EmailQueueItem {
  id: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailQueueAttachment[];
  category: EmailQueueCategory;
  status: EmailQueueStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  messageId?: string;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}

export interface EmailQueueStats {
  total: number;
  pending: number;
  retrying: number;
  failed: number;
  sent: number;
}

export interface AdminSystemStatus {
  storageEngine: 'mongodb_atlas' | 'encrypted_local_vault';
  encryption: {
    configured: boolean;
    mode: 'custom_aes256' | 'jwt_derived' | 'dev_fallback';
  };
  smtp: {
    configured: boolean;
    host: string | null;
    port: number;
    secure: boolean;
    from: string | null;
    queueStats: EmailQueueStats;
  };
  mediaStorage: {
    provider: 'imagekit' | 'imgbb' | 'local_vault';
    folder: string | null;
    urlEndpointConfigured: boolean;
  };
  geminiAi: {
    configured: boolean;
    model: string;
  };
  groqAi?: {
    configured: boolean;
    model: string;
    features: string[];
  };
  fcmPush?: {
    configuredServer: boolean;
    vapidConfigured: boolean;
    registeredDevicesCount: number;
    subscribedMembersCount: number;
  };
  totals: {
    activeMembers: number;
    pendingMembers: number;
    contributionsCount: number;
    loansCount: number;
    halalProjectsCount: number;
    auditLogsCount: number;
  };
  runtime: {
    nodeVersion: string;
    uptimeSeconds: number;
  };
}

export type AiRewriteContext =
  | 'community_post'
  | 'meeting_schedule'
  | 'notice'
  | 'loan_purpose'
  | 'poll'
  | 'investment_thesis'
  | 'faq'
  | 'general';

export type AiRewriteTone = 'clear' | 'concise' | 'formal';

export interface AiRewriteResult {
  rewrittenTitle?: string;
  rewrittenText: string;
  improvements: string[];
  model: string;
}

export interface AiSpamCheckResult {
  isSpam: boolean;
  riskLevel: 'safe' | 'caution' | 'spam';
  reason: string;
  flaggedLinks: string[];
  signals: string[];
  checkedWith: 'groq' | 'heuristic';
  model?: string;
}

export interface MonthlySheetSummaryMetrics {
  contributionAmount: number;
  qardHasanAmount: number;
  dueHasanaAmount: number;
}

export interface MonthlySheetUserThisMonthMetrics extends MonthlySheetSummaryMetrics {
  repaidAmount: number;
  dueChangeAmount: number;
}

export interface MonthlySheetMemberRow {
  serialNo: number;
  userId: string;
  name: string;
  memberCode: string;
  photoUrl?: string;
  role: UserRole;
  mobile: string;
  email: string;
  contributionStatus: 'paid' | 'partial' | 'pending' | 'due';
  contributionAmount: number;
  contributionPendingAmount: number;
  contributionTarget: number;
  hasQardHasan: boolean;
  qardHasanAmount: number;
  activeLoanId?: string;
  dueHasanaAmount: number;
  installmentDueThisMonth: number;
  previousSummary: MonthlySheetSummaryMetrics;
  thisMonth: MonthlySheetUserThisMonthMetrics;
  thisMonthSummary: MonthlySheetSummaryMetrics;
}

export interface MonthlySheetData {
  month: string; // YYYY-MM
  previousMonth: string; // YYYY-MM
  nextMonth: string; // YYYY-MM
  currency: FundConfig['currency'];
  monthlyTarget: number;
  availableMonths: string[];
  previousMonthSummary: MonthlySheetSummaryMetrics;
  thisMonthOnly: MonthlySheetSummaryMetrics;
  thisMonthRepaidAmount: number;
  thisMonthSummary: MonthlySheetSummaryMetrics; // previous + this month (rolls into next month's previousMonthSummary)
  fundSummary: {
    fundHeight: number;
    totalQardHasan: number;
    totalDueHasana: number;
  };
  rows: MonthlySheetMemberRow[];
}


