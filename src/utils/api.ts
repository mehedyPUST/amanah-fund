import type {
  AuditLogEntry,
  CommunityCategory,
  CommunityPost,
  CommunityReactionType,
  Contribution,
  ConversationThreadSummary,
  DashboardOverview,
  EligibilityCheck,
  EmailNotification,
  FundConfig,
  HalalProject,
  LoanRequest,
  MemberPublicProfile,
  MemberSummary,
  NotificationPreferences,
  PrivateMessage,
  PublicUser,
  ReceiptAiExtraction,
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
  password?: string;
  googleRegistrationToken?: string;
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

export type GoogleAuthResponse =
  | { status: 'authenticated'; user: PublicUser }
  | {
      status: 'needs_onboarding';
      registrationToken: string;
      googleProfile: { name: string; email: string; photoUrl: string };
    };

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
    apiRequest<{ user: PublicUser }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  login: (email: string, password: string) =>
    apiRequest<{ user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  googleAuth: (idToken: string) =>
    apiRequest<GoogleAuthResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
  getReferenceMembers: () =>
    apiRequest<{ members: Array<{ name: string; memberCode: string }> }>('/api/auth/references'),
  uploadImage: async (file: File, label?: string): Promise<{ url: string; provider: string }> => {
    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read selected image file.'));
      reader.readAsDataURL(file);
    });
    return apiRequest<{ url: string; provider: string }>('/api/upload/imgbb', {
      method: 'POST',
      body: JSON.stringify({
        imageBase64,
        name: label || file.name,
      }),
    });
  },
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
  respondAsGuarantor: (id: string, decision: 'accept' | 'decline', note?: string) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/guarantor-respond`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
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
  disburseLoan: (id: string) =>
    apiRequest<{ loan: LoanRequest }>(`/api/loans/${id}/disburse`, {
      method: 'POST',
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
    decision: 'approve' | 'reject'
  ) =>
    apiRequest<{ loan: LoanRequest }>(
      `/api/loans/${loanId}/installments/${installmentNumber}/verify`,
      {
        method: 'PATCH',
        body: JSON.stringify({ decision }),
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
    apiRequest<{ members: MemberSummary[] }>(`/api/admin/members/${id}`, {
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
  updateConfig: (payload: Partial<FundConfig>) =>
    apiRequest<{ config: FundConfig }>('/api/admin/config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
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
    imageUrl?: string;
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
      imageUrl?: string;
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
};

