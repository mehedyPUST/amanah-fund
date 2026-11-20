import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MongoClient, type Db } from 'mongodb';
import type {
  AuditLogEntry,
  CommunityPost,
  Contribution,
  CoopMeeting,
  CoopNotice,
  DecisionPoll,
  EmailNotification,
  EmailQueueItem,
  EncryptedEnvelope,
  FaqItem,
  FundConfig,
  HalalProject,
  LoanRequest,
  NotificationPreferences,
  PasswordResetRequest,
  ProfileChangeRequest,
  UsedActivationOtpRecord,
  UserRole,
  UserStatus,
} from '../types/coop.ts';
import { createDefaultFaqs, sortFaqItems } from '../utils/faqDefaults.ts';

export interface StoredRegisteredDevice {
  deviceId: string;
  deviceName: string;
  pinHash: string;
  deviceSecretHash: string;
  failedAttempts: number;
  lockedUntil?: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface StoredMemberActivationMeta {
  memberCode: string;
  issuedAt: string;
  issuedById: string;
  issuedByName: string;
  emailSent: boolean;
  emailSentAt?: string;
  emailError?: string;
  activatedAt?: string;
  agreementAcceptedAt?: string;
  failedAttempts?: number;
  lastFailedAt?: string;
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  googleUid?: string;
  authProvider?: 'password' | 'google' | 'both';
  role: UserRole;
  memberCode: string;
  status: UserStatus;
  joinedAt: string;
  phoneMasked?: string;
  photoUrl?: string;
  communityMuted?: boolean;
  totpEnabled?: boolean;
  encryptedTotpSecret?: EncryptedEnvelope;
  registeredDevices?: StoredRegisteredDevice[];
  notificationPreferences?: NotificationPreferences;
  encryptedRegistrationDetails?: EncryptedEnvelope;
  encryptedActivationOtp?: EncryptedEnvelope;
  activationMeta?: StoredMemberActivationMeta;
}

export interface StoredPrivateMessage {
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
  encryptedBody: EncryptedEnvelope;
  createdAt: string;
  readAt?: string;
}

export interface RevokedTokenRecord {
  id: string;
  userId?: string;
  revokedAt: string;
  expiresAt: string;
}

export interface VaultState {
  users: StoredUser[];
  fundConfig: FundConfig;
  contributions: Contribution[];
  loans: LoanRequest[];
  halalProjects: HalalProject[];
  emailNotifications: EmailNotification[];
  auditLogs: AuditLogEntry[];
  communityPosts: CommunityPost[];
  privateMessages: StoredPrivateMessage[];
  decisionPolls?: DecisionPoll[];
  meetings?: CoopMeeting[];
  notices?: CoopNotice[];
  profileChangeRequests?: ProfileChangeRequest[];
  passwordResetRequests?: PasswordResetRequest[];
  emailQueue?: EmailQueueItem[];
  faqs?: FaqItem[];
  usedActivationOtps?: UsedActivationOtpRecord[];
  revokedTokens?: RevokedTokenRecord[];
}

const VAULT_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'amanah-data')
  : path.resolve(/* turbopackIgnore: true */ process.cwd(), 'data');
const VAULT_FILE = path.join(/* turbopackIgnore: true */ VAULT_DIR, 'amanah-coop-vault.json');

export type StorageEngine = 'mongodb_atlas' | 'encrypted_local_vault';

export type StorageReason =
  | 'connected'
  | 'missing_uri'
  | 'placeholder_uri'
  | 'invalid_uri_scheme'
  | 'connection_failed';

export interface StorageDiagnostic {
  storageEngine: StorageEngine;
  storageReason: StorageReason;
  connectionErrorCode: string | null;
}

interface TimedCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface UserBootstrapSummary {
  hasMembers: boolean;
  activeMembersCount: number;
  activeReferences: Array<{ name: string; memberCode: string }>;
}

interface AmanahDbRuntime {
  mongoClient: MongoClient | null;
  mongoDb: Db | null;
  storageEngine: StorageEngine;
  storageReason: StorageReason;
  connectionErrorCode: string | null;
  initialized: boolean;
  lastMongoAttemptAt: number;
  initPromise: Promise<StorageEngine> | null;
  memoryState: VaultState | null;
  vaultWriteQueue: Promise<void>;
  vaultCache: VaultState | null;
  vaultCacheExpiresAt: number;
  vaultLoadPromise: Promise<VaultState> | null;
  userCache: Map<string, TimedCacheEntry<StoredUser | null>>;
  fundConfigCache: TimedCacheEntry<FundConfig> | null;
  faqsCache: TimedCacheEntry<FaqItem[]> | null;
  noticesCache: TimedCacheEntry<CoopNotice[]> | null;
  bootstrapSummaryCache: TimedCacheEntry<UserBootstrapSummary> | null;
  revokedTokenIds: Map<string, number>;
  revokedTokenIndexesReady: boolean;
}

const MONGO_RETRY_COOLDOWN_MS = 15_000;
const VAULT_READ_CACHE_TTL_MS = 5_000;
const PUBLIC_SLICE_CACHE_TTL_MS = 15_000;
const SCHEMA_INIT_VERSION = 1;

const globalForDb = globalThis as typeof globalThis & {
  __amanahDbRuntime?: AmanahDbRuntime;
};

const runtime: AmanahDbRuntime =
  globalForDb.__amanahDbRuntime ??
  (globalForDb.__amanahDbRuntime = {
    mongoClient: null,
    mongoDb: null,
    storageEngine: 'encrypted_local_vault',
    storageReason: 'missing_uri',
    connectionErrorCode: null,
    initialized: false,
    lastMongoAttemptAt: 0,
    initPromise: null,
    memoryState: null,
    vaultWriteQueue: Promise.resolve(),
    vaultCache: null,
    vaultCacheExpiresAt: 0,
    vaultLoadPromise: null,
    userCache: new Map(),
    fundConfigCache: null,
    faqsCache: null,
    noticesCache: null,
    bootstrapSummaryCache: null,
    revokedTokenIds: new Map(),
    revokedTokenIndexesReady: false,
  });

// Ensure fields exist if runtime survived hot reload from an older shape
if (!runtime.userCache) runtime.userCache = new Map();
if (!runtime.revokedTokenIds) runtime.revokedTokenIds = new Map();

function invalidateReadCaches(): void {
  runtime.vaultCache = null;
  runtime.vaultCacheExpiresAt = 0;
  runtime.userCache.clear();
  runtime.fundConfigCache = null;
  runtime.faqsCache = null;
  runtime.noticesCache = null;
  runtime.bootstrapSummaryCache = null;
}

function hydrateReadCachesFromState(state: VaultState): void {
  const now = Date.now();
  runtime.vaultCache = structuredClone(state);
  runtime.vaultCacheExpiresAt = now + VAULT_READ_CACHE_TTL_MS;
  runtime.userCache.clear();
  runtime.fundConfigCache = {
    value: structuredClone(state.fundConfig),
    expiresAt: now + PUBLIC_SLICE_CACHE_TTL_MS,
  };
  runtime.faqsCache = {
    value: sortFaqItems(Array.isArray(state.faqs) ? structuredClone(state.faqs) : []),
    expiresAt: now + PUBLIC_SLICE_CACHE_TTL_MS,
  };
  runtime.noticesCache = {
    value: structuredClone(state.notices || []),
    expiresAt: now + PUBLIC_SLICE_CACHE_TTL_MS,
  };
  const activeUsers = state.users.filter((u) => u.status === 'active');
  runtime.bootstrapSummaryCache = {
    value: {
      hasMembers: state.users.length > 0,
      activeMembersCount: activeUsers.length,
      activeReferences: activeUsers.map((u) => ({ name: u.name, memberCode: u.memberCode })),
    },
    expiresAt: now + PUBLIC_SLICE_CACHE_TTL_MS,
  };
}

export function parseMongoUri(rawUri: string | undefined): {
  uri: string | null;
  reason: Exclude<StorageReason, 'connected' | 'connection_failed'> | null;
} {
  if (!rawUri) {
    return { uri: null, reason: 'missing_uri' };
  }
  let cleaned = rawUri.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (!cleaned) {
    return { uri: null, reason: 'missing_uri' };
  }
  if (/<(username|password|db_password|cluster)>/i.test(cleaned)) {
    return { uri: null, reason: 'placeholder_uri' };
  }
  if (!/^mongodb(\+srv)?:\/\//i.test(cleaned)) {
    return { uri: null, reason: 'invalid_uri_scheme' };
  }
  return { uri: cleaned, reason: null };
}

function extractSafeErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return 'UNKNOWN_ERROR';
  const e = err as { name?: unknown; code?: unknown; codeName?: unknown };
  const codeName = typeof e.codeName === 'string' && e.codeName.trim() ? e.codeName.trim() : null;
  const code =
    typeof e.code === 'string' || typeof e.code === 'number' ? String(e.code).trim() : null;
  const name = typeof e.name === 'string' && e.name.trim() ? e.name.trim() : null;
  if (name && codeName) return `${name}:${codeName}`;
  if (name && code) return `${name}:${code}`;
  return name || codeName || code || 'CONNECTION_ERROR';
}

/** Empty cooperative vault — no demo users, loans, or sample content.
 *  Fund defaults are starting values only; admins change them in Site Settings.
 *  The first registered account becomes the bootstrap admin (see /auth/register). */
function createEmptyVaultState(): VaultState {
  const now = new Date().toISOString();
  const fundConfig: FundConfig = {
    id: 'default-config',
    fundName: 'Amanah — Savings, Investment & Interest-Free Loan Fund',
    currency: 'BDT',
    monthlyContributionAmount: 5000,
    maxLoansPerYear: 3,
    maxLoanAmount: 50000,
    maxInstallmentMonths: 10,
    guarantorThresholdAmount: 40000,
    requiredGuarantorsCount: 1,
    voteThresholdNumerator: 2,
    voteThresholdDenominator: 3,
    maturityDate: '2036-12-31',
    maxMembersCap: 20,
    membershipIntakeDeadline: '2027-07-31',
    loanSavingsCapPct: 75,
    monthlyDueDay: 10,
    lateFeeAmount: 50,
    registrationFeeAmount: 200,
    managerCycleMonths: 3,
    managerCycleStartDate: '2027-01-01',
    monthlyReportAutoEmail: true,
    faqsSeeded: true,
    halalInvestmentThesis:
      'VISION-36 (Jan 2027 – Dec 2036): Deploy accumulated Halal capital with 2/3 member approval into 1 land share per member share, Islamic schools across at least 3 districts, the "Al Madina City" residential community blueprint, and Maktab institutions in northern and hill-tract districts.',
    updatedAt: now,
    updatedBy: 'System',
  };

  return {
    users: [],
    fundConfig,
    contributions: [],
    loans: [],
    halalProjects: [],
    emailNotifications: [],
    auditLogs: [],
    communityPosts: [],
    privateMessages: [],
    decisionPolls: [],
    meetings: [],
    notices: [],
    profileChangeRequests: [],
    passwordResetRequests: [],
    emailQueue: [],
    faqs: createDefaultFaqs(now),
    usedActivationOtps: [],
    revokedTokens: [],
  };
}

/** Drop records whose owner user no longer exists (structure hygiene only). */
function purgeOrphanRecords(state: VaultState): { state: VaultState; changed: boolean } {
  let changed = false;
  const realUserIds = new Set((state.users || []).map((u) => u.id));

  const beforeContribs = (state.contributions || []).length;
  state.contributions = (state.contributions || []).filter((c) => realUserIds.has(c.userId));
  if (state.contributions.length !== beforeContribs) changed = true;

  const beforeLoans = (state.loans || []).length;
  state.loans = (state.loans || []).filter((l) => realUserIds.has(l.borrowerId));
  if (state.loans.length !== beforeLoans) changed = true;

  const beforeNotifs = (state.emailNotifications || []).length;
  state.emailNotifications = (state.emailNotifications || []).filter(
    (n) => !n.recipientUserId || realUserIds.has(n.recipientUserId)
  );
  if (state.emailNotifications.length !== beforeNotifs) changed = true;

  return { state, changed };
}

function normalizeVaultState(state: VaultState): VaultState {
  purgeOrphanRecords(state);
  state.emailNotifications = Array.isArray(state.emailNotifications)
    ? state.emailNotifications
    : [];
  state.communityPosts = Array.isArray(state.communityPosts)
    ? state.communityPosts
    : [];
  state.privateMessages = Array.isArray(state.privateMessages)
    ? state.privateMessages
    : [];
  state.decisionPolls = Array.isArray(state.decisionPolls)
    ? state.decisionPolls
    : [];
  state.meetings = Array.isArray(state.meetings)
    ? state.meetings
    : [];
  state.notices = Array.isArray(state.notices)
    ? state.notices
    : [];
  state.profileChangeRequests = Array.isArray(state.profileChangeRequests)
    ? state.profileChangeRequests
    : [];
  state.passwordResetRequests = Array.isArray(state.passwordResetRequests)
    ? state.passwordResetRequests
    : [];
  state.emailQueue = Array.isArray(state.emailQueue)
    ? state.emailQueue
    : [];
  state.usedActivationOtps = Array.isArray(state.usedActivationOtps)
    ? state.usedActivationOtps
    : [];
  const nowMs = Date.now();
  state.revokedTokens = Array.isArray(state.revokedTokens)
    ? state.revokedTokens.filter((entry) => {
        if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) return false;
        const expMs = Date.parse(entry.expiresAt);
        return Number.isFinite(expMs) && expMs > nowMs;
      })
    : [];
  if (!Array.isArray(state.faqs)) {
    state.faqs = createDefaultFaqs();
    if (state.fundConfig) {
      state.fundConfig.faqsSeeded = true;
    }
  } else {
    state.faqs = sortFaqItems(state.faqs);
  }
  if (state.fundConfig) {
    if (state.fundConfig.guarantorThresholdAmount === undefined) {
      state.fundConfig.guarantorThresholdAmount = 40000;
    }
    if (state.fundConfig.requiredGuarantorsCount === undefined) {
      state.fundConfig.requiredGuarantorsCount = 1;
    }
    if (state.fundConfig.managerCycleMonths === undefined) {
      state.fundConfig.managerCycleMonths = 3;
    }
    if (!state.fundConfig.managerCycleStartDate) {
      state.fundConfig.managerCycleStartDate = '2026-01-01';
    }
    if (state.fundConfig.monthlyReportAutoEmail === undefined) {
      state.fundConfig.monthlyReportAutoEmail = true;
    }
  }
  const activeVoters = Math.max(1, state.users.filter((u) => u.status === 'active').length);
  const reqApprovals = Math.max(
    1,
    Math.ceil(
      (activeVoters * (state.fundConfig.voteThresholdNumerator || 2)) /
        (state.fundConfig.voteThresholdDenominator || 3)
    )
  );

  state.halalProjects = (state.halalProjects || []).map((proj) => {
    const votes = Array.isArray(proj.votes) ? proj.votes : [];
    const yesCount = votes.filter((v) => v.decision === 'yes').length;
    const noCount = votes.filter((v) => v.decision === 'no').length;
    const totalEligibleVoters = proj.totalEligibleVoters || activeVoters;
    const requiredApprovals = proj.requiredApprovals || reqApprovals;
    let votingStatus = proj.votingStatus;
    if (!votingStatus) {
      if (yesCount >= requiredApprovals || proj.status === 'vetted') {
        votingStatus = 'approved';
      } else if (noCount > totalEligibleVoters - requiredApprovals) {
        votingStatus = 'rejected';
      } else {
        votingStatus = 'open';
      }
    }
    return {
      ...proj,
      votes,
      totalEligibleVoters,
      requiredApprovals,
      votingStatus,
    };
  });
  return state;
}

function readLocalVault(): VaultState {
  if (runtime.memoryState) return structuredClone(runtime.memoryState);
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
  if (!fs.existsSync(VAULT_FILE)) {
    const empty = createEmptyVaultState();
    fs.writeFileSync(VAULT_FILE, JSON.stringify(empty, null, 2), 'utf8');
    runtime.memoryState = empty;
    return structuredClone(empty);
  }
  const raw = fs.readFileSync(VAULT_FILE, 'utf8');
  const parsed = JSON.parse(raw) as VaultState;
  const { changed } = purgeOrphanRecords(parsed);
  runtime.memoryState = normalizeVaultState(parsed);
  if (changed) {
    fs.writeFileSync(VAULT_FILE, JSON.stringify(runtime.memoryState, null, 2), 'utf8');
  }
  return structuredClone(runtime.memoryState);
}

function writeLocalVault(state: VaultState): void {
  runtime.memoryState = structuredClone(state);
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
  fs.writeFileSync(VAULT_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function initDatabase(): Promise<StorageEngine> {
  if (runtime.mongoDb && runtime.storageEngine === 'mongodb_atlas') {
    return runtime.storageEngine;
  }

  const parsedUri = parseMongoUri(process.env.MONGODB_URI);

  if (runtime.initialized) {
    if (!parsedUri.uri) {
      runtime.storageReason = parsedUri.reason ?? 'missing_uri';
      return runtime.storageEngine;
    }
    // Allow automatic recovery from transient Atlas cold-start / network timeouts
    if (Date.now() - runtime.lastMongoAttemptAt < MONGO_RETRY_COOLDOWN_MS) {
      return runtime.storageEngine;
    }
  }

  if (runtime.initPromise) {
    return runtime.initPromise;
  }

  const runInit = async (): Promise<StorageEngine> => {
    const dbName = (process.env.MONGODB_DB_NAME || '').trim() || 'amanah_coop';

    if (parsedUri.uri) {
      runtime.lastMongoAttemptAt = Date.now();
      let candidateClient: MongoClient | null = null;
      try {
        candidateClient = new MongoClient(parsedUri.uri, {
          serverSelectionTimeoutMS: 10_000,
          connectTimeoutMS: 10_000,
          socketTimeoutMS: 20_000,
          maxPoolSize: 5,
          minPoolSize: 0,
        });
        await candidateClient.connect();
        const db = candidateClient.db(dbName);
        runtime.mongoClient = candidateClient;
        runtime.mongoDb = db;
        runtime.storageEngine = 'mongodb_atlas';
        runtime.storageReason = 'connected';
        runtime.connectionErrorCode = null;

        const existingConfig = await db
          .collection<FundConfig & { schemaInitVersion?: number }>('fundConfig')
          .findOne({
            id: 'default-config',
          });
        if (!existingConfig) {
          const empty = createEmptyVaultState();
          await db.collection('fundConfig').insertOne(empty.fundConfig);
          if (empty.faqs && empty.faqs.length > 0) {
            const faqsCount = await db.collection('faqs').countDocuments({});
            if (faqsCount === 0) {
              await db.collection('faqs').insertMany(empty.faqs);
            }
          }
        } else if (!existingConfig.faqsSeeded) {
          const faqsCount = await db.collection('faqs').countDocuments({});
          if (faqsCount === 0) {
            await db.collection('faqs').insertMany(createDefaultFaqs());
          }
          await db
            .collection('fundConfig')
            .updateOne({ id: 'default-config' }, { $set: { faqsSeeded: true } });
        }

        // Run one-time legacy demo cleanup & index creation only once per database
        // rather than repeating 37 MongoDB round-trips on every serverless cold start.
        if (existingConfig?.schemaInitVersion !== SCHEMA_INIT_VERSION) {
          const DEMO_EMAILS = [
            'admin@amanahcoop.org',
            'nadia@amanahcoop.org',
            'imran@amanahcoop.org',
            'fatima@amanahcoop.org',
            'yusuf@amanahcoop.org',
            'ayesha@amanahcoop.org',
            'bilal@amanahcoop.org',
          ];
          const DEMO_USER_IDS = [
            'usr-admin-1',
            'usr-mgr-1',
            'usr-mem-1',
            'usr-mem-2',
            'usr-mem-3',
            'usr-mem-4',
            'usr-pending-1',
          ];
          await Promise.allSettled([
            db.collection('users').deleteMany({
              $or: [
                { email: { $in: DEMO_EMAILS } },
                { id: { $in: DEMO_USER_IDS } },
              ],
            }),
            db.collection('contributions').deleteMany({
              userId: { $in: DEMO_USER_IDS },
            }),
            db.collection('loans').deleteMany({
              borrowerId: { $in: DEMO_USER_IDS },
            }),
            db.collection('emailNotifications').deleteMany({
              $or: [
                { recipientEmail: { $in: DEMO_EMAILS } },
                { recipientUserId: { $in: DEMO_USER_IDS } },
              ],
            }),
            db.collection('auditLogs').deleteMany({
              actorId: { $in: DEMO_USER_IDS },
            }),
            db.collection('halalProjects').deleteMany({
              id: { $in: ['halal-proj-1', 'halal-proj-2', 'halal-proj-3'] },
            }),
          ]);
          // No demo users or sample content are inserted. First signup becomes admin.
          await Promise.allSettled([
            db.collection('users').createIndex({ id: 1 }, { unique: true }),
            db.collection('users').createIndex({ email: 1 }),
            db.collection('contributions').createIndex({ id: 1 }, { unique: true }),
            db.collection('contributions').createIndex({ userId: 1, billingMonth: 1 }),
            db.collection('loans').createIndex({ id: 1 }, { unique: true }),
            db.collection('loans').createIndex({ borrowerId: 1, status: 1 }),
            db.collection('halalProjects').createIndex({ id: 1 }, { unique: true }),
            db.collection('emailNotifications').createIndex({ id: 1 }, { unique: true }),
            db.collection('emailNotifications').createIndex({ recipientUserId: 1, createdAt: -1 }),
            db.collection('auditLogs').createIndex({ id: 1 }, { unique: true }),
            db.collection('auditLogs').createIndex({ timestamp: -1 }),
            db.collection('communityPosts').createIndex({ id: 1 }, { unique: true }),
            db.collection('communityPosts').createIndex({ createdAt: -1 }),
            db.collection('privateMessages').createIndex({ id: 1 }, { unique: true }),
            db.collection('privateMessages').createIndex({ conversationId: 1, createdAt: 1 }),
            db.collection('decisionPolls').createIndex({ id: 1 }, { unique: true }),
            db.collection('decisionPolls').createIndex({ createdAt: -1 }),
            db.collection('meetings').createIndex({ id: 1 }, { unique: true }),
            db.collection('meetings').createIndex({ scheduledFor: 1 }),
            db.collection('notices').createIndex({ id: 1 }, { unique: true }),
            db.collection('notices').createIndex({ createdAt: -1 }),
            db.collection('profileChangeRequests').createIndex({ id: 1 }, { unique: true }),
            db.collection('profileChangeRequests').createIndex({ requestedAt: -1 }),
            db.collection('passwordResetRequests').createIndex({ id: 1 }, { unique: true }),
            db.collection('passwordResetRequests').createIndex({ requestedAt: -1 }),
            db.collection('emailQueue').createIndex({ id: 1 }, { unique: true }),
            db.collection('emailQueue').createIndex({ status: 1, nextAttemptAt: 1 }),
            db.collection('emailQueue').createIndex({ createdAt: -1 }),
            db.collection('faqs').createIndex({ id: 1 }, { unique: true }),
            db.collection('faqs').createIndex({ sortOrder: 1 }),
            db.collection('usedActivationOtps').createIndex({ id: 1 }, { unique: true }),
            db.collection('usedActivationOtps').createIndex({ otp: 1 }, { unique: true }),
          ]);
          await db
            .collection('fundConfig')
            .updateOne({ id: 'default-config' }, { $set: { schemaInitVersion: SCHEMA_INIT_VERSION } })
            .catch(() => undefined);
        }

        runtime.initialized = true;
        return runtime.storageEngine;
      } catch (err) {
        const safeCode = extractSafeErrorCode(err);
        console.warn(
          `[DB] MongoDB Atlas connection failed (${safeCode}); falling back to encrypted local vault (will retry automatically):`,
          err instanceof Error ? err.message : safeCode
        );
        if (candidateClient) {
          await candidateClient.close().catch(() => undefined);
        }
        runtime.mongoClient = null;
        runtime.mongoDb = null;
        runtime.storageEngine = 'encrypted_local_vault';
        runtime.storageReason = 'connection_failed';
        runtime.connectionErrorCode = safeCode;
        readLocalVault();
        runtime.initialized = true;
        return runtime.storageEngine;
      }
    }

    runtime.mongoClient = null;
    runtime.mongoDb = null;
    runtime.storageEngine = 'encrypted_local_vault';
    runtime.storageReason = parsedUri.reason ?? 'missing_uri';
    runtime.connectionErrorCode = null;
    readLocalVault();
    runtime.initialized = true;
    return runtime.storageEngine;
  };

  runtime.initPromise = runInit().finally(() => {
    runtime.initPromise = null;
  });
  return runtime.initPromise;
}

export function getStorageEngine(): StorageEngine {
  return runtime.storageEngine;
}

export function getStorageDiagnostic(): StorageDiagnostic {
  return {
    storageEngine: runtime.storageEngine,
    storageReason: runtime.storageReason,
    connectionErrorCode: runtime.connectionErrorCode,
  };
}

async function fetchVaultStateFromMongo(mongoDb: Db): Promise<VaultState> {
  const [
    users,
    configDoc,
    contributions,
    loans,
    halalProjects,
    emailNotifications,
    auditLogs,
    communityPosts,
    privateMessages,
    decisionPolls,
    meetings,
    notices,
    profileChangeRequests,
    passwordResetRequests,
    emailQueue,
    faqs,
    usedActivationOtps,
  ] = await Promise.all([
    mongoDb.collection<StoredUser>('users').find({}, { projection: { _id: 0 } }).toArray(),
    mongoDb.collection<FundConfig>('fundConfig').findOne({ id: 'default-config' }, { projection: { _id: 0 } }),
    mongoDb.collection<Contribution>('contributions').find({}, { projection: { _id: 0 } }).sort({ submittedAt: -1 }).toArray(),
    mongoDb.collection<LoanRequest>('loans').find({}, { projection: { _id: 0 } }).sort({ requestedAt: -1 }).toArray(),
    mongoDb.collection<HalalProject>('halalProjects').find({}, { projection: { _id: 0 } }).toArray(),
    mongoDb.collection<EmailNotification>('emailNotifications').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
    mongoDb.collection<AuditLogEntry>('auditLogs').find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).toArray(),
    mongoDb.collection<CommunityPost>('communityPosts').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
    mongoDb.collection<StoredPrivateMessage>('privateMessages').find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray(),
    mongoDb.collection<DecisionPoll>('decisionPolls').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
    mongoDb.collection<CoopMeeting>('meetings').find({}, { projection: { _id: 0 } }).sort({ scheduledFor: 1 }).toArray(),
    mongoDb.collection<CoopNotice>('notices').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
    mongoDb.collection<ProfileChangeRequest>('profileChangeRequests').find({}, { projection: { _id: 0 } }).sort({ requestedAt: -1 }).toArray(),
    mongoDb.collection<PasswordResetRequest>('passwordResetRequests').find({}, { projection: { _id: 0 } }).sort({ requestedAt: -1 }).toArray(),
    mongoDb.collection<EmailQueueItem>('emailQueue').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
    mongoDb.collection<FaqItem>('faqs').find({}, { projection: { _id: 0 } }).sort({ sortOrder: 1, createdAt: 1 }).toArray(),
    mongoDb.collection<UsedActivationOtpRecord>('usedActivationOtps').find({}, { projection: { _id: 0 } }).toArray(),
  ]);

  return normalizeVaultState({
    users,
    fundConfig: configDoc || createEmptyVaultState().fundConfig,
    contributions,
    loans,
    halalProjects,
    emailNotifications,
    auditLogs,
    communityPosts,
    privateMessages,
    decisionPolls,
    meetings,
    notices,
    profileChangeRequests,
    passwordResetRequests,
    emailQueue,
    faqs,
    usedActivationOtps,
  });
}

export async function loadVaultState(options?: { bypassCache?: boolean }): Promise<VaultState> {
  await initDatabase();
  const mongoDb = runtime.mongoDb;
  if (mongoDb) {
    const bypass = Boolean(options?.bypassCache);
    if (!bypass && runtime.vaultCache && Date.now() < runtime.vaultCacheExpiresAt) {
      return structuredClone(runtime.vaultCache);
    }
    if (!bypass && runtime.vaultLoadPromise) {
      const shared = await runtime.vaultLoadPromise;
      return structuredClone(shared);
    }

    const loadPromise = fetchVaultStateFromMongo(mongoDb)
      .then((normalized) => {
        hydrateReadCachesFromState(normalized);
        return normalized;
      })
      .finally(() => {
        if (runtime.vaultLoadPromise === loadPromise) {
          runtime.vaultLoadPromise = null;
        }
      });

    if (!bypass) {
      runtime.vaultLoadPromise = loadPromise;
    }
    const fresh = await loadPromise;
    return structuredClone(fresh);
  }
  return readLocalVault();
}

/** Lightweight single-collection auth lookup so middleware does not load all 17 collections. */
export async function findActiveUserByIds(ids: string[]): Promise<StoredUser | null> {
  if (ids.length === 0) return null;
  await initDatabase();
  const mongoDb = runtime.mongoDb;

  if (!mongoDb) {
    const state = readLocalVault();
    for (const id of ids) {
      const found = state.users.find((u) => u.id === id && u.status === 'active');
      if (found) return found;
    }
    return null;
  }

  const now = Date.now();
  if (runtime.vaultCache && now < runtime.vaultCacheExpiresAt) {
    for (const id of ids) {
      const found = runtime.vaultCache.users.find((u) => u.id === id && u.status === 'active');
      if (found) return structuredClone(found);
    }
    return null;
  }

  // Check per-user short-TTL cache before hitting MongoDB
  let allCached = true;
  for (const id of ids) {
    const cached = runtime.userCache.get(id);
    if (!cached || now >= cached.expiresAt) {
      allCached = false;
      break;
    }
    if (cached.value && cached.value.status === 'active') {
      return structuredClone(cached.value);
    }
  }
  if (allCached) return null;

  const docs = await mongoDb
    .collection<StoredUser>('users')
    .find({ id: { $in: ids }, status: 'active' }, { projection: { _id: 0 } })
    .toArray();
  const byId = new Map(docs.map((u) => [u.id, u]));
  const expiresAt = Date.now() + VAULT_READ_CACHE_TTL_MS;
  for (const id of ids) {
    runtime.userCache.set(id, { value: byId.get(id) ?? null, expiresAt });
  }
  for (const id of ids) {
    const found = byId.get(id);
    if (found) return structuredClone(found);
  }
  return null;
}

/** Lightweight single-collection loader for fundConfig / constitution metadata. */
export async function loadFundConfigOnly(): Promise<FundConfig> {
  await initDatabase();
  const mongoDb = runtime.mongoDb;
  if (!mongoDb) {
    return readLocalVault().fundConfig;
  }
  const now = Date.now();
  if (runtime.fundConfigCache && now < runtime.fundConfigCache.expiresAt) {
    return structuredClone(runtime.fundConfigCache.value);
  }
  const doc = await mongoDb
    .collection<FundConfig>('fundConfig')
    .findOne({ id: 'default-config' }, { projection: { _id: 0 } });
  const cfg = doc || createEmptyVaultState().fundConfig;
  runtime.fundConfigCache = {
    value: structuredClone(cfg),
    expiresAt: Date.now() + PUBLIC_SLICE_CACHE_TTL_MS,
  };
  return structuredClone(cfg);
}

/** Lightweight single-collection loader for FAQs. */
export async function loadFaqsOnly(): Promise<FaqItem[]> {
  await initDatabase();
  const mongoDb = runtime.mongoDb;
  if (!mongoDb) {
    const state = readLocalVault();
    return sortFaqItems(Array.isArray(state.faqs) ? state.faqs : []);
  }
  const now = Date.now();
  if (runtime.faqsCache && now < runtime.faqsCache.expiresAt) {
    return structuredClone(runtime.faqsCache.value);
  }
  const docs = await mongoDb
    .collection<FaqItem>('faqs')
    .find({}, { projection: { _id: 0 } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .toArray();
  const sorted = sortFaqItems(docs);
  runtime.faqsCache = {
    value: structuredClone(sorted),
    expiresAt: Date.now() + PUBLIC_SLICE_CACHE_TTL_MS,
  };
  return structuredClone(sorted);
}

/** Lightweight single-collection loader for cooperative notices. */
export async function loadNoticesOnly(): Promise<CoopNotice[]> {
  await initDatabase();
  const mongoDb = runtime.mongoDb;
  if (!mongoDb) {
    return readLocalVault().notices || [];
  }
  const now = Date.now();
  if (runtime.noticesCache && now < runtime.noticesCache.expiresAt) {
    return structuredClone(runtime.noticesCache.value);
  }
  const docs = await mongoDb
    .collection<CoopNotice>('notices')
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
  runtime.noticesCache = {
    value: structuredClone(docs),
    expiresAt: Date.now() + PUBLIC_SLICE_CACHE_TTL_MS,
  };
  return structuredClone(docs);
}

/** Lightweight single-collection loader for login/signup bootstrap & reference lists. */
export async function loadUserBootstrapSummary(): Promise<UserBootstrapSummary> {
  await initDatabase();
  const mongoDb = runtime.mongoDb;
  if (!mongoDb) {
    const state = readLocalVault();
    const active = state.users.filter((u) => u.status === 'active');
    return {
      hasMembers: state.users.length > 0,
      activeMembersCount: active.length,
      activeReferences: active.map((u) => ({ name: u.name, memberCode: u.memberCode })),
    };
  }
  const now = Date.now();
  if (runtime.bootstrapSummaryCache && now < runtime.bootstrapSummaryCache.expiresAt) {
    return structuredClone(runtime.bootstrapSummaryCache.value);
  }
  const docs = await mongoDb
    .collection<Pick<StoredUser, 'name' | 'memberCode' | 'status'>>('users')
    .find({}, { projection: { _id: 0, name: 1, memberCode: 1, status: 1 } })
    .toArray();
  const active = docs.filter((u) => u.status === 'active');
  const summary: UserBootstrapSummary = {
    hasMembers: docs.length > 0,
    activeMembersCount: active.length,
    activeReferences: active.map((u) => ({ name: u.name, memberCode: u.memberCode })),
  };
  runtime.bootstrapSummaryCache = {
    value: structuredClone(summary),
    expiresAt: Date.now() + PUBLIC_SLICE_CACHE_TTL_MS,
  };
  return structuredClone(summary);
}

async function syncCollectionById<T extends { id: string }>(
  db: Db,
  collectionName: string,
  prevItems: T[],
  nextItems: T[]
): Promise<void> {
  const collection = db.collection<T>(collectionName);
  const prevMap = new Map(prevItems.map((item) => [item.id, JSON.stringify(item)]));
  const nextIds = new Set(nextItems.map((item) => item.id));

  const removedIds = prevItems.filter((item) => !nextIds.has(item.id)).map((item) => item.id);
  const changedOrNew = nextItems.filter((item) => prevMap.get(item.id) !== JSON.stringify(item));

  if (removedIds.length > 0) {
    await collection.deleteMany({ id: { $in: removedIds } } as never);
  }
  if (changedOrNew.length > 0) {
    await collection.bulkWrite(
      changedOrNew.map((doc) => ({
        replaceOne: {
          filter: { id: doc.id } as never,
          replacement: doc,
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
}

export function updateVaultState(
  mutator: (state: VaultState) => VaultState | Promise<VaultState>
): Promise<VaultState> {
  const run = async (): Promise<VaultState> => {
    // Always read authoritative state from storage before applying a mutation.
    const current = await loadVaultState({ bypassCache: true });
    const next = await mutator(structuredClone(current));

    const mongoDb = runtime.mongoDb;
    if (mongoDb) {
      const configChanged = JSON.stringify(current.fundConfig) !== JSON.stringify(next.fundConfig);
      await Promise.all([
        syncCollectionById(mongoDb, 'users', current.users, next.users),
        configChanged
          ? mongoDb
              .collection('fundConfig')
              .replaceOne(
                { id: 'default-config' },
                { ...next.fundConfig, schemaInitVersion: SCHEMA_INIT_VERSION },
                { upsert: true }
              )
          : Promise.resolve(),
        syncCollectionById(mongoDb, 'contributions', current.contributions, next.contributions),
        syncCollectionById(mongoDb, 'loans', current.loans, next.loans),
        syncCollectionById(mongoDb, 'halalProjects', current.halalProjects, next.halalProjects),
        syncCollectionById(
          mongoDb,
          'emailNotifications',
          current.emailNotifications,
          next.emailNotifications
        ),
        syncCollectionById(mongoDb, 'auditLogs', current.auditLogs, next.auditLogs),
        syncCollectionById(mongoDb, 'communityPosts', current.communityPosts, next.communityPosts),
        syncCollectionById(mongoDb, 'privateMessages', current.privateMessages, next.privateMessages),
        syncCollectionById(
          mongoDb,
          'decisionPolls',
          current.decisionPolls || [],
          next.decisionPolls || []
        ),
        syncCollectionById(
          mongoDb,
          'meetings',
          current.meetings || [],
          next.meetings || []
        ),
        syncCollectionById(
          mongoDb,
          'notices',
          current.notices || [],
          next.notices || []
        ),
        syncCollectionById(
          mongoDb,
          'profileChangeRequests',
          current.profileChangeRequests || [],
          next.profileChangeRequests || []
        ),
        syncCollectionById(
          mongoDb,
          'passwordResetRequests',
          current.passwordResetRequests || [],
          next.passwordResetRequests || []
        ),
        syncCollectionById(
          mongoDb,
          'emailQueue',
          current.emailQueue || [],
          next.emailQueue || []
        ),
        syncCollectionById(
          mongoDb,
          'faqs',
          current.faqs || [],
          next.faqs || []
        ),
        syncCollectionById(
          mongoDb,
          'usedActivationOtps',
          current.usedActivationOtps || [],
          next.usedActivationOtps || []
        ),
      ]);
      hydrateReadCachesFromState(next);
    } else {
      invalidateReadCaches();
      writeLocalVault(next);
    }
    return next;
  };

  const result = runtime.vaultWriteQueue.then(run, run);
  runtime.vaultWriteQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function pruneInMemoryRevokedTokens(nowMs: number): void {
  for (const [id, expMs] of runtime.revokedTokenIds.entries()) {
    if (!Number.isFinite(expMs) || expMs <= nowMs) {
      runtime.revokedTokenIds.delete(id);
    }
  }
}

async function ensureRevokedTokenIndexes(mongoDb: Db): Promise<void> {
  if (runtime.revokedTokenIndexesReady) return;
  runtime.revokedTokenIndexesReady = true;
  await Promise.allSettled([
    mongoDb.collection('revokedTokens').createIndex({ id: 1 }, { unique: true }),
    mongoDb.collection('revokedTokens').createIndex({ expiresAt: 1 }),
  ]);
}

/** Persist revoked JWT identifiers so signed-out sessions cannot be replayed across instances. */
export async function revokeSessionTokens(
  entries: Array<{ id: string; userId?: string; expiresAt: string }>
): Promise<void> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  pruneInMemoryRevokedTokens(nowMs);

  const normalized: RevokedTokenRecord[] = [];
  const seen = new Set<string>();
  for (const raw of entries) {
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id || seen.has(id)) continue;
    const expMs = Date.parse(raw.expiresAt);
    const validExpMs =
      Number.isFinite(expMs) && expMs > nowMs ? expMs : nowMs + 7 * 24 * 60 * 60 * 1000;
    seen.add(id);
    runtime.revokedTokenIds.set(id, validExpMs);
    normalized.push({
      id,
      ...(raw.userId ? { userId: raw.userId } : {}),
      revokedAt: nowIso,
      expiresAt: new Date(validExpMs).toISOString(),
    });
  }

  if (normalized.length === 0) return;

  await initDatabase();
  const mongoDb = runtime.mongoDb;
  if (mongoDb) {
    await ensureRevokedTokenIndexes(mongoDb);
    const col = mongoDb.collection<RevokedTokenRecord>('revokedTokens');
    await col.bulkWrite(
      normalized.map((doc) => ({
        replaceOne: {
          filter: { id: doc.id },
          replacement: doc,
          upsert: true,
        },
      })),
      { ordered: false }
    );
    // Best-effort cleanup of already-expired revocation tombstones
    void col.deleteMany({ expiresAt: { $lt: nowIso } }).catch(() => undefined);
    return;
  }

  // Local encrypted vault mode: serialize write onto vaultWriteQueue so it never races with updateVaultState
  const persistLocal = async (): Promise<void> => {
    const state = readLocalVault();
    const byId = new Map<string, RevokedTokenRecord>();
    for (const existing of state.revokedTokens || []) {
      const expMs = Date.parse(existing.expiresAt);
      if (existing.id && Number.isFinite(expMs) && expMs > nowMs) {
        byId.set(existing.id, existing);
      }
    }
    for (const item of normalized) {
      byId.set(item.id, item);
    }
    state.revokedTokens = Array.from(byId.values());
    writeLocalVault(state);
  };

  const queued = runtime.vaultWriteQueue.then(persistLocal, persistLocal);
  runtime.vaultWriteQueue = queued.then(
    () => undefined,
    () => undefined
  );
  await queued;
}

/** Check which of the given token IDs have been revoked (checks memory + persistent store). */
export async function findRevokedTokenIds(tokenIds: string[]): Promise<Set<string>> {
  const revoked = new Set<string>();
  if (tokenIds.length === 0) return revoked;

  const nowMs = Date.now();
  pruneInMemoryRevokedTokens(nowMs);

  const unchecked: string[] = [];
  for (const rawId of tokenIds) {
    const id = rawId.trim();
    if (!id) continue;
    const memExp = runtime.revokedTokenIds.get(id);
    if (memExp !== undefined && memExp > nowMs) {
      revoked.add(id);
    } else if (!unchecked.includes(id)) {
      unchecked.push(id);
    }
  }

  if (unchecked.length === 0) return revoked;

  try {
    await initDatabase();
    const mongoDb = runtime.mongoDb;
    if (mongoDb) {
      const docs = await mongoDb
        .collection<RevokedTokenRecord>('revokedTokens')
        .find({ id: { $in: unchecked } }, { projection: { _id: 0, id: 1, expiresAt: 1 } })
        .toArray();
      for (const doc of docs) {
        const expMs = Date.parse(doc.expiresAt);
        if (doc.id && Number.isFinite(expMs) && expMs > nowMs) {
          runtime.revokedTokenIds.set(doc.id, expMs);
          revoked.add(doc.id);
        }
      }
      return revoked;
    }

    const state = readLocalVault();
    const uncheckedSet = new Set(unchecked);
    for (const entry of state.revokedTokens || []) {
      if (!entry.id || !uncheckedSet.has(entry.id)) continue;
      const expMs = Date.parse(entry.expiresAt);
      if (Number.isFinite(expMs) && expMs > nowMs) {
        runtime.revokedTokenIds.set(entry.id, expMs);
        revoked.add(entry.id);
      }
    }
  } catch (err) {
    console.warn('[Auth] Revocation lookup error (falling back to in-memory revocation set):', err);
  }

  return revoked;
}

