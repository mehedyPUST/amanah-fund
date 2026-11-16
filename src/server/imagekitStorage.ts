import crypto from 'node:crypto';
import type { UploadDocumentCategory } from '../types/coop.ts';

export interface ImageKitConfig {
  privateKey: string;
  publicKey?: string;
  urlEndpoint?: string;
  folder: string;
}

export interface ImageKitUploadResult {
  fileId: string;
  filePath: string;
  url: string;
  provider: 'imagekit';
  contentType: string;
}

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const CATEGORY_DEFAULT_SLUG: Record<UploadDocumentCategory, string> = {
  'cooperative-constitution': 'cooperative-constitution',
  'member-kyc-photo': 'member-kyc-photo',
  'member-signed-agreement': 'member-signed-agreement',
  'nominee-kyc-photo': 'nominee-kyc-photo',
  'contribution-receipt': 'contribution-receipt',
  'loan-repayment-slip': 'loan-repayment-slip',
  'community-post-photo': 'community-post-photo',
  document: 'cooperative-document',
};

const CATEGORY_SUBFOLDER: Record<UploadDocumentCategory, string> = {
  'cooperative-constitution': 'governance',
  'member-kyc-photo': 'kyc',
  'member-signed-agreement': 'kyc',
  'nominee-kyc-photo': 'kyc',
  'contribution-receipt': 'receipts',
  'loan-repayment-slip': 'receipts',
  'community-post-photo': 'community',
  document: 'documents',
};

let warnedPartialImageKitConfig = false;

export function normalizeImageKitFolder(rawFolder?: string): string {
  const cleaned = String(rawFolder || '/amanah')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return cleaned ? `/${cleaned}` : '/amanah';
}

export function buildImageKitTargetFolder(
  baseFolder: string,
  category?: UploadDocumentCategory
): string {
  const root = normalizeImageKitFolder(baseFolder);
  if (!category) return root;
  const sub = CATEGORY_SUBFOLDER[category] || 'documents';
  return `${root}/${sub}`;
}

export function slugifySemanticSegment(value?: string, maxLength = 42): string {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength)
    .replace(/-$/g, '');
}

export function buildSemanticFileName(params: {
  category?: UploadDocumentCategory;
  subject?: string;
  rawName?: string;
  ext: string;
  isPdf: boolean;
  dateStr?: string;
  uniqueSuffix?: string;
}): string {
  const categorySlug = params.category
    ? CATEGORY_DEFAULT_SLUG[params.category]
    : slugifySemanticSegment(params.rawName, 36) ||
      (params.isPdf ? 'cooperative-document' : 'cooperative-photo');

  const subjectSlug = slugifySemanticSegment(params.subject, 36);
  const dateToken = params.dateStr || new Date().toISOString().slice(0, 10);
  const suffix = params.uniqueSuffix || crypto.randomBytes(3).toString('hex');

  const parts = [categorySlug, subjectSlug, dateToken, suffix].filter(Boolean);
  return `${parts.join('-')}.${params.ext}`;
}

export function getImageKitConfig(
  env: NodeJS.ProcessEnv = process.env
): ImageKitConfig | null {
  const privateKey = env.IMAGEKIT_PRIVATE_KEY?.trim() || '';
  const publicKey = env.IMAGEKIT_PUBLIC_KEY?.trim() || '';
  const urlEndpoint = env.IMAGEKIT_URL_ENDPOINT?.trim() || '';
  const folder = normalizeImageKitFolder(env.IMAGEKIT_FOLDER);

  if (privateKey) {
    return {
      privateKey,
      publicKey: publicKey || undefined,
      urlEndpoint: urlEndpoint ? urlEndpoint.replace(/\/+$/, '') : undefined,
      folder,
    };
  }

  if ((publicKey || urlEndpoint) && !warnedPartialImageKitConfig) {
    warnedPartialImageKitConfig = true;
    console.warn(
      '[ImageKit] Partial ImageKit.io settings detected. Set IMAGEKIT_PRIVATE_KEY to enable server-side ImageKit.io uploads.'
    );
  }

  return null;
}

export function buildImageKitAuthHeader(privateKey: string): string {
  return `Basic ${Buffer.from(`${privateKey}:`, 'utf8').toString('base64')}`;
}

export async function uploadToImageKit(params: {
  fileName: string;
  base64Payload: string;
  mimeType: string;
  category?: UploadDocumentCategory;
  config?: ImageKitConfig;
  fetchImpl?: typeof fetch;
}): Promise<ImageKitUploadResult> {
  const cfg = params.config || getImageKitConfig();
  if (!cfg) {
    throw new Error('IMAGEKIT_PRIVATE_KEY is not configured in the server environment.');
  }

  const targetFolder = buildImageKitTargetFolder(cfg.folder, params.category);

  const form = new FormData();
  form.set('file', `data:${params.mimeType};base64,${params.base64Payload}`);
  form.set('fileName', params.fileName);
  form.set('folder', targetFolder);
  form.set('useUniqueFileName', 'false');

  const fetcher = params.fetchImpl || fetch;
  const res = await fetcher('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    headers: {
      Authorization: buildImageKitAuthHeader(cfg.privateKey),
    },
    body: form,
  });

  const payload = (await res.json().catch(() => ({}))) as {
    fileId?: string;
    filePath?: string;
    url?: string;
    message?: string;
  };

  if (!res.ok || !payload.url) {
    throw new Error(
      `ImageKit.io upload failed (${res.status}): ${payload.message || res.statusText || 'Unknown error'}`
    );
  }

  return {
    fileId: payload.fileId || '',
    filePath: payload.filePath || `${targetFolder}/${params.fileName}`,
    url: payload.url,
    provider: 'imagekit',
    contentType: params.mimeType,
  };
}

export function validateAndDecodeUpload(params: {
  rawData: string;
  rawName?: string;
  category?: UploadDocumentCategory;
  subject?: string;
  fallbackMimeType?: string;
}): {
  buffer: Buffer;
  base64Payload: string;
  mimeType: string;
  ext: string;
  filename: string;
  isPdf: boolean;
  category: UploadDocumentCategory;
} {
  const trimmed = params.rawData.trim();
  if (!trimmed) {
    throw new Error('File payload is required.');
  }

  let mimeType = (params.fallbackMimeType || 'image/jpeg').toLowerCase();
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  let base64Payload = trimmed;

  const dataUrlMatch = trimmed.match(
    /^data:(application\/pdf|image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i
  );
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase();
    if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
    base64Payload = dataUrlMatch[2];
  } else if (trimmed.startsWith('data:')) {
    throw new Error('Only PDF documents and PNG/JPG/WEBP/GIF images are allowed.');
  }

  const ext = MIME_TO_EXT[mimeType];
  if (!ext) {
    throw new Error('Only PDF documents and PNG/JPG/WEBP/GIF images are allowed.');
  }

  const buffer = Buffer.from(base64Payload, 'base64');
  const maxBytes = 10 * 1024 * 1024;
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error('Uploaded file must be a valid PDF or photo under 10 MB.');
  }

  const isPdf = mimeType === 'application/pdf';
  if (isPdf) {
    const headerSlice = buffer.subarray(0, 1024).toString('latin1');
    if (!headerSlice.includes('%PDF-')) {
      throw new Error('Invalid PDF file signature. Please upload a genuine PDF document.');
    }
  }

  const category: UploadDocumentCategory =
    params.category && CATEGORY_DEFAULT_SLUG[params.category] ? params.category : 'document';

  const filename = buildSemanticFileName({
    category: params.category,
    subject: params.subject,
    rawName: params.rawName,
    ext,
    isPdf,
  });

  return {
    buffer,
    base64Payload,
    mimeType,
    ext,
    filename,
    isPdf,
    category,
  };
}
