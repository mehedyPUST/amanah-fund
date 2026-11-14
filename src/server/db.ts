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
    fundName: 'Amanah Mutual Qard & Halal Fund',
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

function normalizeVaultState(state: VaultState): VaultState {
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
  if (memoryState) return memoryState;
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
  if (!fs.existsSync(VAULT_FILE)) {
    const seed = createSeedState();
    fs.writeFileSync(VAULT_FILE, JSON.stringify(seed, null, 2), 'utf8');
    memoryState = seed;
    return seed;
  }
  const raw = fs.readFileSync(VAULT_FILE, 'utf8');
  memoryState = normalizeVaultState(JSON.parse(raw) as VaultState);
  return memoryState;
}

function writeLocalVault(state: VaultState): void {
  memoryState = state;
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

export async function updateVaultState(mutator: (state: VaultState) => VaultState | Promise<VaultState>): Promise<VaultState> {
  const current = await loadVaultState();
  const next = await mutator(structuredClone(current));

  if (mongoDb) {
    await Promise.all([
      mongoDb.collection('users').deleteMany({}).then(() => (next.users.length ? mongoDb!.collection('users').insertMany(next.users) : null)),
      mongoDb.collection('fundConfig').replaceOne({ id: 'default-config' }, next.fundConfig, { upsert: true }),
      mongoDb
        .collection('contributions')
        .deleteMany({})
        .then(() => (next.contributions.length ? mongoDb!.collection('contributions').insertMany(next.contributions) : null)),
      mongoDb.collection('loans').deleteMany({}).then(() => (next.loans.length ? mongoDb!.collection('loans').insertMany(next.loans) : null)),
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
}
