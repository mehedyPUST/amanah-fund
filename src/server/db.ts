import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { MongoClient, type Db } from 'mongodb';
import type {
  AuditLogEntry,
  Contribution,
  EmailNotification,
  EncryptedEnvelope,
  FundConfig,
  HalalProject,
  LoanRequest,
  UserRole,
  UserStatus,
} from '../types/coop.ts';
import { computeSha256Hash, encryptSensitiveObject } from './crypto.ts';

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
  encryptedRegistrationDetails?: EncryptedEnvelope;
}

export interface VaultState {
  users: StoredUser[];
  fundConfig: FundConfig;
  contributions: Contribution[];
  loans: LoanRequest[];
  halalProjects: HalalProject[];
  emailNotifications: EmailNotification[];
  auditLogs: AuditLogEntry[];
}

const VAULT_DIR = path.resolve(process.cwd(), 'data');
const VAULT_FILE = path.join(VAULT_DIR, 'amanah-coop-vault.json');

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let storageEngine: 'mongodb_atlas' | 'encrypted_local_vault' = 'encrypted_local_vault';
let initialized = false;
let memoryState: VaultState | null = null;
let vaultWriteQueue: Promise<void> = Promise.resolve();

function createSeedState(): VaultState {
  const passwordHash = bcrypt.hashSync('Amanah@2026', 10);

  const users: StoredUser[] = [
    {
      id: 'usr-admin-1',
      name: 'Amanah Administrator',
      email: 'admin@amanahcoop.org',
      passwordHash,
      role: 'admin',
      memberCode: 'AC-001',
      status: 'active',
      joinedAt: '2026-01-01T09:00:00.000Z',
      phoneMasked: '••••4102',
    },
  ];

  const fundConfig: FundConfig = {
    id: 'default-config',
    fundName: 'Amanah',
    currency: 'BDT',
    monthlyContributionAmount: 5000,
    maxLoansPerYear: 3,
    maxLoanAmount: 75000,
    maxInstallmentMonths: 12,
    voteThresholdNumerator: 2,
    voteThresholdDenominator: 3,
    maturityDate: '2028-12-31',
    halalInvestmentThesis:
      'Upon reaching the pre-specified maturity date, accumulated cooperative capital transitions from Qard Hasan liquidity into Shariah-screened Mudarabah SME agriculture, healthcare equipment Murabahah, and clean-energy Musharakah ventures.',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'Amanah Administrator',
  };

  const log1Payload = {
    event: 'treasury_genesis',
    maturityDate: fundConfig.maturityDate,
    maxLoansPerYear: fundConfig.maxLoansPerYear,
  };
  const log1Hash = computeSha256Hash({ index: 1, ...log1Payload });

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'audit-001',
      timestamp: '2026-01-01T00:05:00.000Z',
      actorId: 'usr-admin-1',
      actorName: 'Amanah Administrator',
      actorRole: 'admin',
      action: 'FUND_CONFIG_INITIALIZED',
      resourceType: 'config',
      resourceId: 'default-config',
      summary:
        'Cooperative fund initialized with 2028-12-31 Halal maturity date and 3 loans/year limit',
      encryptedPayload: encryptSensitiveObject(log1Payload),
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      entryHash: log1Hash,
    },
  ];

  return {
    users,
    fundConfig,
    contributions: [],
    loans: [],
    halalProjects: [],
    emailNotifications: [],
    auditLogs,
  };
}

const LEGACY_FAKE_USER_IDS = new Set([
  'usr-mgr-1',
  'usr-mem-1',
  'usr-mem-2',
  'usr-mem-3',
  'usr-mem-4',
  'usr-pending-1',
]);

const LEGACY_FAKE_USER_EMAILS = new Set([
  'nadia@amanahcoop.org',
  'imran@amanahcoop.org',
  'fatima@amanahcoop.org',
  'yusuf@amanahcoop.org',
  'ayesha@amanahcoop.org',
  'bilal@amanahcoop.org',
]);

const LEGACY_FAKE_LOAN_IDS = new Set(['loan-2026-001', 'loan-2026-002', 'loan-2026-003']);
const LEGACY_FAKE_PROJECT_IDS = new Set(['halal-proj-1', 'halal-proj-2', 'halal-proj-3']);
const LEGACY_FAKE_NOTIF_IDS = new Set(['notif-001', 'notif-002', 'notif-003', 'notif-004']);
const LEGACY_FAKE_AUDIT_IDS = new Set(['audit-002', 'audit-003']);

function purgeLegacyFakeSeedData(state: VaultState): { state: VaultState; changed: boolean } {
  let changed = false;

  const filteredUsers = (state.users || []).filter((u) => {
    const isFake =
      LEGACY_FAKE_USER_IDS.has(u.id) || LEGACY_FAKE_USER_EMAILS.has(u.email.toLowerCase());
    if (isFake) changed = true;
    return !isFake;
  });

  state.users = filteredUsers.map((u) => {
    if (u.id === 'usr-admin-1' && u.name === 'Tariq Al-Mansoor') {
      changed = true;
      return { ...u, name: 'Amanah Administrator' };
    }
    return u;
  });

  if (state.fundConfig?.updatedBy === 'Tariq Al-Mansoor') {
    state.fundConfig.updatedBy = 'Amanah Administrator';
    changed = true;
  }

  const beforeContribs = (state.contributions || []).length;
  state.contributions = (state.contributions || []).filter(
    (c) =>
      !LEGACY_FAKE_USER_IDS.has(c.userId) &&
      !/^contrib-2026-\d{2}-usr-/.test(c.id)
  );
  if (state.contributions.length !== beforeContribs) changed = true;

  const beforeLoans = (state.loans || []).length;
  state.loans = (state.loans || []).filter(
    (l) => !LEGACY_FAKE_LOAN_IDS.has(l.id) && !LEGACY_FAKE_USER_IDS.has(l.borrowerId)
  );
  if (state.loans.length !== beforeLoans) changed = true;

  const beforeProjects = (state.halalProjects || []).length;
  state.halalProjects = (state.halalProjects || []).filter(
    (p) => !LEGACY_FAKE_PROJECT_IDS.has(p.id)
  );
  if (state.halalProjects.length !== beforeProjects) changed = true;

  const beforeNotifs = (state.emailNotifications || []).length;
  state.emailNotifications = (state.emailNotifications || []).filter(
    (n) =>
      !LEGACY_FAKE_NOTIF_IDS.has(n.id) &&
      !LEGACY_FAKE_USER_EMAILS.has((n.recipientEmail || '').toLowerCase()) &&
      !(n.recipientUserId && LEGACY_FAKE_USER_IDS.has(n.recipientUserId))
  );
  if (state.emailNotifications.length !== beforeNotifs) changed = true;

  const beforeAudits = (state.auditLogs || []).length;
  state.auditLogs = (state.auditLogs || [])
    .filter((a) => !LEGACY_FAKE_AUDIT_IDS.has(a.id) && !LEGACY_FAKE_USER_IDS.has(a.actorId))
    .map((a) => {
      if (a.id === 'audit-001' && a.actorName === 'Tariq Al-Mansoor') {
        changed = true;
        return { ...a, actorName: 'Amanah Administrator' };
      }
      return a;
    });
  if (state.auditLogs.length !== beforeAudits) changed = true;

  return { state, changed };
}

function normalizeVaultState(state: VaultState): VaultState {
  purgeLegacyFakeSeedData(state);
  state.emailNotifications = Array.isArray(state.emailNotifications)
    ? state.emailNotifications
    : [];
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
    const seed = createSeedState();
    fs.writeFileSync(VAULT_FILE, JSON.stringify(seed, null, 2), 'utf8');
    memoryState = seed;
    return structuredClone(seed);
  }
  const raw = fs.readFileSync(VAULT_FILE, 'utf8');
  const parsed = JSON.parse(raw) as VaultState;
  const { changed } = purgeLegacyFakeSeedData(parsed);
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

      const usersCount = await mongoDb.collection('users').countDocuments();
      if (usersCount === 0) {
        const seed = createSeedState();
        await mongoDb.collection('users').insertMany(seed.users);
        await mongoDb.collection('fundConfig').insertOne(seed.fundConfig);
        if (seed.auditLogs.length) {
          await mongoDb.collection('auditLogs').insertMany(seed.auditLogs);
        }
      } else {
        await Promise.all([
          mongoDb.collection('users').deleteMany({
            $or: [
              { id: { $in: Array.from(LEGACY_FAKE_USER_IDS) } },
              { email: { $in: Array.from(LEGACY_FAKE_USER_EMAILS) } },
            ],
          }),
          mongoDb.collection('users').updateOne(
            { id: 'usr-admin-1', name: 'Tariq Al-Mansoor' },
            { $set: { name: 'Amanah Administrator' } }
          ),
          mongoDb.collection('fundConfig').updateOne(
            { id: 'default-config', updatedBy: 'Tariq Al-Mansoor' },
            { $set: { updatedBy: 'Amanah Administrator' } }
          ),
          mongoDb.collection('contributions').deleteMany({
            $or: [
              { userId: { $in: Array.from(LEGACY_FAKE_USER_IDS) } },
              { id: { $regex: '^contrib-2026-\\d{2}-usr-' } },
            ],
          }),
          mongoDb.collection('loans').deleteMany({
            $or: [
              { id: { $in: Array.from(LEGACY_FAKE_LOAN_IDS) } },
              { borrowerId: { $in: Array.from(LEGACY_FAKE_USER_IDS) } },
            ],
          }),
          mongoDb.collection('halalProjects').deleteMany({
            id: { $in: Array.from(LEGACY_FAKE_PROJECT_IDS) },
          }),
          mongoDb.collection('emailNotifications').deleteMany({
            $or: [
              { id: { $in: Array.from(LEGACY_FAKE_NOTIF_IDS) } },
              { recipientEmail: { $in: Array.from(LEGACY_FAKE_USER_EMAILS) } },
              { recipientUserId: { $in: Array.from(LEGACY_FAKE_USER_IDS) } },
            ],
          }),
          mongoDb.collection('auditLogs').deleteMany({
            $or: [
              { id: { $in: Array.from(LEGACY_FAKE_AUDIT_IDS) } },
              { actorId: { $in: Array.from(LEGACY_FAKE_USER_IDS) } },
            ],
          }),
        ]);
      }
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
    const [users, configDoc, contributions, loans, halalProjects, emailNotifications, auditLogs] =
      await Promise.all([
        mongoDb.collection<StoredUser>('users').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection<FundConfig>('fundConfig').findOne({ id: 'default-config' }, { projection: { _id: 0 } }),
        mongoDb.collection<Contribution>('contributions').find({}, { projection: { _id: 0 } }).sort({ submittedAt: -1 }).toArray(),
        mongoDb.collection<LoanRequest>('loans').find({}, { projection: { _id: 0 } }).sort({ requestedAt: -1 }).toArray(),
        mongoDb.collection<HalalProject>('halalProjects').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection<EmailNotification>('emailNotifications').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
        mongoDb.collection<AuditLogEntry>('auditLogs').find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).toArray(),
      ]);

    return normalizeVaultState({
      users,
      fundConfig: configDoc || createSeedState().fundConfig,
      contributions,
      loans,
      halalProjects,
      emailNotifications,
      auditLogs,
    });
  }
  return readLocalVault();
}

export function updateVaultState(
  mutator: (state: VaultState) => VaultState | Promise<VaultState>
): Promise<VaultState> {
  const run = async (): Promise<VaultState> => {
    const current = await loadVaultState();
    const next = await mutator(structuredClone(current));

    if (mongoDb) {
      await Promise.all([
        mongoDb
          .collection('users')
          .deleteMany({})
          .then(() => (next.users.length ? mongoDb!.collection('users').insertMany(next.users) : null)),
        mongoDb.collection('fundConfig').replaceOne({ id: 'default-config' }, next.fundConfig, { upsert: true }),
        mongoDb
          .collection('contributions')
          .deleteMany({})
          .then(() => (next.contributions.length ? mongoDb!.collection('contributions').insertMany(next.contributions) : null)),
        mongoDb
          .collection('loans')
          .deleteMany({})
          .then(() => (next.loans.length ? mongoDb!.collection('loans').insertMany(next.loans) : null)),
        mongoDb
          .collection('halalProjects')
          .deleteMany({})
          .then(() => (next.halalProjects.length ? mongoDb!.collection('halalProjects').insertMany(next.halalProjects) : null)),
        mongoDb
          .collection('emailNotifications')
          .deleteMany({})
          .then(() => (next.emailNotifications.length ? mongoDb!.collection('emailNotifications').insertMany(next.emailNotifications) : null)),
        mongoDb
          .collection('auditLogs')
          .deleteMany({})
          .then(() => (next.auditLogs.length ? mongoDb!.collection('auditLogs').insertMany(next.auditLogs) : null)),
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
