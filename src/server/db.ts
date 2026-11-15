import fs from 'node:fs';
import path from 'node:path';
import { MongoClient, type Db } from 'mongodb';
import type {
  AuditLogEntry,
  CommunityPost,
  Contribution,
  CoopMeeting,
  DecisionPoll,
  EmailNotification,
  EncryptedEnvelope,
  FundConfig,
  HalalProject,
  LoanRequest,
  NotificationPreferences,
  ProfileChangeRequest,
  UserRole,
  UserStatus,
} from '../types/coop.ts';

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
  notificationPreferences?: NotificationPreferences;
  encryptedRegistrationDetails?: EncryptedEnvelope;
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
  profileChangeRequests?: ProfileChangeRequest[];
}

const VAULT_DIR = path.resolve(process.cwd(), 'data');
const VAULT_FILE = path.join(VAULT_DIR, 'amanah-coop-vault.json');

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let storageEngine: 'mongodb_atlas' | 'encrypted_local_vault' = 'encrypted_local_vault';
let initialized = false;
let memoryState: VaultState | null = null;
let vaultWriteQueue: Promise<void> = Promise.resolve();

/** Empty cooperative vault — no demo users, loans, or sample content.
 *  Fund defaults are starting values only; admins change them in Site Settings.
 *  The first registered account becomes the bootstrap admin (see /auth/register). */
function createEmptyVaultState(): VaultState {
  const now = new Date().toISOString();
  const fundConfig: FundConfig = {
    id: 'default-config',
    fundName: 'Amanah',
    currency: 'BDT',
    monthlyContributionAmount: 5000,
    maxLoansPerYear: 3,
    maxLoanAmount: 75000,
    maxInstallmentMonths: 12,
    guarantorThresholdAmount: 40000,
    requiredGuarantorsCount: 1,
    voteThresholdNumerator: 2,
    voteThresholdDenominator: 3,
    maturityDate: '2028-12-31',
    managerCycleMonths: 3,
    managerCycleStartDate: now.slice(0, 10),
    halalInvestmentThesis:
      'Upon reaching the pre-specified maturity date, accumulated cooperative capital transitions from Qard Hasan liquidity into Shariah-screened Mudarabah SME agriculture, healthcare equipment Murabahah, and clean-energy Musharakah ventures.',
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
    profileChangeRequests: [],
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
  state.profileChangeRequests = Array.isArray(state.profileChangeRequests)
    ? state.profileChangeRequests
    : [];
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
  if (memoryState) return structuredClone(memoryState);
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
  if (!fs.existsSync(VAULT_FILE)) {
    const empty = createEmptyVaultState();
    fs.writeFileSync(VAULT_FILE, JSON.stringify(empty, null, 2), 'utf8');
    memoryState = empty;
    return structuredClone(empty);
  }
  const raw = fs.readFileSync(VAULT_FILE, 'utf8');
  const parsed = JSON.parse(raw) as VaultState;
  const { changed } = purgeOrphanRecords(parsed);
  memoryState = normalizeVaultState(parsed);
  if (changed) {
    fs.writeFileSync(VAULT_FILE, JSON.stringify(memoryState, null, 2), 'utf8');
  }
  return structuredClone(memoryState);
}

function writeLocalVault(state: VaultState): void {
  memoryState = structuredClone(state);
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
  fs.writeFileSync(VAULT_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function initDatabase(): Promise<'mongodb_atlas' | 'encrypted_local_vault'> {
  if (initialized) return storageEngine;

  const uri = process.env.MONGODB_URI;
  if (uri && uri.startsWith('mongodb') && !uri.includes('<username>')) {
    try {
      mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 4500 });
      await mongoClient.connect();
      mongoDb = mongoClient.db('amanah_coop');
      storageEngine = 'mongodb_atlas';

      const configCount = await mongoDb.collection('fundConfig').countDocuments({
        id: 'default-config',
      });
      if (configCount === 0) {
        const empty = createEmptyVaultState();
        await mongoDb.collection('fundConfig').insertOne(empty.fundConfig);
      }

      // One-time migration: remove historical demo seed accounts & related rows.
      // Real production members are never matched by these exact seed identifiers.
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
        mongoDb.collection('users').deleteMany({
          $or: [
            { email: { $in: DEMO_EMAILS } },
            { id: { $in: DEMO_USER_IDS } },
          ],
        }),
        mongoDb.collection('contributions').deleteMany({
          userId: { $in: DEMO_USER_IDS },
        }),
        mongoDb.collection('loans').deleteMany({
          borrowerId: { $in: DEMO_USER_IDS },
        }),
        mongoDb.collection('emailNotifications').deleteMany({
          $or: [
            { recipientEmail: { $in: DEMO_EMAILS } },
            { recipientUserId: { $in: DEMO_USER_IDS } },
          ],
        }),
        mongoDb.collection('auditLogs').deleteMany({
          actorId: { $in: DEMO_USER_IDS },
        }),
        mongoDb.collection('halalProjects').deleteMany({
          id: { $in: ['halal-proj-1', 'halal-proj-2', 'halal-proj-3'] },
        }),
      ]);
      // No demo users or sample content are inserted. First signup becomes admin.
      await Promise.allSettled([
        mongoDb.collection('users').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('users').createIndex({ email: 1 }),
        mongoDb.collection('contributions').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('contributions').createIndex({ userId: 1, billingMonth: 1 }),
        mongoDb.collection('loans').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('loans').createIndex({ borrowerId: 1, status: 1 }),
        mongoDb.collection('halalProjects').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('emailNotifications').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('emailNotifications').createIndex({ recipientUserId: 1, createdAt: -1 }),
        mongoDb.collection('auditLogs').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('auditLogs').createIndex({ timestamp: -1 }),
        mongoDb.collection('communityPosts').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('communityPosts').createIndex({ createdAt: -1 }),
        mongoDb.collection('privateMessages').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('privateMessages').createIndex({ conversationId: 1, createdAt: 1 }),
        mongoDb.collection('decisionPolls').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('decisionPolls').createIndex({ createdAt: -1 }),
        mongoDb.collection('meetings').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('meetings').createIndex({ scheduledFor: 1 }),
        mongoDb.collection('profileChangeRequests').createIndex({ id: 1 }, { unique: true }),
        mongoDb.collection('profileChangeRequests').createIndex({ requestedAt: -1 }),
      ]);

      initialized = true;
      return storageEngine;
    } catch (err) {
      console.warn('[DB] MongoDB Atlas connection failed, falling back to encrypted local vault:', err);
      mongoClient = null;
      mongoDb = null;
    }
  }

  storageEngine = 'encrypted_local_vault';
  readLocalVault();
  initialized = true;
  return storageEngine;
}

export function getStorageEngine(): 'mongodb_atlas' | 'encrypted_local_vault' {
  return storageEngine;
}

export async function loadVaultState(): Promise<VaultState> {
  await initDatabase();
  if (mongoDb) {
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
      profileChangeRequests,
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
      mongoDb.collection<ProfileChangeRequest>('profileChangeRequests').find({}, { projection: { _id: 0 } }).sort({ requestedAt: -1 }).toArray(),
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
      profileChangeRequests,
    });
  }
  return readLocalVault();
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
    const current = await loadVaultState();
    const next = await mutator(structuredClone(current));

    if (mongoDb) {
      await Promise.all([
        syncCollectionById(mongoDb, 'users', current.users, next.users),
        mongoDb
          .collection('fundConfig')
          .replaceOne({ id: 'default-config' }, next.fundConfig, { upsert: true }),
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
          'profileChangeRequests',
          current.profileChangeRequests || [],
          next.profileChangeRequests || []
        ),
      ]);
    } else {
      writeLocalVault(next);
    }
    return next;
  };

  const result = vaultWriteQueue.then(run, run);
  vaultWriteQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
