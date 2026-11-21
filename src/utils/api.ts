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
  CoopMeeting,
  CoopNotice,
  DashboardOverview,
  DecisionPoll,
  DigitalAgreementRecord,
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
  FcmPushPlatform,
  FundConfig,
  HalalProject,
  LoanRequest,
  ManagerCycleSchedule,
  MaritalStatus,
  MemberGender,
  MemberPublicProfile,
  MemberSocialMedia,
  MemberSummary,
  MobileMemberOverviewIconsConfig,
  MonthlySheetData,
  NomineeInfo,
  NoticePriority,
  NotificationPreferences,
  PasswordResetRequest,
  ProfileChangePayload,
  ProfileChangeRequest,
  PublicUser,
  PushNotificationStatusResponse,
  PushTestResponse,
  ReceiptAiExtraction,
  RegisteredDeviceSummary,
  StructuredBdAddress,
  UploadDocumentCategory,
  UserRole,
  UserStatus,
} from '../types/coop.ts';

type TotpChallengeHandler = (message: string) => Promise<string | null>;
let totpChallengeHandler: TotpChallengeHandler | null = null;

export function registerTotpChallengeHandler(handler: TotpChallengeHandler | null): void {
  totpChallengeHandler = handler;
}

function getClientLocaleHeader(): 'en' | 'bn' {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem('amanah_locale');
    if (saved === 'bn' || saved === 'en') return saved;
  } catch {
    // ignore storage access errors
  }
  return document.documentElement?.lang === 'bn' ? 'bn' : 'en';
}

export const SESSION_TOKEN_STORAGE_KEY = 'amanah_session_token_v1';
export const LOGOUT_MARKER_STORAGE_KEY = 'amanah_session_logged_out_v1';
export const AUTH_BROADCAST_CHANNEL = 'amanah_auth_channel';
const GOOGLE_ONBOARDING_KEY = 'amanah_google_onboarding';
let memorySessionToken: string | null = null;
let pendingSessionCheck: Promise<boolean> | null = null;

export function getClientSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  // Read localStorage first so cross-tab logins/logouts take precedence over per-tab sessionStorage.
  let localStorageReadable = false;
  try {
    const fromLocal = window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    localStorageReadable = true;
    if (fromLocal && fromLocal.trim()) {
      const clean = fromLocal.trim();
      memorySessionToken = clean;
      try {
        window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, clean);
      } catch {
        // ignore storage errors
      }
      return memorySessionToken;
    }
    // If localStorage explicitly records a logout (or cleared token across tabs),
    // never resurrect a stale token lingering in per-tab sessionStorage or memory.
    const loggedOutMarker = window.localStorage.getItem(LOGOUT_MARKER_STORAGE_KEY);
    if (loggedOutMarker) {
      memorySessionToken = null;
      try {
        window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
      return null;
    }
  } catch {
    // localStorage unavailable (e.g., third-party iframe restriction) — fall through to sessionStorage
  }
  if (!localStorageReadable) {
    try {
      const fromSession = window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
      if (fromSession && fromSession.trim()) {
        memorySessionToken = fromSession.trim();
        return memorySessionToken;
      }
    } catch {
      // ignore storage errors
    }
    return memorySessionToken;
  }
  // localStorage is readable and has no session token and no logout marker:
  // allow sessionStorage/memory fallback only when localStorage write was unavailable (quota),
  // otherwise keep consistent with empty storage.
  try {
    const fromSession = window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (fromSession && fromSession.trim()) {
      memorySessionToken = fromSession.trim();
      return memorySessionToken;
    }
  } catch {
    // ignore storage errors
  }
  return memorySessionToken;
}

export function syncClientSessionTokenFromStorage(token: string | null): void {
  if (typeof window === 'undefined') return;
  const clean = token && token.trim() ? token.trim() : null;
  memorySessionToken = clean;
  try {
    if (clean) {
      window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, clean);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(GOOGLE_ONBOARDING_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function setClientSessionToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  const clean = token && token.trim() ? token.trim() : null;
  memorySessionToken = clean;
  try {
    if (clean) {
      window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, clean);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(GOOGLE_ONBOARDING_KEY);
    }
  } catch {
    // ignore storage errors
  }
  try {
    if (clean) {
      window.localStorage.removeItem(LOGOUT_MARKER_STORAGE_KEY);
      window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(GOOGLE_ONBOARDING_KEY);
      window.localStorage.setItem(LOGOUT_MARKER_STORAGE_KEY, String(Date.now()));
    }
  } catch {
    // ignore storage errors
  }
}

export function clearClientSessionToken(): void {
  setClientSessionToken(null);
}

async function confirmSessionInvalidOnServer(tokenUsedForRequest: string | null): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (pendingSessionCheck) return pendingSessionCheck;

  pendingSessionCheck = (async () => {
    try {
      const activeToken = getClientSessionToken();
      if (activeToken !== tokenUsedForRequest) {
        return false;
      }
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'x-amanah-locale': getClientLocaleHeader(),
          ...(activeToken ? { 'X-Amanah-Session': activeToken } : {}),
        },
      });
      // Only confirm unauthorized when /api/auth/me explicitly returns 401
      // and no fresh login swapped the token while verifying.
      return res.status === 401 && getClientSessionToken() === tokenUsedForRequest;
    } catch {
      // Network/transient failure must never log out a live session
      return false;
    } finally {
      pendingSessionCheck = null;
    }
  })();

  return pendingSessionCheck;
}

async function apiRequest<T>(path: string, init?: RequestInit, hasRetriedTotp = false): Promise<T> {
  const sessionToken = getClientSessionToken();
  const tokenUsedForRequest = sessionToken;
  const res = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-amanah-locale': getClientLocaleHeader(),
      ...(sessionToken ? { 'X-Amanah-Session': sessionToken } : {}),
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

    const isWorkspaceOAuthRoute = path.startsWith('/api/workspace/');
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !isWorkspaceOAuthRoute &&
      path !== '/api/auth/login' &&
      path !== '/api/auth/activate-membership' &&
      path !== '/api/auth/pin-login' &&
      path !== '/api/auth/register' &&
      path !== '/api/auth/logout'
    ) {
      const currentToken = getClientSessionToken();
      if (currentToken === tokenUsedForRequest) {
        if (path === '/api/auth/me') {
          clearClientSessionToken();
        } else {
          const confirmedInvalid = await confirmSessionInvalidOnServer(tokenUsedForRequest);
          if (confirmedInvalid && getClientSessionToken() === tokenUsedForRequest) {
            clearClientSessionToken();
            window.dispatchEvent(new CustomEvent('amanah:unauthorized'));
          }
        }
      }
    }

    const errObj = new Error(message) as Error & { code?: string; status?: number };
    errObj.status = res.status;
    if (code) errObj.code = code;
    throw errObj;
  }

  return (await res.json()) as T;
}

export interface SheetTabBlueprint {
  sheetName: string;
  rows: (string | number)[][];
}

export interface GoogleSheetTabMeta {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface GoogleSheetInspectResponse {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheets: GoogleSheetTabMeta[];
  previewTab: string;
  previewRows: string[][];
}

export interface GoogleSheetConnectResponse {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheets: GoogleSheetTabMeta[];
  config: FundConfig;
}

export interface RegisterMemberPayload {
  name: string;
  nameBn?: string;
  email: string;
  password: string;
  fatherName: string;
  fatherNameBn?: string;
  motherName: string;
  motherNameBn?: string;
  gender: MemberGender;
  maritalStatus: MaritalStatus;
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
  nominees: NomineeInfo[];
}

export const api = {
  getMe: () => apiRequest<{ user: PublicUser }>('/api/auth/me'),
  getProfile: () => apiRequest<{ user: PublicUser }>('/api/profile'),
  updateProfile: (payload: ProfileChangePayload) =>
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
  login: async (email: string, password: string) => {
    const res = await apiRequest<
      | { user: PublicUser; sessionToken?: string; activationRequired?: false }
      | {
          activationRequired: true;
          activationToken: string;
          applicant: {
            id: string;
            name: string;
            email: string;
            fundName: string;
          };
          message: string;
        }
    >('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if ('user' in res && res.sessionToken) {
      setClientSessionToken(res.sessionToken);
    }
    return res;
  },
  activateMembership: async (payload: {
    activationToken: string;
    memberCode: string;
    otp: string;
    agreedToTerms: boolean;
  }) => {
    const res = await apiRequest<{
      activated: true;
      user: PublicUser;
      sessionToken?: string;
      activatedAt: string;
      confirmationEmailSent: boolean;
      confirmationEmailReason?: string;
    }>('/api/auth/activate-membership', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.sessionToken) {
      setClientSessionToken(res.sessionToken);
    }
    return res;
  },
  pinLogin: async (payload: {
    userId: string;
    deviceId: string;
    deviceSecret: string;
    pin: string;
  }) => {
    const res = await apiRequest<{ user: PublicUser; sessionToken?: string }>(
      '/api/auth/pin-login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    if (res.sessionToken) {
      setClientSessionToken(res.sessionToken);
    }
    return res;
  },
  registerMobileDevice: (payload: {
    pin: string;
    deviceName?: string;
    existingDeviceId?: string;
  }) =>
    apiRequest<{
      device: RegisteredDeviceSummary;
      deviceSecret: string;
      user: PublicUser;
    }>('/api/auth/devices/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  revokeMobileDevice: (deviceId: string) =>
    apiRequest<{ ok: boolean; user: PublicUser }>(
      `/api/auth/devices/${encodeURIComponent(deviceId)}`,
      {
        method: 'DELETE',
      }
    ),
  forgotPassword: (email: string, reason?: string) =>
    apiRequest<{ ok: boolean; message: string; adminCount: number }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, reason }),
    }),
  getBootstrapStatus: () =>
    apiRequest<{
      hasMembers: boolean;
      activeMembersCount: number;
      storageEngine: string;
      storageReason?: string;
      connectionErrorCode?: string;
    }>('/api/auth/bootstrap-status'),
  getReferenceMembers: () =>
    apiRequest<{
      members: Array<{ name: string; memberCode: string }>;
      hasMembers?: boolean;
    }>('/api/auth/references'),
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
  updatePreferences: (
    prefs: Partial<NotificationPreferences> & {
      mobileOverviewIcons?: MobileMemberOverviewIconsConfig | null;
      themePreference?: 'light' | 'dark';
    }
  ) =>
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
  register: async (payload: RegisterMemberPayload) => {
    const res = await apiRequest<{
      pendingApproval?: boolean;
      bootstrapAdmin?: boolean;
      message?: string;
      user: PublicUser;
      digitalAgreement?: DigitalAgreementRecord;
      sessionToken?: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.sessionToken) {
      setClientSessionToken(res.sessionToken);
    }
    return res;
  },
  logout: async (explicitToken?: string | null) => {
    const tokenToRevoke = explicitToken ?? getClientSessionToken();
    try {
      return await apiRequest<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
        keepalive: true,
        headers: tokenToRevoke ? { 'X-Amanah-Session': tokenToRevoke } : undefined,
        body: JSON.stringify(tokenToRevoke ? { sessionToken: tokenToRevoke } : {}),
      });
    } finally {
      clearClientSessionToken();
    }
  },

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
    apiRequest<{ registrations: MemberSummary[]; suggestedNextMemberCode?: string }>(
      '/api/admin/registrations/pending'
    ),
  issueMemberActivation: (id: string, payload?: { memberCode?: string }) =>
    apiRequest<{
      members: MemberSummary[];
      registrations: MemberSummary[];
      suggestedNextMemberCode?: string;
      memberCode: string;
      issuedAt: string;
      emailSent: boolean;
      emailReason?: string;
    }>(`/api/admin/members/${encodeURIComponent(id)}/issue-activation`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  resendActivationEmail: (id: string) =>
    apiRequest<{
      emailSent: boolean;
      emailReason?: string;
      memberCode: string;
      members: MemberSummary[];
      registrations: MemberSummary[];
    }>(`/api/admin/members/${encodeURIComponent(id)}/resend-activation-email`, {
      method: 'POST',
    }),
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
    payload: Omit<Partial<FundConfig>, 'emailTemplates' | 'mobileMemberOverviewIcons'> & {
      emailTemplates?:
        | EmailTemplateCollection
        | Partial<Record<EmailTemplateKey, Partial<EmailTemplateFormat> | null>>
        | null;
      mobileMemberOverviewIcons?: MobileMemberOverviewIconsConfig | null;
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
  getPushStatus: () =>
    apiRequest<PushNotificationStatusResponse>('/api/notifications/push/status'),
  subscribePushToken: (payload: {
    token: string;
    platform?: FcmPushPlatform;
    userAgentLabel?: string;
  }) =>
    apiRequest<{ ok: boolean; deviceId: string; devicesCount: number; configuredServer: boolean }>(
      '/api/notifications/push/subscribe',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  unsubscribePushToken: (token?: string) =>
    apiRequest<{ ok: boolean; removedCount: number; devicesCount: number }>(
      '/api/notifications/push/subscribe',
      {
        method: 'DELETE',
        body: JSON.stringify(token ? { token } : {}),
      }
    ),
  sendTestPushNotification: () =>
    apiRequest<PushTestResponse>('/api/notifications/push/test', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getBlueprint: (month?: string) =>
    apiRequest<{ tabs: SheetTabBlueprint[]; config: FundConfig; month?: string }>(
      month
        ? `/api/workspace/blueprint?month=${encodeURIComponent(month)}`
        : '/api/workspace/blueprint'
    ),
  inspectGoogleSheet: (
    googleToken: string,
    payload?: { spreadsheetIdOrUrl?: string; sheetName?: string; maxRows?: number }
  ) =>
    apiRequest<GoogleSheetInspectResponse>('/api/workspace/sheets/inspect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleToken}`,
      },
      body: JSON.stringify(payload || {}),
    }),
  connectGoogleSheet: (googleToken: string, spreadsheetIdOrUrl: string) =>
    apiRequest<GoogleSheetConnectResponse>('/api/workspace/sheets/connect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleToken}`,
      },
      body: JSON.stringify({ spreadsheetIdOrUrl }),
    }),
  disconnectGoogleSheet: () =>
    apiRequest<{ ok: boolean; config: FundConfig }>('/api/workspace/sheets/disconnect', {
      method: 'POST',
    }),
  syncGoogleSheet: (
    googleToken: string,
    opts?: {
      createNew?: boolean;
      autoSyncSheet?: boolean;
      month?: string;
      spreadsheetIdOrUrl?: string;
    }
  ) =>
    apiRequest<{
      spreadsheetId: string;
      spreadsheetUrl: string;
      spreadsheetTitle?: string;
      month?: string;
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
    status?: 'active' | 'draft';
    relatedLoanId?: string;
  }) =>
    apiRequest<{ post: CommunityPost }>('/api/community/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getCommunityDrafts: () =>
    apiRequest<{ posts: CommunityPost[] }>('/api/community/posts/drafts'),
  publishCommunityDraft: (id: string) =>
    apiRequest<{ post: CommunityPost }>(`/api/community/posts/${id}/publish`, {
      method: 'POST',
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

  // Balance Sheet Ledger & Monthly Fund Summary PDF
  getBalanceSheet: (month?: string) =>
    apiRequest<{ sheet: MonthlySheetData }>(
      month
        ? `/api/reports/balance-sheet?month=${encodeURIComponent(month)}`
        : '/api/reports/balance-sheet'
    ),
  getMonthlySheet: (month?: string) =>
    apiRequest<{ sheet: MonthlySheetData }>(
      month
        ? `/api/reports/balance-sheet?month=${encodeURIComponent(month)}`
        : '/api/reports/balance-sheet'
    ),
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
  getMonthlyPdfDownloadUrl: (monthKey?: string) => {
    const params = new URLSearchParams();
    if (monthKey) params.set('month', monthKey);
    const token = getClientSessionToken();
    if (token) params.set('sessionToken', token);
    const qs = params.toString();
    return qs ? `/api/reports/monthly-pdf/download?${qs}` : '/api/reports/monthly-pdf/download';
  },
  getCsvReportExportUrl: (
    type: 'contributions' | 'loans' | 'members' | 'audit',
    scope?: 'admin'
  ) => {
    const params = new URLSearchParams();
    params.set('type', type);
    if (scope) params.set('scope', scope);
    const token = getClientSessionToken();
    if (token) params.set('sessionToken', token);
    return `/api/reports/export?${params.toString()}`;
  },
  getEventsStreamUrl: () => {
    const token = getClientSessionToken();
    return token ? `/api/events?sessionToken=${encodeURIComponent(token)}` : '/api/events';
  },
  getBackupJsonUrl: () => {
    const token = getClientSessionToken();
    return token
      ? `/api/reports/backup-json?sessionToken=${encodeURIComponent(token)}`
      : '/api/reports/backup-json';
  },

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

