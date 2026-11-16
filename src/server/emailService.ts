import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface EmailSendResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

export interface EmailAttachmentInput {
  filename: string;
  content: Buffer;
  contentType?: string;
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

function formatMoneyText(amount: number, currency: string): string {
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}

export async function sendEmail(options: {
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

export function buildTransactionSummaryEmailPayload(input: TransactionEmailSummaryInput): {
  subject: string;
  text: string;
  html: string;
} {
  const ts = input.timestampIso || new Date().toISOString();
  const amountFormatted = formatMoneyText(input.amount, input.currency);
  const subject = `[Amanah] ${input.eventTitle} — ${amountFormatted} (${input.referenceId})`;

  const detailLines = [
    `Transaction Type: ${input.transactionType}`,
    `Reference ID: ${input.referenceId}`,
    `Amount: ${amountFormatted}`,
    `Status: ${input.statusLabel}`,
    `Timestamp (UTC): ${ts}`,
    ...(input.details || []).map((d) => `${d.label}: ${d.value}`),
  ];

  const text = [
    `Assalamu Alaikum ${input.recipientName},`,
    '',
    `${input.eventTitle}`,
    input.summaryText,
    '',
    'Transaction Receipt Summary:',
    ...detailLines.map((l) => `- ${l}`),
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
    <div style="background:linear-gradient(135deg,#059669,#0f766e);padding:20px 24px;color:#ffffff;">
      <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.9;">${escapeHtml(input.fundName)}</div>
      <h2 style="margin:6px 0 0;font-size:18px;font-weight:700;">${escapeHtml(input.eventTitle)}</h2>
    </div>
    <div style="padding:22px 24px;color:#334155;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;">Assalamu Alaikum <strong>${escapeHtml(input.recipientName)}</strong>,</p>
      <p style="margin:0 0 18px;text-align:justify;">${escapeHtml(input.summaryText)}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;">
        ${rowsHtml}
      </table>
      <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
        This automated summary was generated by the Amanah Cooperative Treasury portal for your encrypted financial records.
      </p>
    </div>
  </div>`;

  return { subject, text, html };
}

export async function sendTransactionSummaryEmail(
  input: TransactionEmailSummaryInput
): Promise<EmailSendResult> {
  const payload = buildTransactionSummaryEmailPayload(input);
  return sendEmail({
    to: input.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}

export async function sendTempPasswordEmail(options: {
  to: string;
  memberName: string;
  memberCode: string;
  tempPassword: string;
  adminName: string;
  fundName: string;
}): Promise<EmailSendResult> {
  const subject = `[Amanah] Temporary Password Reset (${options.memberCode})`;
  const text = [
    `Assalamu Alaikum ${options.memberName},`,
    '',
    `An administrator (${options.adminName}) has reset your password for ${options.fundName}.`,
    '',
    `Member Code: ${options.memberCode}`,
    `Temporary Password: ${options.tempPassword}`,
    '',
    'Please sign in with this temporary password and immediately update your password inside My Profile -> Security & Password.',
  ].join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#059669,#065f46);padding:20px 24px;color:#ffffff;">
      <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.9;">${escapeHtml(options.fundName)}</div>
      <h2 style="margin:6px 0 0;font-size:18px;font-weight:700;">Temporary Password Issued</h2>
    </div>
    <div style="padding:22px 24px;color:#334155;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;">Assalamu Alaikum <strong>${escapeHtml(options.memberName)}</strong> (${escapeHtml(options.memberCode)}),</p>
      <p style="margin:0 0 16px;">Administrator <strong>${escapeHtml(options.adminName)}</strong> has processed your password reset request and generated a temporary credential for your account.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:11px;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</div>
        <div style="font-family:monospace;font-size:18px;font-weight:700;color:#064e3b;margin-top:4px;letter-spacing:0.05em;">${escapeHtml(options.tempPassword)}</div>
      </div>
      <p style="margin:0;font-size:13px;color:#475569;">Sign in at the member portal and change this temporary password immediately from <strong>My Profile → Password Settings</strong>.</p>
    </div>
  </div>`;

  return sendEmail({ to: options.to, subject, text, html });
}

export async function sendPasswordResetAdminAlertEmail(options: {
  adminEmails: string[];
  memberName: string;
  memberCode: string;
  memberEmail: string;
  reason?: string;
  fundName: string;
}): Promise<EmailSendResult> {
  if (options.adminEmails.length === 0) {
    return { sent: false, reason: 'NO_ADMIN_EMAILS' };
  }
  const subject = `[Amanah] Password Reset Request: ${options.memberName} (${options.memberCode})`;
  const text = [
    `Member ${options.memberName} (${options.memberCode}, ${options.memberEmail}) requested a password reset from the sign-in portal.`,
    options.reason ? `Reason provided: ${options.reason}` : '',
    'Open Dashboard -> Member Registry -> Password Reset Requests to generate and email a temporary password.',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0f766e;padding:18px 24px;color:#ffffff;">
      <div style="font-size:11px;opacity:0.9;">${escapeHtml(options.fundName)}</div>
      <h2 style="margin:4px 0 0;font-size:17px;">Password Reset Request Received</h2>
    </div>
    <div style="padding:20px 24px;color:#334155;font-size:14px;line-height:1.6;">
      <p><strong>${escapeHtml(options.memberName)}</strong> (${escapeHtml(options.memberCode)} · ${escapeHtml(options.memberEmail)}) submitted a forgotten-password reset request.</p>
      ${options.reason ? `<p style="background:#f8fafc;border-left:3px solid #0f766e;padding:10px 12px;font-size:13px;">Note: ${escapeHtml(options.reason)}</p>` : ''}
      <p style="font-size:13px;color:#475569;">Please verify their identity and click <strong>Reset & Email Temp Password</strong> inside Member Registry.</p>
    </div>
  </div>`;

  return sendEmail({ to: options.adminEmails, subject, text, html });
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
}): Promise<{
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  errors: string[];
}> {
  if (options.recipients.length === 0) {
    return { totalRecipients: 0, sentCount: 0, failedCount: 0, errors: [] };
  }

  const subject = `[Amanah] Monthly Fund Summary PDF — ${options.monthKey}`;
  const filename = `amanah-monthly-summary-${options.monthKey}.pdf`;

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const recipient of options.recipients) {
    const text = [
      `Assalamu Alaikum ${recipient.name},`,
      '',
      `Attached is the official Monthly Cooperative Treasury PDF Summary for ${options.monthKey}.`,
      '',
      `Key Treasury Figures (${options.currency}):`,
      `- Amanah Height (Total Raised): ${formatMoneyText(options.amanahHeight, options.currency)}`,
      `- Current Treasury Balance: ${formatMoneyText(options.currentBalance, options.currency)}`,
      `- Active Qard Hasan Principal: ${formatMoneyText(options.activeLoanTotal, options.currency)}`,
      `- Contributions Collected (${options.monthKey}): ${formatMoneyText(options.monthlyCollected, options.currency)}`,
      '',
      `${options.fundName}`,
    ].join('\n');

    const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#059669,#064e3b);padding:20px 24px;color:#ffffff;">
        <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.9;">${escapeHtml(options.fundName)}</div>
        <h2 style="margin:6px 0 0;font-size:18px;font-weight:700;">Monthly Fund Summary · ${escapeHtml(options.monthKey)}</h2>
      </div>
      <div style="padding:22px 24px;color:#334155;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 12px;">Assalamu Alaikum <strong>${escapeHtml(recipient.name)}</strong>,</p>
        <p style="margin:0 0 16px;">Please find attached the monthly audited PDF statement for <strong>${escapeHtml(options.monthKey)}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;background:#f8fafc;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">Amanah Height (Total Raised)</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-align:right;font-family:monospace;">${escapeHtml(formatMoneyText(options.amanahHeight, options.currency))}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">Current Available Balance</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-align:right;font-family:monospace;">${escapeHtml(formatMoneyText(options.currentBalance, options.currency))}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">Active Qard Hasan Total</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-align:right;font-family:monospace;">${escapeHtml(formatMoneyText(options.activeLoanTotal, options.currency))}</td></tr>
          <tr><td style="padding:8px 12px;font-size:12px;color:#475569;">Month Collected (${escapeHtml(options.monthKey)})</td><td style="padding:8px 12px;font-size:12px;font-weight:700;text-align:right;font-family:monospace;">${escapeHtml(formatMoneyText(options.monthlyCollected, options.currency))}</td></tr>
        </table>
      </div>
    </div>`;

    const res = await sendEmail({
      to: recipient.email,
      subject,
      text,
      html,
      attachments: [
        {
          filename,
          content: options.pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
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
