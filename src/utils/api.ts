import type {
  AdminSystemStatus,
  AiRewriteContext,
  AiRewriteResult,
  AiRewriteTone,
  AiSpamCheckResult,
  AuditLogEntry,
  CommunityCategory,
  CommunityPost,
  CommunityPostLink,
  CommunityReactionType,
  ConstitutionDocumentInfo,
  Contribution,
  ConversationThreadSummary,
  CoopMeeting,
  CoopNotice,
  DashboardOverview,
  DecisionPoll,
  EligibilityCheck,
  EmailNotification,
  EmailQueueCategory,
  EmailQueueStats,
  EmailQueueStatus,
  EmailTemplateCollection,
  EmailTemplateFormat,
  EmailTemplateKey,
  FaqCategory,
  FaqItem,
  FundConfig,
  HalalProject,
  LoanRequest,
  ManagerCycleSchedule,
  MemberPublicProfile,
  MemberSummary,
  NomineeInfo,
  NoticePriority,
  NotificationPreferences,
  PasswordResetRequest,
  PrivateMessage,
  ProfileChangeRequest,
  PublicUser,
  ReceiptAiExtraction,
  UploadDocumentCategory,
  UserRole,
  UserStatus,
} from '../types/coop.ts';

type TotpChallengeHandler = (message: string) => Promise<string | null>;
let totpChallengeHandler: TotpChallengeHandler | null = null;

export function registerTotpChallengeHandler(handler: TotpChallengeHandler | null): void {
  totpChallengeHandler = handler;
}

async function apiRequest<T>(path: string, init?: RequestInit, hasRetriedTotp = false): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code = '';
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data?.error) message = data.error;
      if (data?.code) code = data.code;
    } catch {
      // ignore non-json
    }

    if (res.status === 403 && code === 'TOTP_REQUIRED' && !hasRetriedTotp && totpChallengeHandler) {
      const totpCode = await totpChallengeHandler(message);
      if (!totpCode) {
        throw new Error('Two-factor authentication cancelled.');
      }
      return apiRequest<T>(
        path,
        {
          ...init,
          headers: {
            ...(init?.headers || {}),
            'X-TOTP-Code': totpCode,
          },
        },
        true
      );
    }

    throw new Error(message);
  }

  return (await res.json()) as T;
}

export interface SheetTabBlueprint {
  sheetName: string;
  rows: (string | number)[][];
}

export interface RegisterMemberPayload {
  name: string;
  email: string;
  password: string;
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
  nominees: NomineeInfo[];
}

export const api = {
  getMe: () => apiRequest<{ user: PublicUser }>('/api/auth/me'),
  getProfile: () => apiRequest<{ user: PublicUser }>('/api/profile'),
  updateProfile: (payload: {
    name?: string;
    email?: string;
    mobile: string;
    presentAddress: string;
    permanentAddress: string;
    occupation?: string;
    companyOrganization?: string;
  }) =>
    apiRequest<{
      pendingApproval?: boolean;
      user: PublicUser;
      request?: ProfileChangeRequest;
      message?: string;
    }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ ok: boolean; user: PublicUser }>('/api/profile/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  getProfileChangeRequests: () =>
    apiRequest<{ requests: ProfileChangeRequest[] }>('/api/profile/change-requests'),
  reviewProfileChangeRequest: (
    id: string,
    decision: 'approved' | 'rejected',
    reviewNote?: string
  ) =>
    apiRequest<{ request: ProfileChangeRequest }>(`/api/profile/change-requests/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reviewNote }),
    }),
  login: (email: string, password: string) =>
    apiRequest<{ user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  forgotPassword: (email: string, reason?: string) =>
    apiRequest<{ ok: boolean; message: string; adminCount: number }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, reason }),
    }),
  getReferenceMembers: () =>
    apiRequest<{ members: Array<{ name: string; memberCode: string }> }>('/api/auth/references'),
  uploadFile: async (
    file: File,
    options?:
      | string
      | {
          name?: string;
          category?: UploadDocumentCategory;
          subject?: string;
        }
  ): Promise<{
    url: string;
    provider: string;
    fileId?: string;
    mimeType?: string;
    filename?: string;
    originalName?: string;
    category?: UploadDocumentCategory;
  }> => {
    const fileBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read selected file.'));
      reader.readAsDataURL(file);
    });
    const opts = typeof options === 'string' ? { name: options } : options || {};
    return apiRequest<{
      url: string;
      provider: string;
      fileId?: string;
      mimeType?: string;
      filename?: string;
      originalName?: string;
      category?: UploadDocumentCategory;
    }>('/api/upload', {
      method: 'POST',
      body: JSON.stringify({
        fileBase64,
        name: opts.name || file.name,
        category: opts.category,
        subject: opts.subject,
        mimeType: file.type || undefined,
      }),
    });
  },
  uploadImage: async (
    file: File,
    options?:
      | string
      | {
          name?: string;
          category?: UploadDocumentCategory;
          subject?: string;
        }
  ): Promise<{ url: string; provider: string; filename?: string }> => {
    const fileBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read selected image file.'));
      reader.readAsDataURL(file);
    });
    const opts = typeof options === 'string' ? { name: options } : options || {};
    return apiRequest<{ url: string; provider: string; filename?: string }>('/api/upload', {
      method: 'POST',
      body: JSON.stringify({
        fileBase64,
        name: opts.name || file.name,
        category: opts.category,
        subject: opts.subject,
        mimeType: file.type || undefined,
      }),
    });
  },
  getConstitution: () => apiRequest<ConstitutionDocumentInfo>('/api/constitution'),
  uploadConstitutionPdf: async (
    file: File,
    title?: string
  ): Promise<{
    config: FundConfig;
    constitutionPdfUrl: string;
    constitutionPdfName: string;
    provider: string;
  }> => {
    const fileBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read selected PDF file.'));
      reader.readAsDataURL(file);
    });
    return apiRequest<{
      config: FundConfig;
      constitutionPdfUrl: string;
      constitutionPdfName: string;
      provider: string;
    }>('/api/admin/constitution', {
      method: 'POST',
      body: JSON.stringify({
        fileBase64,
        name: file.name,
        title: title?.trim() || file.name,
      }),
    });
  },
  removeConstitutionPdf: () =>
    apiRequest<{ config: FundConfig }>('/api/admin/constitution', {
      method: 'DELETE',
    }),
  setup2fa: () =>
    apiRequest<{ secret: string; otpAuthUri: string; qrDataUrl: string }>('/api/auth/2fa/setup', {
      method: 'POST',
    }),
  enable2fa: (code: string) =>
    apiRequest<{ user: PublicUser }>('/api/auth/2fa/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  disable2fa: (code: string) =>
    apiRequest<{ user: PublicUser }>('/api/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  updatePreferences: (prefs: Partial<NotificationPreferences>) =>
    apiRequest<{ user: PublicUser }>('/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),
  verifyReceiptWithGemini: async (file: File): Promise<{ extraction: ReceiptAiExtraction }> => {
    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read selected receipt image.'));
      reader.readAsDataURL(file);
    });
    return apiRequest<{ extraction: ReceiptAiExtraction }>('/api/gemini/verify-receipt', {
      method: 'POST',
      body: JSON.stringify({ imageBase64 }),
    });
  },
  register: (payload: RegisterMemberPayload) =>
    apiRequest<{ pendingApproval?: boolean; message?: string; user: PublicUser }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  logout: () => apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  getDashboard: () => apiRequest<DashboardOverview>('/api/dashboard'),

  getContributions: () => apiRequest<{ contributions: Contribution[] }>('/api/contributions'),
  submitContribution: (payload: {
    billingMonth: string;
    billingMonths?: string[];
    amount: number;
    channel: 'bank' | 'mfs';
    providerName: string;
    referenceId: string;
    senderAccount: string;
    notes?: string;
    receiptPhotoUrl?: string;
    receiptAiSummary?: string;
  }) =>
    apiRequest<{ contribution: Contribution; contributions?: Contribution[] }>('/api/contributions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reviewContribution: (id: string, decision: 'approved' | 'rejected', reviewNote?: string) =>
    apiRequest<{ contribution: Contribution }>(`/api/contributions/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reviewNote }),
    }),

  getEligibility: () => apiRequest<{ eligibility: EligibilityCheck }>('/api/loans/eligibility'),
  getLoans: () => apiRequest<{ loans: LoanRequest[] }>('/api/loans'),
  requestLoan: (payload: {
    amount: number;
    installmentMonths: number;
    purpose: string;
    emergencyContext?: string;
    channel: 'bank' | 'mfs';
    provider: string;
    disbursementAccount: string;
    guarantorIds?: string[];
  }) =>
    apiRequest<{ loan: LoanRequest }>('/api/loans', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  withdrawLoan: (id: string) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/withdraw`, {
      method: 'POST',
    }),
  respondAsGuarantor: (id: string, decision: 'accept' | 'decline', note?: string) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/guarantor-respond`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    }),
  initiateLoanVote: (id: string, payload?: { durationHours?: number }) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/initiate-vote`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  extendLoanVoteDeadline: (id: string, additionalHours: number) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/extend-vote-deadline`, {
      method: 'POST',
      body: JSON.stringify({ additionalHours }),
    }),
  revealLoanVote: (id: string) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/reveal-vote`, {
      method: 'POST',
    }),
  voteLoan: (
    id: string,
    decision: 'approve' | 'reject' | 'upvote' | 'downvote',
    comment?: string
  ) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    }),
  adminReviewLoan: (id: string, decision: 'approve' | 'reject', reviewNote?: string) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/admin-review`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reviewNote }),
    }),
  disburseLoan: (id: string, payload?: { transactionNumber?: string }) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/disburse`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  submitInstallmentRepayment: (
    loanId: string,
    installmentNumber: number,
    payload: {
      channel: 'bank' | 'mfs';
      providerName: string;
      referenceId: string;
      senderAccount: string;
      notes?: string;
      receiptPhotoUrl?: string;
    }
  ) =>
    apiRequest<{ loan: LoanRequest }>(
      `/api/loans/${loanId}/installments/${installmentNumber}/submit`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  verifyInstallmentRepayment: (
    loanId: string,
    installmentNumber: number,
    decision: 'approve' | 'reject',
    reviewNote?: string
  ) =>
    apiRequest<{ loan: LoanRequest }>(
      `/api/loans/${loanId}/installments/${installmentNumber}/verify`,
      {
        method: 'PATCH',
        body: JSON.stringify({ decision, reviewNote }),
      }
    ),
  requestLoanReschedule: (loanId: string, payload: { requestedMonths: number; reason: string }) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${loanId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reviewLoanReschedule: (
    loanId: string,
    decision: 'approve' | 'reject',
    reviewNote?: string
  ) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${loanId}/reschedule/review`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reviewNote }),
    }),

  getHalalProjects: () => apiRequest<{ projects: HalalProject[] }>('/api/halal-projects'),
  createHalalProject: (payload: {
    title: string;
    sector: string;
    shariahStructure: 'Mudarabah' | 'Musharakah' | 'Murabahah';
    targetAllocation: number;
    projectedAnnualReturn: string;
    riskTier: 'Conservative' | 'Balanced' | 'Growth';
    shariahScholarNote: string;
  }) =>
    apiRequest<{ project: HalalProject }>('/api/halal-projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  voteHalalProject: (id: string, decision: 'yes' | 'no', comment?: string) =>
    apiRequest<{ project: HalalProject }>(`/api/halal-projects/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    }),
  revealHalalProjectVote: (id: string) =>
    apiRequest<{ project: HalalProject }>(`/api/halal-projects/${id}/reveal`, {
      method: 'POST',
    }),
  distributeHalalProfit: (
    id: string,
    payload: { periodLabel: string; realizedProfit: number; coopSharePct: number }
  ) =>
    apiRequest<{ project: HalalProject }>(`/api/halal-projects/${id}/distribute`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getActiveMembers: () =>
    apiRequest<{ members: import('../types/coop.ts').ActiveMemberDirectoryItem[] }>(
      '/api/members/active'
    ),
  getMemberProfile: (memberId: string) =>
    apiRequest<{ profile: MemberPublicProfile }>(
      `/api/members/${encodeURIComponent(memberId)}/profile`
    ),
  getManagerCycle: () => apiRequest<{ schedule: ManagerCycleSchedule }>('/api/manager-cycle'),
  getPendingRegistrations: () =>
    apiRequest<{ registrations: MemberSummary[] }>('/api/admin/registrations/pending'),
  getMembers: () => apiRequest<{ members: MemberSummary[] }>('/api/admin/members'),
  createMember: (payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    status: UserStatus;
    mobile?: string;
    occupation?: string;
    companyOrganization?: string;
    presentAddress?: string;
    permanentAddress?: string;
    nid?: string;
    dateOfBirth?: string;
  }) =>
    apiRequest<{ members: MemberSummary[] }>('/api/admin/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMember: (
    id: string,
    payload: {
      role?: UserRole;
      status?: UserStatus;
      name?: string;
      email?: string;
      password?: string;
      mobile?: string;
      occupation?: string;
      companyOrganization?: string;
      presentAddress?: string;
      permanentAddress?: string;
    }
  ) =>
    apiRequest<{
      members: MemberSummary[];
      approvedNow?: boolean;
      emailSent?: boolean;
      emailReason?: string;
    }>(`/api/admin/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  declinePendingMember: (id: string) =>
    apiRequest<{ members: MemberSummary[] }>(`/api/admin/members/${id}`, {
      method: 'DELETE',
    }),
  deleteMember: (id: string) =>
    apiRequest<{ members: MemberSummary[] }>(`/api/admin/members/${id}`, {
      method: 'DELETE',
    }),
  updateConfig: (
    payload: Omit<Partial<FundConfig>, 'emailTemplates'> & {
      emailTemplates?:
        | EmailTemplateCollection
        | Partial<Record<EmailTemplateKey, Partial<EmailTemplateFormat> | null>>
        | null;
    }
  ) =>
    apiRequest<{ config: FundConfig }>('/api/admin/config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getAdminSystemStatus: () =>
    apiRequest<AdminSystemStatus>('/api/admin/system-status'),
  sendTestTemplateEmail: (payload: {
    templateKey: EmailTemplateKey;
    template?: Partial<EmailTemplateFormat>;
    recipientEmail?: string;
  }) =>
    apiRequest<{
      ok: boolean;
      sent: boolean;
      smtpConfigured: boolean;
      recipientEmail: string;
      subject: string;
      reason?: string;
      queuedId?: string;
    }>('/api/admin/email-templates/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin Persistent Email Retry Queue Monitor
  getEmailQueue: (
    status: 'all' | 'attention' | 'pending' | 'retrying' | 'failed' | 'sent' = 'all'
  ) =>
    apiRequest<{
      items: Array<{
        id: string;
        to: string[];
        subject: string;
        text: string;
        textPreview: string;
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
        attachmentFilenames: string[];
      }>;
      stats: EmailQueueStats;
      smtpConfigured: boolean;
    }>(`/api/admin/email-queue?status=${encodeURIComponent(status)}`),
  processEmailQueue: () =>
    apiRequest<{
      ok: boolean;
      processed: number;
      sent: number;
      failed: number;
      stats: EmailQueueStats;
      smtpConfigured: boolean;
    }>('/api/admin/email-queue/process', { method: 'POST', body: JSON.stringify({ forceAllPending: true }) }),
  retryAllEmailQueue: () =>
    apiRequest<{
      ok: boolean;
      queuedCount: number;
      processed: number;
      sent: number;
      failed: number;
      stats: EmailQueueStats;
      smtpConfigured: boolean;
    }>('/api/admin/email-queue/retry-all', { method: 'POST' }),
  retryEmailQueueItem: (id: string) =>
    apiRequest<{
      ok: boolean;
      sent: boolean;
      reason?: string;
      stats: EmailQueueStats;
      smtpConfigured: boolean;
    }>(`/api/admin/email-queue/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
    }),
  clearSentEmailQueue: () =>
    apiRequest<{
      ok: boolean;
      removedCount: number;
      stats: EmailQueueStats;
    }>('/api/admin/email-queue/sent', {
      method: 'DELETE',
    }),
  deleteEmailQueueItem: (id: string) =>
    apiRequest<{
      ok: boolean;
      id: string;
      stats: EmailQueueStats;
    }>(`/api/admin/email-queue/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  getAuditLogs: () =>
    apiRequest<{
      logs: AuditLogEntry[];
      chainValid: boolean;
      integrity?: { totalEntries: number; verifiedEntries: number; brokenLinks: string[] };
    }>('/api/audit-logs'),

  getNotifications: () =>
    apiRequest<{ notifications: EmailNotification[] }>('/api/notifications'),
  markNotificationRead: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  sendReminders: (billingMonth?: string) =>
    apiRequest<{ createdCount: number; notifications: EmailNotification[] }>(
      '/api/notifications/reminders',
      {
        method: 'POST',
        body: JSON.stringify({ billingMonth }),
      }
    ),

  getBlueprint: () =>
    apiRequest<{ tabs: SheetTabBlueprint[]; config: FundConfig }>('/api/workspace/blueprint'),
  syncGoogleSheet: (
    googleToken: string,
    opts?: { createNew?: boolean; autoSyncSheet?: boolean }
  ) =>
    apiRequest<{
      spreadsheetId: string;
      spreadsheetUrl: string;
      lastSheetSyncAt: string;
      autoSyncSheet?: boolean;
      syncedTabs: number;
      config: FundConfig;
    }>('/api/workspace/sheets/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleToken}`,
      },
      body: JSON.stringify(opts || {}),
    }),
  sendViaGmail: (googleToken: string, notificationIds?: string[]) =>
    apiRequest<{
      sentCount: number;
      failedCount: number;
      errors: string[];
      notifications: EmailNotification[];
    }>('/api/workspace/gmail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleToken}`,
      },
      body: JSON.stringify({ notificationIds }),
    }),

  // Community Forum & Moderation
  getCommunityPosts: () => apiRequest<{ posts: CommunityPost[] }>('/api/community/posts'),
  createCommunityPost: (payload: {
    category: CommunityCategory;
    title: string;
    content: string;
    links?: CommunityPostLink[];
    poll?: { question: string; allowMultiple?: boolean; options: string[] };
  }) =>
    apiRequest<{ post: CommunityPost }>('/api/community/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  voteCommunityPoll: (postId: string, optionIds: string[]) =>
    apiRequest<{ post: CommunityPost }>(`/api/community/posts/${postId}/poll-vote`, {
      method: 'POST',
      body: JSON.stringify({ optionIds }),
    }),
  updateCommunityPost: (
    id: string,
    payload: {
      category?: CommunityCategory;
      title?: string;
      content?: string;
      links?: CommunityPostLink[];
    }
  ) =>
    apiRequest<{ post: CommunityPost }>(`/api/community/posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteCommunityPost: (id: string, reason?: string) =>
    apiRequest<{ ok: boolean; id: string }>(`/api/community/posts/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
  reactCommunityPost: (id: string, type: CommunityReactionType) =>
    apiRequest<{ post: CommunityPost }>(`/api/community/posts/${id}/react`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),
  addCommunityComment: (postId: string, content: string) =>
    apiRequest<{ post: CommunityPost }>(`/api/community/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  updateCommunityComment: (postId: string, commentId: string, content: string) =>
    apiRequest<{ post: CommunityPost }>(
      `/api/community/posts/${postId}/comments/${commentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }
    ),
  deleteCommunityComment: (postId: string, commentId: string, reason?: string) =>
    apiRequest<{ post: CommunityPost }>(
      `/api/community/posts/${postId}/comments/${commentId}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      }
    ),
  moderateCommunityPost: (
    postId: string,
    action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'hide' | 'restore',
    reason?: string
  ) =>
    apiRequest<{ post: CommunityPost }>(`/api/community/posts/${postId}/moderate`, {
      method: 'PATCH',
      body: JSON.stringify({ action, reason }),
    }),
  toggleCommunityMuteMember: (userId: string, muted: boolean, reason?: string) =>
    apiRequest<{ ok: boolean; userId: string; targetName: string; muted: boolean }>(
      `/api/community/members/${userId}/mute`,
      {
        method: 'PATCH',
        body: JSON.stringify({ muted, reason }),
      }
    ),

  // Private Messaging
  getPrivateThreads: () =>
    apiRequest<{
      threads: ConversationThreadSummary[];
      totalUnread: number;
      directory: Array<{
        id: string;
        name: string;
        role: UserRole;
        memberCode: string;
        photoUrl?: string;
      }>;
    }>('/api/messages/threads'),
  getPrivateConversation: (peerId: string) =>
    apiRequest<{
      peer: {
        id: string;
        name: string;
        memberCode: string;
        role: UserRole;
        photoUrl?: string;
      };
      messages: PrivateMessage[];
    }>(`/api/messages/with/${peerId}`),
  sendPrivateMessage: (peerId: string, body: string) =>
    apiRequest<{ message: PrivateMessage }>(`/api/messages/with/${peerId}`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  deletePrivateMessage: (messageId: string) =>
    apiRequest<{ ok: boolean; messageId: string }>(`/api/messages/${messageId}`, {
      method: 'DELETE',
    }),

  // Decision Opinion Polls & Meetings
  getPolls: () => apiRequest<{ polls: DecisionPoll[] }>('/api/polls'),
  createPoll: (payload: {
    title: string;
    description?: string;
    category?: DecisionPoll['category'];
    options: string[];
    closesAt?: string;
  }) =>
    apiRequest<{ poll: DecisionPoll }>('/api/polls', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  votePoll: (id: string, optionId: string, comment?: string) =>
    apiRequest<{ poll: DecisionPoll }>(`/api/polls/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionId, comment }),
    }),
  revealPoll: (id: string) =>
    apiRequest<{ poll: DecisionPoll }>(`/api/polls/${id}/reveal`, {
      method: 'POST',
    }),

  getMeetings: () => apiRequest<{ meetings: CoopMeeting[] }>('/api/meetings'),
  createMeeting: (payload: {
    title: string;
    agenda?: string;
    scheduledFor: string;
    locationOrLink: string;
  }) =>
    apiRequest<{ meeting: CoopMeeting }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMeetingStatus: (id: string, status: CoopMeeting['status']) =>
    apiRequest<{ meeting: CoopMeeting }>(`/api/meetings/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Cooperative Notice Board (Authenticated members view; Admin/Manager manage)
  getNotices: () => apiRequest<{ notices: CoopNotice[] }>('/api/notices'),
  createNotice: (payload: {
    title: string;
    body: string;
    priority?: NoticePriority;
    pinned?: boolean;
  }) =>
    apiRequest<{ notice: CoopNotice }>('/api/notices', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateNotice: (
    id: string,
    payload: {
      title?: string;
      body?: string;
      priority?: NoticePriority;
      pinned?: boolean;
    }
  ) =>
    apiRequest<{ notice: CoopNotice }>(`/api/notices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteNotice: (id: string) =>
    apiRequest<{ ok: boolean; id: string }>(`/api/notices/${id}`, {
      method: 'DELETE',
    }),

  // Frequently Asked Questions (Public read; Admin add/edit/delete)
  getFaqs: () => apiRequest<{ faqs: FaqItem[] }>('/api/faqs'),
  createFaq: (payload: {
    category: FaqCategory;
    articleRef?: string;
    question: string;
    answer: string;
  }) =>
    apiRequest<{ faq: FaqItem; faqs: FaqItem[] }>('/api/faqs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFaq: (
    id: string,
    payload: {
      category?: FaqCategory;
      articleRef?: string;
      question?: string;
      answer?: string;
      sortOrder?: number;
    }
  ) =>
    apiRequest<{ faq: FaqItem; faqs: FaqItem[] }>(`/api/faqs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteFaq: (id: string) =>
    apiRequest<{ ok: boolean; id: string; faqs: FaqItem[] }>(`/api/faqs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // Admin Password Reset Requests & Temporary Password Dispatch
  getPasswordResetRequests: () =>
    apiRequest<{ requests: PasswordResetRequest[] }>('/api/admin/password-reset-requests'),
  declinePasswordResetRequest: (id: string, note?: string) =>
    apiRequest<{ ok: boolean; request: PasswordResetRequest }>(
      `/api/admin/password-reset-requests/${id}/decline`,
      {
        method: 'PATCH',
        body: JSON.stringify({ note }),
      }
    ),
  adminResetMemberPassword: (id: string, tempPassword?: string) =>
    apiRequest<{
      ok: boolean;
      emailSent: boolean;
      emailProvider: string;
      emailError?: string;
      tempPassword?: string;
      recipientEmail: string;
      memberName: string;
      memberCode: string;
    }>(`/api/admin/members/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(tempPassword ? { tempPassword } : {}),
    }),

  // Monthly Fund Summary PDF & Fund JSON Backup
  emailMonthlyPdfSummary: (monthKey?: string) =>
    apiRequest<{
      ok: boolean;
      smtpConfigured?: boolean;
      monthKey: string;
      sentCount: number;
      failedCount: number;
      totalMembers: number;
      totalRecipients?: number;
      errors?: string[];
      skipped?: boolean;
      reason?: string;
    }>('/api/reports/monthly-pdf/email', {
      method: 'POST',
      body: JSON.stringify(monthKey ? { month: monthKey } : {}),
    }),
  getMonthlyPdfDownloadUrl: (monthKey?: string) =>
    monthKey
      ? `/api/reports/monthly-pdf/download?month=${encodeURIComponent(monthKey)}`
      : '/api/reports/monthly-pdf/download',
  getBackupJsonUrl: () => '/api/reports/backup-json',

  // Groq AI Features (Text Rewrite & Community Link & Spam Shield)
  rewriteWithAi: (payload: {
    context: AiRewriteContext;
    text: string;
    title?: string;
    tone?: AiRewriteTone;
  }) =>
    apiRequest<{ result: AiRewriteResult }>('/api/ai/rewrite', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  checkCommunitySpam: (payload: {
    title: string;
    content: string;
    links?: CommunityPostLink[];
  }) =>
    apiRequest<{ spamCheck: AiSpamCheckResult }>('/api/ai/community-spam-check', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

