import fs from 'node:fs';
import path from 'node:path';
import type { FundConfig } from '../types/coop.ts';

export const DEFAULT_CONSTITUTION_PUBLIC_RELATIVE_PATH = path.join(
  'public',
  'assets',
  'aistudio',
  'cooperative-constitution-cooperative-charter-2027-2036-2026-11-16-30b5a0_98df82ac.pdf'
);

export const DEFAULT_CONSTITUTION_FILE_NAME =
  'cooperative-constitution-cooperative-charter-2027-2036.pdf';

export function normalizeExtractedPdfText(raw: string): string {
  return String(raw || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractPdfTextFromBuffer(
  buffer: Buffer
): Promise<{ text: string; totalPages: number }> {
  if (!buffer || buffer.length < 5) {
    throw new Error('PDF file payload is empty or invalid.');
  }

  const header = buffer.subarray(0, 16).toString('latin1');
  if (!header.includes('%PDF-')) {
    throw new Error('Uploaded document does not have a valid PDF header.');
  }

  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const result = await extractText(pdf, { mergePages: true });
    const rawText = Array.isArray(result.text)
      ? result.text.join('\n\n')
      : String(result.text || '');
    return {
      text: normalizeExtractedPdfText(rawText),
      totalPages: typeof result.totalPages === 'number' ? result.totalPages : 1,
    };
  } finally {
    const maybeProxy = pdf as unknown as { destroy?: () => Promise<void> | void };
    if (typeof maybeProxy.destroy === 'function') {
      await maybeProxy.destroy();
    }
  }
}

export function decodeBase64PdfPayload(rawData: string): Buffer {
  const trimmed = String(rawData || '').trim();
  if (!trimmed) {
    throw new Error('PDF payload is empty.');
  }
  const match = trimmed.match(/^data:application\/pdf(?:;[^;,]+)*;base64,(.+)$/i);
  const base64 = match ? match[1] : trimmed.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw new Error('Unable to decode base64 PDF file.');
  }
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error('PDF exceeds maximum 15 MB extraction limit.');
  }
  return buffer;
}

export async function resolveActiveConstitutionPdfBuffer(
  config: FundConfig,
  uploadsDir: string
): Promise<{ buffer: Buffer; sourceName: string }> {
  const pdfUrl = String(config?.constitutionPdfUrl || '').trim();
  const pdfName = String(config?.constitutionPdfName || '').trim();

  if (pdfUrl.startsWith('/api/uploads/')) {
    const fileName = path.basename(pdfUrl.slice('/api/uploads/'.length));
    const localPath = path.join(uploadsDir, fileName);
    if (fs.existsSync(localPath)) {
      return {
        buffer: fs.readFileSync(localPath),
        sourceName: pdfName || fileName,
      };
    }
  }

  if (/^https?:\/\//i.test(pdfUrl)) {
    const response = await fetch(pdfUrl, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch published Constitution PDF (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      sourceName: pdfName || 'published-constitution.pdf',
    };
  }

  const defaultPath = path.join(process.cwd(), DEFAULT_CONSTITUTION_PUBLIC_RELATIVE_PATH);
  if (fs.existsSync(defaultPath)) {
    return {
      buffer: fs.readFileSync(defaultPath),
      sourceName: pdfName || DEFAULT_CONSTITUTION_FILE_NAME,
    };
  }

  throw new Error('No Constitution PDF is currently available on the server.');
}
