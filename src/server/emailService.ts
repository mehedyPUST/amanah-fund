import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type {
  EmailQueueCategory,
  EmailQueueItem,
  EmailTemplateCollection,
  EmailTemplateKey,
} from '../types/coop.ts';
import {
  buildSampleTemplateVars,
  darkenHexColor,
  interpolateEmailTemplate,
  resolveEmailTemplate,
} from '../utils/emailTemplates.ts';

export interface EmailSendResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
  queuedId?: string;
}

export interface EmailAttachmentInput {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export type EmailFailureHandler = (
  payload: {
    to: string[];
    subject: string;
    text: string;
    html?: string;
    attachments?: EmailAttachmentInput[];
    category?: EmailQueueCategory;
  },
  reason: string
) => Promise<EmailQueueItem>;

let registeredFailureHandler: EmailFailureHandler | null = null;

export function registerEmailFailureHandler(handler: EmailFailureHandler): void {
  registeredFailureHandler = handler;
}

export interface TransactionEmailSummaryInput {
  to: string;
  recipientName: string;
  fundName: string;
  currency: string;
  eventTitle: string;
  transactionType: string;
  referenceId: string;
  amount: number;
  statusLabel: string;
  summaryText: string;
  details?: Array<{ label: string; value: string }>;
  timestampIso?: string;
  templateOverrides?: EmailTemplateCollection;
}

let cachedTransporter: Transporter | null = null;
let cachedConfigSignature = '';

export function normalizeSmtpPass(rawPass: string, host: string): string {
  const trimmed = rawPass.trim();
  if (!trimmed) return '';
  const isGmailHost = host.toLowerCase().includes('gmail');
  const isGroupedAppPass = /^[a-z0-9]{4}(?:\s+[a-z0-9]{4}){3}$/i.test(trimmed);
  if (isGmailHost || isGroupedAppPass) {
    return trimmed.replace(/\s+/g, '');
  }
  return trimmed;
}

function getSmtpConfig(env: NodeJS.ProcessEnv = process.env) {
  const host = env.SMTP_HOST?.trim() || '';
  const parsedPort = Number(env.SMTP_PORT?.trim() || 587);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;
  const secure = String(env.SMTP_SECURE || '').trim().toLowerCase() === 'true' || port === 465;
  const user = env.SMTP_USER?.trim() || '';
  const pass = normalizeSmtpPass(env.SMTP_PASS || '', host);
  const from = env.SMTP_FROM?.trim() || user || 'noreply@amanah-coop.local';

  return { host, port, secure, user, pass, from };
}

export function isSmtpConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = getSmtpConfig(env);
  return Boolean(cfg.host);
}

export function getSmtpStatusSummary(env: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  from: string | null;
} {
  const cfg = getSmtpConfig(env);
  return {
    configured: Boolean(cfg.host),
    host: cfg.host || null,
    port: cfg.port,
    secure: cfg.secure,
    from: cfg.host ? cfg.from : null,
  };
}

function getTransporter(): { transporter: Transporter; from: string } | null {
  const cfg = getSmtpConfig();
  if (!cfg.host) return null;

  const passHash = cfg.pass ? createHash('sha256').update(cfg.pass).digest('hex').slice(0, 12) : '0';
  const sig = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}:${passHash}:${cfg.from}`;
  if (!cachedTransporter || cachedConfigSignature !== sig) {
    cachedTransporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      requireTLS: !cfg.secure && cfg.port === 587,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      ...(cfg.user && cfg.pass
        ? {
            auth: {
              user: cfg.user,
              pass: cfg.pass,
            },
          }
        : {}),
    });
    cachedConfigSignature = sig;
  }

  return { transporter: cachedTransporter, from: cfg.from };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlWithBreaks(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

function formatMoneyText(amount: number, currency: string): string {
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}

export async function deliverEmailDirect(options: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachmentInput[];
}): Promise<EmailSendResult> {
  const recipients = (Array.isArray(options.to) ? options.to : [options.to])
    .map((e) => e.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return { sent: false, reason: 'NO_RECIPIENTS' };
  }

  const client = getTransporter();
  if (!client) {
    return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
  }

  try {
    const info = await client.transporter.sendMail({
      from: client.from,
      to: recipients.join(', '),
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || 'application/octet-stream',
      })),
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    cachedTransporter = null;
    cachedConfigSignature = '';
    const msg = err instanceof Error ? err.message : 'SMTP delivery failed';
    console.warn('[EmailService] Email dispatch error:', msg);
    return { sent: false, reason: msg };
  }
}

async function persistFailedDispatch(
  recipients: string[],
  options: {
    subject: string;
    text: string;
    html?: string;
    attachments?: EmailAttachmentInput[];
    category?: EmailQueueCategory;
  },
  reason: string
): Promise<string | undefined> {
  if (recipients.length === 0) return undefined;
  if (process.env.VITEST) return undefined;
  try {
    let handler = registeredFailureHandler;
    if (!handler) {
      await import('./emailQueueService.ts');
      handler = registeredFailureHandler;
    }
    if (!handler) return undefined;
    const queued = await handler(
      {
        to: recipients,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
        category: options.category || 'general',
      },
      reason
    );
    return queued.id;
  } catch (err) {
    console.warn('[EmailService] Failed to enqueue failed email for retry:', err);
    return undefined;
  }
}

export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachmentInput[];
  category?: EmailQueueCategory;
  skipQueue?: boolean;
}): Promise<EmailSendResult> {
  const recipients = (Array.isArray(options.to) ? options.to : [options.to])
    .map((e) => e.trim())
    .filter(Boolean);

  const res = await deliverEmailDirect(options);
  if (!res.sent && recipients.length > 0 && !options.skipQueue) {
    const queuedId = await persistFailedDispatch(
      recipients,
      options,
      res.reason || 'SMTP delivery failed'
    );
    if (queuedId) {
      return { ...res, queuedId };
    }
  }
  return res;
}

export function buildTransactionSummaryEmailPayload(
  input: TransactionEmailSummaryInput,
  templateOverrides?: EmailTemplateCollection
): {
  subject: string;
  text: string;
  html: string;
} {
  const ts = input.timestampIso || new Date().toISOString();
  const amountFormatted = formatMoneyText(input.amount, input.currency);
  const resolved = resolveEmailTemplate(
    'transactionSummary',
    templateOverrides || input.templateOverrides
  );
  const rendered = interpolateEmailTemplate(resolved, {
    recipientName: input.recipientName,
    fundName: input.fundName,
    eventTitle: input.eventTitle,
    transactionType: input.transactionType,
    referenceId: input.referenceId,
    amount: amountFormatted,
    statusLabel: input.statusLabel,
    summaryText: input.summaryText,
  });

  const subject =
    rendered.subject || `[Amanah] ${input.eventTitle} — ${amountFormatted} (${input.referenceId})`;
  const headerTop = rendered.headerColor;
  const headerBottom = darkenHexColor(headerTop);

  const detailLines = [
    `Transaction Type: ${input.transactionType}`,
    `Reference ID: ${input.referenceId}`,
    `Amount: ${amountFormatted}`,
    `Status: ${input.statusLabel}`,
    `Timestamp (UTC): ${ts}`,
    ...(input.details || []).map((d) => `${d.label}: ${d.value}`),
  ];

  const text = [
    rendered.greeting,
    '',
    `${input.eventTitle}`,
    rendered.introBody,
    '',
    'Transaction Receipt Summary:',
    ...detailLines.map((l) => `- ${l}`),
    ...(rendered.footerNote ? ['', rendered.footerNote] : []),
    '',
    `Cooperative Fund: ${input.fundName}`,
  ].join('\n');

  const rowsHtml = [
    { label: 'Transaction Type', value: input.transactionType },
    { label: 'Reference ID', value: input.referenceId },
    { label: 'Amount', value: amountFormatted },
    { label: 'Status', value: input.statusLabel },
    ...(input.details || []),
    { label: 'Timestamp (UTC)', value: ts },
  ]
    .map(
      (row) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;">${escapeHtml(row.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:12px;font-weight:600;text-align:right;font-family:monospace;">${escapeHtml(row.value)}</td>
      </tr>`
    )
    .join('');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,${headerTop},${headerBottom});padding:20px 24px;color:#ffffff;">
      <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.9;">${escapeHtml(input.fundName)}</div>
      <h2 style="margin:6px 0 0;font-size:18px;font-weight:700;">${escapeHtml(input.eventTitle)}</h2>
    </div>
    <div style="padding:22px 24px;color:#334155;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;font-weight:600;color:#0f172a;">${escapeHtmlWithBreaks(rendered.greeting)}</p>
      <p style="margin:0 0 18px;text-align:justify;">${escapeHtmlWithBreaks(rendered.introBody)}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;">
        ${rowsHtml}
      </table>
      ${
        rendered.footerNote
          ? `<p style="margin:18px 0 0;font-size:12px;color:#64748b;text-align:justify;">${escapeHtmlWithBreaks(rendered.footerNote)}</p>`
          : ''
      }
    </div>
  </div>`;

  return { subject, text, html };
}

export async function sendTransactionSummaryEmail(
  input: TransactionEmailSummaryInput,
  templateOverrides?: EmailTemplateCollection
): Promise<EmailSendResult> {
  const payload = buildTransactionSummaryEmailPayload(input, templateOverrides);
  return sendEmail({
    to: input.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    category: 'transaction',
  });
}

export function buildTempPasswordEmailPayload(options: {
  memberName: string;
  memberCode: string;
  tempPassword: string;
  adminName: string;
  fundName: string;
  templateOverrides?: EmailTemplateCollection;
}): { subject: string; text: string; html: string } {
  const resolved = resolveEmailTemplate('tempPassword', options.templateOverrides);
  const rendered = interpolateEmailTemplate(resolved, {
    memberName: options.memberName,
    memberCode: options.memberCode,
    tempPassword: options.tempPassword,
    adminName: options.adminName,
    fundName: options.fundName,
  });

  const subject = rendered.subject || `[Amanah] Temporary Password Reset (${options.memberCode})`;
  const headerTop = rendered.headerColor;
  const headerBottom = darkenHexColor(headerTop);

  const text = [
    rendered.greeting,
    '',
    rendered.introBody,
    '',
    `Member Code: ${options.memberCode}`,
    `Temporary Password: ${options.tempPassword}`,
    ...(rendered.footerNote ? ['', rendered.footerNote] : []),
  ].join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,${headerTop},${headerBottom});padding:20px 24px;color:#ffffff;">
      <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.9;">${escapeHtml(options.fundName)}</div>
      <h2 style="margin:6px 0 0;font-size:18px;font-weight:700;">Temporary Password Issued</h2>
    </div>
    <div style="padding:22px 24px;color:#334155;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;font-weight:600;color:#0f172a;">${escapeHtmlWithBreaks(rendered.greeting)}</p>
      <p style="margin:0 0 16px;text-align:justify;">${escapeHtmlWithBreaks(rendered.introBody)}</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:11px;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</div>
        <div style="font-family:monospace;font-size:18px;font-weight:700;color:#064e3b;margin-top:4px;letter-spacing:0.05em;">${escapeHtml(options.tempPassword)}</div>
      </div>
      ${
        rendered.footerNote
          ? `<p style="margin:0;font-size:13px;color:#475569;text-align:justify;">${escapeHtmlWithBreaks(rendered.footerNote)}</p>`
          : ''
      }
    </div>
  </div>`;

  return { subject, text, html };
}

export async function sendTempPasswordEmail(options: {
  to: string;
  memberName: string;
  memberCode: string;
  tempPassword: string;
  adminName: string;
  fundName: string;
  templateOverrides?: EmailTemplateCollection;
}): Promise<EmailSendResult> {
  const payload = buildTempPasswordEmailPayload(options);
  return sendEmail({ to: options.to, ...payload, category: 'password_reset' });
}

export function buildPasswordResetAdminAlertEmailPayload(options: {
  memberName: string;
  memberCode: string;
  memberEmail: string;
  reason?: string;
  fundName: string;
  templateOverrides?: EmailTemplateCollection;
}): { subject: string; text: string; html: string } {
  const resolved = resolveEmailTemplate('passwordResetAdminAlert', options.templateOverrides);
  const rendered = interpolateEmailTemplate(resolved, {
    memberName: options.memberName,
    memberCode: options.memberCode,
    memberEmail: options.memberEmail,
    reason: options.reason || '',
    fundName: options.fundName,
  });

  const subject =
    rendered.subject || `[Amanah] Password Reset Request: ${options.memberName} (${options.memberCode})`;
  const headerTop = rendered.headerColor;
  const headerBottom = darkenHexColor(headerTop);

  const text = [
    rendered.greeting,
    '',
    rendered.introBody,
    options.reason ? `Reason provided: ${options.reason}` : '',
    rendered.footerNote,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,${headerTop},${headerBottom});padding:18px 24px;color:#ffffff;">
      <div style="font-size:11px;opacity:0.9;">${escapeHtml(options.fundName)}</div>
      <h2 style="margin:4px 0 0;font-size:17px;">Password Reset Request Received</h2>
    </div>
    <div style="padding:20px 24px;color:#334155;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 10px;font-weight:600;color:#0f172a;">${escapeHtmlWithBreaks(rendered.greeting)}</p>
      <p style="margin:0 0 14px;text-align:justify;">${escapeHtmlWithBreaks(rendered.introBody)}</p>
      ${
        options.reason
          ? `<p style="background:#f8fafc;border-left:3px solid ${headerTop};padding:10px 12px;font-size:13px;margin:0 0 14px;">Note: ${escapeHtml(options.reason)}</p>`
          : ''
      }
      ${
        rendered.footerNote
          ? `<p style="margin:0;font-size:13px;color:#475569;text-align:justify;">${escapeHtmlWithBreaks(rendered.footerNote)}</p>`
          : ''
      }
    </div>
  </div>`;

  return { subject, text, html };
}

export async function sendPasswordResetAdminAlertEmail(options: {
  adminEmails: string[];
  memberName: string;
  memberCode: string;
  memberEmail: string;
  reason?: string;
  fundName: string;
  templateOverrides?: EmailTemplateCollection;
}): Promise<EmailSendResult> {
  if (options.adminEmails.length === 0) {
    return { sent: false, reason: 'NO_ADMIN_EMAILS' };
  }
  const payload = buildPasswordResetAdminAlertEmailPayload(options);
  return sendEmail({ to: options.adminEmails, ...payload, category: 'password_reset' });
}

export function buildMonthlyPdfSummaryEmailPayload(options: {
  recipientName: string;
  monthKey: string;
  fundName: string;
  currency: string;
  amanahHeight: number;
  currentBalance: number;
  monthlyCollected: number;
  activeLoanTotal: number;
  templateOverrides?: EmailTemplateCollection;
}): { subject: string; text: string; html: string } {
  const amanahHeightText = formatMoneyText(options.amanahHeight, options.currency);
  const currentBalanceText = formatMoneyText(options.currentBalance, options.currency);
  const activeLoanTotalText = formatMoneyText(options.activeLoanTotal, options.currency);
  const monthlyCollectedText = formatMoneyText(options.monthlyCollected, options.currency);

  const resolved = resolveEmailTemplate('monthlyPdfSummary', options.templateOverrides);
  const rendered = interpolateEmailTemplate(resolved, {
    recipientName: options.recipientName,
    monthKey: options.monthKey,
    fundName: options.fundName,
    currency: options.currency,
    amanahHeight: amanahHeightText,
    currentBalance: currentBalanceText,
    monthlyCollected: monthlyCollectedText,
    activeLoanTotal: activeLoanTotalText,
  });

  const subject = rendered.subject || `[Amanah] Monthly Fund Summary PDF — ${options.monthKey}`;
  const headerTop = rendered.headerColor;
  const headerBottom = darkenHexColor(headerTop);

  const text = [
    rendered.greeting,
    '',
    rendered.introBody,
    '',
    `Key Treasury Figures (${options.currency}):`,
    `- Amanah Height (Total Raised): ${amanahHeightText}`,
    `- Current Treasury Balance: ${currentBalanceText}`,
    `- Active Qard Hasan Principal: ${activeLoanTotalText}`,
    `- Contributions Collected (${options.monthKey}): ${monthlyCollectedText}`,
    ...(rendered.footerNote ? ['', rendered.footerNote] : []),
    '',
    `${options.fundName}`,
  ].join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,${headerTop},${headerBottom});padding:20px 24px;color:#ffffff;">
      <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.9;">${escapeHtml(options.fundName)}</div>
      <h2 style="margin:6px 0 0;font-size:18px;font-weight:700;">Monthly Fund Summary · ${escapeHtml(options.monthKey)}</h2>
    </div>
    <div style="padding:22px 24px;color:#334155;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;font-weight:600;color:#0f172a;">${escapeHtmlWithBreaks(rendered.greeting)}</p>
      <p style="margin:0 0 16px;text-align:justify;">${escapeHtmlWithBreaks(rendered.introBody)}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;background:#f8fafc;">
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">Amanah Height (Total Raised)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-align:right;font-family:monospace;">${escapeHtml(amanahHeightText)}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">Current Available Balance</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-align:right;font-family:monospace;">${escapeHtml(currentBalanceText)}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">Active Qard Hasan Total</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-align:right;font-family:monospace;">${escapeHtml(activeLoanTotalText)}</td></tr>
        <tr><td style="padding:8px 12px;font-size:12px;color:#475569;">Month Collected (${escapeHtml(options.monthKey)})</td><td style="padding:8px 12px;font-size:12px;font-weight:700;text-align:right;font-family:monospace;">${escapeHtml(monthlyCollectedText)}</td></tr>
      </table>
      ${
        rendered.footerNote
          ? `<p style="margin:16px 0 0;font-size:12px;color:#64748b;text-align:justify;">${escapeHtmlWithBreaks(rendered.footerNote)}</p>`
          : ''
      }
    </div>
  </div>`;

  return { subject, text, html };
}

export async function sendMonthlyPdfSummaryEmail(options: {
  recipients: Array<{ email: string; name: string }>;
  monthKey: string;
  fundName: string;
  currency: string;
  amanahHeight: number;
  currentBalance: number;
  monthlyCollected: number;
  activeLoanTotal: number;
  pdfBuffer: Buffer;
  templateOverrides?: EmailTemplateCollection;
}): Promise<{
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  errors: string[];
}> {
  if (options.recipients.length === 0) {
    return { totalRecipients: 0, sentCount: 0, failedCount: 0, errors: [] };
  }

  const filename = `amanah-monthly-summary-${options.monthKey}.pdf`;

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (let idx = 0; idx < options.recipients.length; idx += 1) {
    const recipient = options.recipients[idx];
    const payload = buildMonthlyPdfSummaryEmailPayload({
      recipientName: recipient.name,
      monthKey: options.monthKey,
      fundName: options.fundName,
      currency: options.currency,
      amanahHeight: options.amanahHeight,
      currentBalance: options.currentBalance,
      monthlyCollected: options.monthlyCollected,
      activeLoanTotal: options.activeLoanTotal,
      templateOverrides: options.templateOverrides,
    });

    const attachments: EmailAttachmentInput[] = [
      {
        filename,
        content: options.pdfBuffer,
        contentType: 'application/pdf',
      },
    ];

    const res = await sendEmail({
      to: recipient.email,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      attachments,
      category: 'monthly_pdf',
    });

    if (res.sent) {
      sentCount += 1;
    } else {
      failedCount += 1;
      if (res.reason && !errors.includes(res.reason)) {
        errors.push(res.reason);
      }
      const fatalSmtpError =
        res.reason === 'SMTP_NOT_CONFIGURED' ||
        /EAUTH|Invalid login|535|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ESOCKET/i.test(res.reason || '');
      if (fatalSmtpError) {
        // Persist any remaining recipients into the retry queue without hanging on broken SMTP
        for (let j = idx + 1; j < options.recipients.length; j += 1) {
          const remaining = options.recipients[j];
          const remainingPayload = buildMonthlyPdfSummaryEmailPayload({
            recipientName: remaining.name,
            monthKey: options.monthKey,
            fundName: options.fundName,
            currency: options.currency,
            amanahHeight: options.amanahHeight,
            currentBalance: options.currentBalance,
            monthlyCollected: options.monthlyCollected,
            activeLoanTotal: options.activeLoanTotal,
            templateOverrides: options.templateOverrides,
          });
          await persistFailedDispatch(
            [remaining.email.trim()].filter(Boolean),
            {
              subject: remainingPayload.subject,
              text: remainingPayload.text,
              html: remainingPayload.html,
              attachments,
              category: 'monthly_pdf',
            },
            res.reason || 'SMTP delivery failed'
          );
        }
        failedCount = options.recipients.length - sentCount;
        break;
      }
    }
  }

  return {
    totalRecipients: options.recipients.length,
    sentCount,
    failedCount,
    errors,
  };
}

export function buildRegistrationPendingAdminEmailPayload(options: {
  applicantName: string;
  applicantCode: string;
  applicantEmail: string;
  mobile: string;
  referenceMemberName: string;
  fundName: string;
  templateOverrides?: EmailTemplateCollection;
}): { subject: string; text: string; html: string } {
  const resolved = resolveEmailTemplate('registrationPendingAdmin', options.templateOverrides);
  const rendered = interpolateEmailTemplate(resolved, {
    applicantName: options.applicantName,
    applicantCode: options.applicantCode,
    applicantEmail: options.applicantEmail,
    mobile: options.mobile,
    referenceMemberName: options.referenceMemberName,
    fundName: options.fundName,
  });

  const subject =
    rendered.subject ||
    `[Amanah] New Member Signup Request: ${options.applicantName} (${options.applicantCode})`;
  const headerTop = rendered.headerColor;
  const headerBottom = darkenHexColor(headerTop);

  const text = [
    rendered.greeting,
    '',
    rendered.introBody,
    '',
    `Applicant: ${options.applicantName} (${options.applicantCode})`,
    `Email: ${options.applicantEmail}`,
    `Mobile: ${options.mobile}`,
    `Reference Member: ${options.referenceMemberName}`,
    ...(rendered.footerNote ? ['', rendered.footerNote] : []),
  ].join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,${headerTop},${headerBottom});padding:18px 24px;color:#ffffff;">
      <div style="font-size:11px;opacity:0.9;">${escapeHtml(options.fundName)}</div>
      <h2 style="margin:4px 0 0;font-size:17px;">New Registration Pending Approval</h2>
    </div>
    <div style="padding:20px 24px;color:#334155;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 10px;font-weight:600;color:#0f172a;">${escapeHtmlWithBreaks(rendered.greeting)}</p>
      <p style="margin:0 0 14px;text-align:justify;">${escapeHtmlWithBreaks(rendered.introBody)}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;background:#f8fafc;margin-bottom:14px;">
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">Email</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;text-align:right;">${escapeHtml(options.applicantEmail)}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">Mobile</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;text-align:right;font-family:monospace;">${escapeHtml(options.mobile)}</td></tr>
        <tr><td style="padding:8px 12px;font-size:12px;color:#475569;">Reference</td><td style="padding:8px 12px;font-size:12px;font-weight:600;text-align:right;">${escapeHtml(options.referenceMemberName)}</td></tr>
      </table>
      ${
        rendered.footerNote
          ? `<p style="margin:0;font-size:13px;color:#475569;text-align:justify;">${escapeHtmlWithBreaks(rendered.footerNote)}</p>`
          : ''
      }
    </div>
  </div>`;

  return { subject, text, html };
}

export async function sendRegistrationPendingAdminEmail(options: {
  adminEmails: string[];
  applicantName: string;
  applicantCode: string;
  applicantEmail: string;
  mobile: string;
  referenceMemberName: string;
  fundName: string;
  templateOverrides?: EmailTemplateCollection;
}): Promise<EmailSendResult> {
  if (options.adminEmails.length === 0) {
    return { sent: false, reason: 'NO_ADMIN_EMAILS' };
  }
  const payload = buildRegistrationPendingAdminEmailPayload(options);
  return sendEmail({ to: options.adminEmails, ...payload, category: 'registration' });
}

export function buildRegistrationApprovedEmailPayload(options: {
  memberName: string;
  memberCode: string;
  adminName: string;
  fundName: string;
  templateOverrides?: EmailTemplateCollection;
}): { subject: string; text: string; html: string } {
  const resolved = resolveEmailTemplate('registrationApproved', options.templateOverrides);
  const rendered = interpolateEmailTemplate(resolved, {
    memberName: options.memberName,
    memberCode: options.memberCode,
    adminName: options.adminName,
    fundName: options.fundName,
  });

  const subject = rendered.subject || `[Amanah] Membership Approved — Welcome (${options.memberCode})`;
  const headerTop = rendered.headerColor;
  const headerBottom = darkenHexColor(headerTop);

  const text = [
    rendered.greeting,
    '',
    rendered.introBody,
    `Member Code: ${options.memberCode}`,
    ...(rendered.footerNote ? ['', rendered.footerNote] : []),
  ].join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,${headerTop},${headerBottom});padding:20px 24px;color:#ffffff;">
      <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.9;">${escapeHtml(options.fundName)}</div>
      <h2 style="margin:6px 0 0;font-size:18px;font-weight:700;">Membership Approved — Welcome</h2>
    </div>
    <div style="padding:22px 24px;color:#334155;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;font-weight:600;color:#0f172a;">${escapeHtmlWithBreaks(rendered.greeting)}</p>
      <p style="margin:0 0 14px;text-align:justify;">${escapeHtmlWithBreaks(rendered.introBody)}</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
        <div style="font-size:11px;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Assigned Member Code</div>
        <div style="font-family:monospace;font-size:18px;font-weight:700;color:#064e3b;margin-top:4px;">${escapeHtml(options.memberCode)}</div>
      </div>
      ${
        rendered.footerNote
          ? `<p style="margin:0;font-size:13px;color:#475569;text-align:justify;">${escapeHtmlWithBreaks(rendered.footerNote)}</p>`
          : ''
      }
    </div>
  </div>`;

  return { subject, text, html };
}

export async function sendRegistrationApprovedEmail(options: {
  to: string;
  memberName: string;
  memberCode: string;
  adminName: string;
  fundName: string;
  templateOverrides?: EmailTemplateCollection;
}): Promise<EmailSendResult> {
  const payload = buildRegistrationApprovedEmailPayload(options);
  return sendEmail({ to: options.to, ...payload, category: 'registration' });
}

export function buildEmailTemplatePreview(options: {
  key: EmailTemplateKey;
  templateOverrides?: EmailTemplateCollection;
  fundName?: string;
  currency?: string;
}): { subject: string; text: string; html: string } {
  const fundName = options.fundName?.trim() || 'Amanah Cooperative Treasury';
  const currency = options.currency?.trim() || 'BDT';
  const sample = buildSampleTemplateVars(options.key, fundName, currency);

  switch (options.key) {
    case 'transactionSummary':
      return buildTransactionSummaryEmailPayload(
        {
          to: 'preview@amanahcoop.org',
          recipientName: sample.recipientName,
          fundName,
          currency,
          eventTitle: sample.eventTitle,
          transactionType: sample.transactionType,
          referenceId: sample.referenceId,
          amount: 5000,
          statusLabel: sample.statusLabel,
          summaryText: sample.summaryText,
          details: [{ label: 'Billing Month', value: '2026-11' }],
          timestampIso: new Date().toISOString(),
        },
        options.templateOverrides
      );
    case 'registrationApproved':
      return buildRegistrationApprovedEmailPayload({
        memberName: sample.memberName,
        memberCode: sample.memberCode,
        adminName: sample.adminName,
        fundName,
        templateOverrides: options.templateOverrides,
      });
    case 'registrationPendingAdmin':
      return buildRegistrationPendingAdminEmailPayload({
        applicantName: sample.applicantName,
        applicantCode: sample.applicantCode,
        applicantEmail: sample.applicantEmail,
        mobile: sample.mobile,
        referenceMemberName: sample.referenceMemberName,
        fundName,
        templateOverrides: options.templateOverrides,
      });
    case 'tempPassword':
      return buildTempPasswordEmailPayload({
        memberName: sample.memberName,
        memberCode: sample.memberCode,
        tempPassword: sample.tempPassword,
        adminName: sample.adminName,
        fundName,
        templateOverrides: options.templateOverrides,
      });
    case 'passwordResetAdminAlert':
      return buildPasswordResetAdminAlertEmailPayload({
        memberName: sample.memberName,
        memberCode: sample.memberCode,
        memberEmail: sample.memberEmail,
        reason: sample.reason,
        fundName,
        templateOverrides: options.templateOverrides,
      });
    case 'monthlyPdfSummary':
      return buildMonthlyPdfSummaryEmailPayload({
        recipientName: sample.recipientName,
        monthKey: sample.monthKey,
        fundName,
        currency,
        amanahHeight: 485000,
        currentBalance: 390000,
        monthlyCollected: 65000,
        activeLoanTotal: 95000,
        templateOverrides: options.templateOverrides,
      });
  }
}
