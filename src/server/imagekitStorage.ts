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

let warnedPartialImageKitConfig = false;

export function normalizeImageKitFolder(rawFolder?: string): string {
  const cleaned = String(rawFolder || '/amanah')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return cleaned ? `/${cleaned}` : '/amanah';
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
  config?: ImageKitConfig;
  fetchImpl?: typeof fetch;
}): Promise<ImageKitUploadResult> {
  const cfg = params.config || getImageKitConfig();
  if (!cfg) {
    throw new Error('IMAGEKIT_PRIVATE_KEY is not configured in the server environment.');
  }

  const form = new FormData();
  form.set('file', `data:${params.mimeType};base64,${params.base64Payload}`);
  form.set('fileName', params.fileName);
  form.set('folder', cfg.folder);
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
    filePath: payload.filePath || `${cfg.folder}/${params.fileName}`,
    url: payload.url,
    provider: 'imagekit',
    contentType: params.mimeType,
  };
}

export function validateAndDecodeUpload(params: {
  rawData: string;
  rawName?: string;
  fallbackMimeType?: string;
}): {
  buffer: Buffer;
  base64Payload: string;
  mimeType: string;
  ext: string;
  filename: string;
  isPdf: boolean;
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

  const safePrefix = String(params.rawName || (isPdf ? 'doc' : 'photo'))
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);

  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${safePrefix ? `${safePrefix}-` : ''}${uniquePart}.${ext}`;

  return {
    buffer,
    base64Payload,
    mimeType,
    ext,
    filename,
    isPdf,
  };
}
