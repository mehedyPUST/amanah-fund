import type {
  AiRewriteContext,
  AiRewriteResult,
  AiRewriteTone,
  AiSpamCheckResult,
  CharterTargetLanguage,
  CommunityPostLink,
} from '../types/coop.ts';

const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export function getGroqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() || '';
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

export function isGroqConfigured(): boolean {
  return getGroqApiKey().length > 0;
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function extractJsonObjectFromText<T>(raw: string): T {
  const clean = stripJsonCodeFences(raw);
  try {
    return JSON.parse(clean) as T;
  } catch {
    const startIdx = clean.indexOf('{');
    const endIdx = clean.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      const candidate = clean.slice(startIdx, endIdx + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // Fallback: sanitize literal control newlines inside quoted strings if present
        const sanitized = candidate.replace(/[\u0000-\u0019]+/g, ' ');
        return JSON.parse(sanitized) as T;
      }
    }
    throw new Error('Groq API returned invalid JSON output.');
  }
}

function extractMessageContentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text || '');
        }
        return '';
      })
      .join('');
  }
  return '';
}

function stripThinkTags(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}

function applyReasoningModelDefaults(body: Record<string, unknown>, model: string): void {
  const maxTokens = Number(body.max_tokens || 2400);
  if (/^openai\/gpt-oss/i.test(model)) {
    body.reasoning_effort = 'low';
    body.max_tokens = Math.max(maxTokens, 4096);
  } else if (/qwen3/i.test(model)) {
    body.reasoning_effort = 'none';
    body.max_tokens = Math.max(maxTokens, 3200);
  } else if (/deepseek-r1/i.test(model)) {
    body.reasoning_format = 'hidden';
    body.max_tokens = Math.max(maxTokens, 4096);
  }
}

class GroqHttpError extends Error {
  status: number;
  code?: string;
  failedGeneration?: string;

  constructor(message: string, status: number, code?: string, failedGeneration?: string) {
    super(message);
    this.name = 'GroqHttpError';
    this.status = status;
    this.code = code;
    this.failedGeneration = failedGeneration;
  }
}

interface GroqChatChoice {
  finish_reason?: string | null;
  message?: {
    content?: unknown;
    reasoning?: string;
    reasoning_content?: string;
  };
}

async function executeGroqChatOnce(params: {
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  includeReasoningHints?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{
  content: string;
  reasoningFallback: string;
  finishReason: string;
  model: string;
}> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in the server environment.');
  }

  const fetchFn = params.fetchImpl || fetch;
  const model = getGroqModel();
  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.35,
    max_tokens: params.maxTokens ?? 2400,
  };

  if (params.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  if (params.includeReasoningHints !== false) {
    applyReasoningModelDefaults(body, model);
  }

  const response = await fetchFn(GROQ_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(35000),
  });

  if (!response.ok) {
    let errorMessage = `Groq API request failed (${response.status}).`;
    let errorCode: string | undefined;
    let failedGeneration: string | undefined;
    try {
      const errJson = (await response.json()) as {
        error?: { message?: string; code?: string; failed_generation?: string };
      };
      if (errJson?.error?.message) {
        errorMessage = `Groq API error (${response.status}): ${errJson.error.message}`;
      }
      errorCode = errJson?.error?.code;
      failedGeneration = errJson?.error?.failed_generation;
    } catch {
      // Ignore parse failures on upstream error bodies
    }
    throw new GroqHttpError(errorMessage, response.status, errorCode, failedGeneration);
  }

  const data = (await response.json()) as {
    model?: string;
    choices?: GroqChatChoice[];
  };

  const choice = data?.choices?.[0];
  const rawContent = extractMessageContentText(choice?.message?.content);
  const cleanedContent = stripThinkTags(rawContent);
  const reasoningFallback = String(
    choice?.message?.reasoning_content || choice?.message?.reasoning || ''
  ).trim();

  return {
    content: cleanedContent,
    reasoningFallback,
    finishReason: String(choice?.finish_reason || '').trim(),
    model: data?.model || model,
  };
}

function extractRecoverableReasoningText(reasoning: string): string {
  if (!reasoning) return '';
  if (reasoning.includes('===TRANSLATION===')) {
    return reasoning;
  }
  const startIdx = reasoning.indexOf('{');
  const endIdx = reasoning.lastIndexOf('}');
  if (startIdx !== -1 && endIdx > startIdx) {
    return reasoning.slice(startIdx, endIdx + 1).trim();
  }
  return '';
}

async function callGroqChat(params: {
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ content: string; model: string }> {
  let firstAttempt;
  let supportsReasoningHints = true;
  try {
    firstAttempt = await executeGroqChatOnce({
      ...params,
      includeReasoningHints: true,
    });
  } catch (err) {
    const isUnsupportedReasoningHint =
      err instanceof GroqHttpError &&
      err.status === 400 &&
      /reasoning_effort|reasoning_format/i.test(err.message);
    if (!isUnsupportedReasoningHint) {
      throw err;
    }
    supportsReasoningHints = false;
    firstAttempt = await executeGroqChatOnce({
      ...params,
      includeReasoningHints: false,
    });
  }

  if (firstAttempt.content) {
    return {
      content: firstAttempt.content,
      model: firstAttempt.model,
    };
  }

  const recoveredFromFirst = extractRecoverableReasoningText(firstAttempt.reasoningFallback);
  if (recoveredFromFirst) {
    return {
      content: recoveredFromFirst,
      model: firstAttempt.model,
    };
  }

  // Automatic single retry when Groq returns HTTP 200 with an empty completion
  // (e.g. reasoning-token exhaustion, strict json_object stall, or transient upstream blank reply).
  const retryMaxTokens = Math.min(8192, Math.max(params.maxTokens ?? 2400, 4096));
  const retryTemp = Math.max(params.temperature ?? 0.35, 0.25);

  const retryAttempt = await executeGroqChatOnce({
    messages: params.messages,
    temperature: retryTemp,
    maxTokens: retryMaxTokens,
    jsonMode: false,
    includeReasoningHints: supportsReasoningHints,
    fetchImpl: params.fetchImpl,
  });

  if (retryAttempt.content) {
    return {
      content: retryAttempt.content,
      model: retryAttempt.model,
    };
  }

  const recoveredFromRetry = extractRecoverableReasoningText(retryAttempt.reasoningFallback);
  if (recoveredFromRetry) {
    return {
      content: recoveredFromRetry,
      model: retryAttempt.model,
    };
  }

  const reasonTag = retryAttempt.finishReason || firstAttempt.finishReason || 'empty';
  throw new Error(
    `Groq API returned an empty completion (model: ${retryAttempt.model}, finish_reason: ${reasonTag}). Please retry or verify GROQ_MODEL.`
  );
}

export async function callGroqJson<T>(params: {
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ parsed: T; model: string }> {
  try {
    const result = await callGroqChat({
      ...params,
      jsonMode: true,
    });
    return {
      parsed: extractJsonObjectFromText<T>(result.content),
      model: result.model,
    };
  } catch (err) {
    const isJsonValidationError =
      err instanceof GroqHttpError &&
      err.status === 400 &&
      (err.code === 'json_validate_failed' || /validate json/i.test(err.message));

    const isRecoverableOutputFailure =
      isJsonValidationError ||
      (err instanceof Error &&
        !(err instanceof GroqHttpError) &&
        (/empty completion/i.test(err.message) || /invalid JSON output/i.test(err.message)));

    if (!isRecoverableOutputFailure) {
      throw err;
    }

    // Attempt to recover if Groq returned a nearly-valid JSON snippet in failed_generation
    if (err instanceof GroqHttpError && err.failedGeneration) {
      try {
        return {
          parsed: extractJsonObjectFromText<T>(err.failedGeneration),
          model: getGroqModel(),
        };
      } catch {
        // Fall through to non-strict JSON-mode retry
      }
    }

    // Retry cleanly without response_format=json_object so Groq's strict validator does not abort
    const fallbackMessages: GroqMessage[] = [
      ...params.messages,
      {
        role: 'system',
        content:
          'Output ONLY a single valid JSON object starting with { and ending with }. Escape any quotes or newlines inside JSON strings properly. Do not include markdown fences or extra commentary.',
      },
    ];

    const retryResult = await callGroqChat({
      messages: fallbackMessages,
      temperature: Math.max(params.temperature ?? 0.35, 0.25),
      maxTokens: Math.max(params.maxTokens ?? 2400, 3200),
      jsonMode: false,
      fetchImpl: params.fetchImpl,
    });

    return {
      parsed: extractJsonObjectFromText<T>(retryResult.content),
      model: retryResult.model,
    };
  }
}

const CONTEXT_GUIDANCE: Record<AiRewriteContext, string> = {
  community_post:
    'a verified member post in an Islamic cooperative treasury Community Hub. Preserve @mentions exactly (e.g. @Name), preserve member codes, and keep a respectful brotherly/sisterly cooperative tone.',
  meeting_schedule:
    'an official cooperative meeting title and agenda scheduled by a Fund Manager for all cooperative members. Make the title clear and format the agenda as crisp, actionable points.',
  notice:
    'an official Cooperative Notice Board announcement published by governance leadership. Ensure clarity, trustworthiness, and clear dates/obligations.',
  loan_purpose:
    'a Qard Hasan (interest-free cooperative loan) application purpose and supporting review note. Keep it dignified, transparent, factual, and respectful for peer review and 2/3 member voting without inventing financial claims.',
  poll:
    'a cooperative Decision Opinion Poll title and background description so voting members clearly understand the choice, charter impact, and decision scope.',
  investment_thesis:
    'a post-maturity Shariah-compliant Halal project investment mandate statement for a cooperative fund charter.',
  faq:
    'a cooperative Knowledge Base FAQ question and charter-aligned answer that is clear, concise, and helpful for members.',
  general:
    'a cooperative member communication within Amanah Co-op Treasury. Keep it clear, respectful, and accurate.',
};

const TONE_GUIDANCE: Record<AiRewriteTone, string> = {
  clear: 'Improve grammar, readability, and structure while keeping the original intent and warmth.',
  concise: 'Tighten wording so it is brief, scannable, and direct without losing key facts or dates.',
  formal: 'Use polished, official cooperative governance phrasing suitable for formal announcements or records.',
};

export async function rewriteCooperativeText(params: {
  text: string;
  title?: string;
  context: AiRewriteContext;
  tone?: AiRewriteTone;
}): Promise<AiRewriteResult> {
  const cleanText = String(params.text || '').trim();
  const cleanTitle = params.title !== undefined ? String(params.title).trim() : undefined;

  if (!cleanText && !cleanTitle) {
    throw new Error('Provide text or a title to rewrite.');
  }

  const tone: AiRewriteTone =
    params.tone === 'concise' || params.tone === 'formal' ? params.tone : 'clear';

  const { parsed, model } = await callGroqJson<{
    rewrittenTitle?: string;
    rewrittenText?: string;
    improvements?: string[];
  }>({
    temperature: 0.35,
    maxTokens: 2400,
    messages: [
      {
        role: 'system',
        content:
          `You are an editorial writing assistant for Amanah Co-op Treasury (an encrypted Islamic cooperative savings, Qard Hasan interest-free loan, and Halal investment fund). ` +
          `You are rewriting ${CONTEXT_GUIDANCE[params.context] || CONTEXT_GUIDANCE.general} ` +
          `${TONE_GUIDANCE[tone]} ` +
          `CRITICAL RULES:\n` +
          `1. Keep the SAME language as the user's input (if Bengali/বাংলা, rewrite in natural Bangla; if English, rewrite in natural English; if mixed, preserve key Bengali terms naturally).\n` +
          `2. Never invent numbers, dates, amounts, interest/riba terms, or fake facts.\n` +
          `3. Preserve any @Name mentions, URLs, member codes (e.g. AMN-001), and emojis naturally.\n` +
          `4. Return a single JSON object with keys: "rewrittenTitle" (string, include if title was provided), "rewrittenText" (string with escaped \\n for line breaks), and "improvements" (array of 1-3 short strings).`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          context: params.context,
          tone,
          title: cleanTitle ?? null,
          text: cleanText,
        }),
      },
    ],
  });

  const rewrittenText = String(parsed.rewrittenText || cleanText).trim();
  const rewrittenTitle =
    cleanTitle !== undefined ? String(parsed.rewrittenTitle || cleanTitle).trim() : undefined;
  const improvements = Array.isArray(parsed.improvements)
    ? parsed.improvements
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 3)
    : ['Clarity and grammar refined'];

  return {
    ...(rewrittenTitle !== undefined ? { rewrittenTitle } : {}),
    rewrittenText: rewrittenText || cleanText,
    improvements,
    model,
  };
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

const SUSPICIOUS_SHORTENER_HOSTS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'cutt.ly',
  'rb.gy',
  'is.gd',
  'v.gd',
  'tiny.cc',
  'ow.ly',
  'shorturl.at',
  'rebrand.ly',
  'lnkd.in',
]);

const HIGH_RISK_DOMAIN_PATTERNS = [
  /(?:^|\.)(?:1xbet|bet365|melbet|mostbet|parimatch|stake|bc\.game|casino|slot|poker)\./i,
  /(?:^|\.)(?:airdrop|claim-bonus|free-usdt|crypto-signal|forex-vip|binaryoption)\./i,
  /(?:^|\.)(?:ngrok|serveo|trycloudflare)\.(?:io|net|com|app)$/i,
  /(?:telegram\.me|t\.me)\/(?:joinchat|\+|.*(?:crypto|signal|bet|casino|pump|earn))/i,
];

const SCAM_PHRASE_PATTERNS: Array<{ pattern: RegExp; label: string; severity: 'spam' | 'caution' }> = [
  {
    pattern: /\b(100%\s*guaranteed\s*profit|double\s+your\s+money|guaranteed\s+daily\s+return|free\s+usdt|claim\s+airdrop)\b/i,
    label: 'High-risk financial scam or guaranteed-profit claim',
    severity: 'spam',
  },
  {
    pattern: /\b(1xbet|melbet|mostbet|online\s*casino|sports\s*betting|gambling\s*bonus|aviator\s*hack)\b/i,
    label: 'Gambling or betting promotion',
    severity: 'spam',
  },
  {
    pattern: /\b(verify\s+your\s+wallet|seed\s+phrase|recovery\s+phrase|connect\s+wallet\s+to\s+claim|urgent\s+kyc\s+update)\b/i,
    label: 'Credential or wallet phishing phrase',
    severity: 'spam',
  },
  {
    pattern: /\b(dm\s+me\s+on\s+whatsapp|inbox\s+for\s+forex|vip\s+trading\s+signals|click\s+fast\s+limited\s+offer)\b/i,
    label: 'Unsolicited promotional solicitation',
    severity: 'caution',
  },
];

export function extractUrlsFromPost(params: {
  title: string;
  content: string;
  links?: CommunityPostLink[];
}): string[] {
  const found = new Set<string>();
  const combinedText = `${params.title || ''}\n${params.content || ''}`;
  const inlineMatches = combinedText.match(URL_REGEX) || [];
  for (const raw of inlineMatches) {
    found.add(raw.replace(/[),.;!?]+$/, ''));
  }
  for (const link of params.links || []) {
    if (link?.url) found.add(link.url.trim());
  }
  return Array.from(found);
}

export function analyzeCommunityPostSpamHeuristic(params: {
  title: string;
  content: string;
  links?: CommunityPostLink[];
}): AiSpamCheckResult {
  const title = String(params.title || '').trim();
  const content = String(params.content || '').trim();
  const urls = extractUrlsFromPost(params);
  const flaggedLinks: string[] = [];
  const signals: string[] = [];
  let hasSpam = false;
  let hasCaution = false;

  const combined = `${title}\n${content}`;

  if (/(?:javascript:|data:text\/html|vbscript:)/i.test(combined)) {
    hasSpam = true;
    signals.push('Executable script URI detected in post body');
  }

  for (const rawUrl of urls) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();

      if (parsed.username || parsed.password) {
        hasSpam = true;
        flaggedLinks.push(rawUrl);
        signals.push(`URL uses embedded credentials/phishing '@' syntax (${host})`);
        continue;
      }

      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) {
        hasSpam = true;
        flaggedLinks.push(rawUrl);
        signals.push(`Direct IP-address URL is suspicious (${host})`);
        continue;
      }

      if (host.includes('xn--')) {
        hasCaution = true;
        flaggedLinks.push(rawUrl);
        signals.push(`IDN/punycode lookalike domain detected (${host})`);
      }

      if (HIGH_RISK_DOMAIN_PATTERNS.some((rx) => rx.test(rawUrl) || rx.test(host))) {
        hasSpam = true;
        flaggedLinks.push(rawUrl);
        signals.push(`High-risk scam, gambling, or phishing URL (${host})`);
        continue;
      }

      if (SUSPICIOUS_SHORTENER_HOSTS.has(host)) {
        hasCaution = true;
        flaggedLinks.push(rawUrl);
        signals.push(`Masked URL shortener (${host}) hides destination`);
      }

      if (parsed.protocol === 'http:') {
        hasCaution = true;
        signals.push(`Unencrypted HTTP link (${host}) — prefer HTTPS`);
      }
    } catch {
      hasCaution = true;
      flaggedLinks.push(rawUrl);
      signals.push(`Malformed URL detected: ${rawUrl}`);
    }
  }

  for (const rule of SCAM_PHRASE_PATTERNS) {
    if (rule.pattern.test(combined)) {
      if (rule.severity === 'spam') {
        hasSpam = true;
      } else {
        hasCaution = true;
      }
      signals.push(rule.label);
    }
  }

  if (urls.length >= 6) {
    hasCaution = true;
    signals.push(`High link density (${urls.length} external links in one post)`);
  }

  if (hasCaution && flaggedLinks.length > 0 && SCAM_PHRASE_PATTERNS.some((r) => r.pattern.test(combined))) {
    hasSpam = true;
  }

  const riskLevel: AiSpamCheckResult['riskLevel'] = hasSpam
    ? 'spam'
    : hasCaution
      ? 'caution'
      : 'safe';

  const reason =
    riskLevel === 'spam'
      ? signals[0] || 'Detected high-risk spam, scam, or phishing link.'
      : riskLevel === 'caution'
        ? signals[0] || 'Contains link(s) that merit verification.'
        : 'No spam, phishing, or suspicious links detected.';

  return {
    isSpam: riskLevel === 'spam',
    riskLevel,
    reason,
    flaggedLinks: Array.from(new Set(flaggedLinks)),
    signals: Array.from(new Set(signals)),
    checkedWith: 'heuristic',
  };
}

export async function checkCommunityPostSpam(params: {
  title: string;
  content: string;
  links?: CommunityPostLink[];
  strictAiRequired?: boolean;
}): Promise<AiSpamCheckResult> {
  const heuristic = analyzeCommunityPostSpamHeuristic(params);

  if (heuristic.isSpam) {
    return heuristic;
  }

  if (!isGroqConfigured()) {
    if (params.strictAiRequired) {
      return {
        ...heuristic,
        signals: [
          ...heuristic.signals,
          'Heuristic link scan completed (GROQ_API_KEY not configured for deep semantic check).',
        ],
      };
    }
    return heuristic;
  }

  const urls = extractUrlsFromPost(params);
  try {
    const { parsed, model } = await callGroqJson<{
      isSpam?: boolean;
      riskLevel?: 'safe' | 'caution' | 'spam';
      reason?: string;
      flaggedLinks?: string[];
      signals?: string[];
    }>({
      temperature: 0.1,
      maxTokens: 700,
      messages: [
        {
          role: 'system',
          content:
            `You are a cooperative community trust & safety moderator for Amanah Co-op Treasury. ` +
            `Evaluate the post title, body, and all attached/inline links for: phishing URLs, credential theft, crypto/forex/gambling scams, unsolicited commercial spam, malware links, or abusive mass solicitation. ` +
            `IMPORTANT CALIBRATION:\n` +
            `- Genuine member posts about cooperative savings, Qard Hasan loans, Halal business projects, community photos/videos (YouTube, Google Drive, Unsplash, Pexels, Imgur, news, GitHub), or personal milestones MUST be marked "safe".\n` +
            `- Reserve "spam" (isSpam: true) strictly for clear spam, scams, phishing, gambling/riba-loan spam, or malicious links.\n` +
            `- Use "caution" (isSpam: false) for minor concerns like shortened links without context.\n` +
            `Respond with JSON matching: { "isSpam": boolean, "riskLevel": "safe" | "caution" | "spam", "reason": string, "flaggedLinks": string[], "signals": string[] }.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: params.title,
            content: params.content,
            attachedLinks: params.links || [],
            allUrlsFound: urls,
            heuristicNotes: heuristic.signals,
          }),
        },
      ],
    });

    const aiRisk: AiSpamCheckResult['riskLevel'] =
      parsed.riskLevel === 'spam' || parsed.riskLevel === 'caution' || parsed.riskLevel === 'safe'
        ? parsed.riskLevel
        : parsed.isSpam
          ? 'spam'
          : 'safe';

    const mergedRisk: AiSpamCheckResult['riskLevel'] =
      aiRisk === 'spam'
        ? 'spam'
        : aiRisk === 'caution' || heuristic.riskLevel === 'caution'
          ? 'caution'
          : 'safe';

    const flaggedLinks = Array.from(
      new Set([
        ...heuristic.flaggedLinks,
        ...(Array.isArray(parsed.flaggedLinks)
          ? parsed.flaggedLinks.map((l) => String(l || '').trim()).filter(Boolean)
          : []),
      ])
    );

    const signals = Array.from(
      new Set([
        ...heuristic.signals,
        ...(Array.isArray(parsed.signals)
          ? parsed.signals.map((s) => String(s || '').trim()).filter(Boolean)
          : []),
      ])
    );

    return {
      isSpam: mergedRisk === 'spam',
      riskLevel: mergedRisk,
      reason:
        String(parsed.reason || '').trim() ||
        heuristic.reason ||
        'Verified safe by Groq AI community moderation.',
      flaggedLinks,
      signals,
      checkedWith: 'groq',
      model,
    };
  } catch (err) {
    if (params.strictAiRequired) {
      throw err;
    }
    return heuristic;
  }
}

const LANGUAGE_LABELS: Record<CharterTargetLanguage, string> = {
  en: 'English',
  bn: 'Bengali (বাংলা)',
  ar: 'Arabic (العربية)',
};

function splitSegmentOnBoundary(segment: string, maxLen: number): string[] {
  const result: string[] = [];
  let cursor = 0;
  while (cursor < segment.length) {
    if (cursor + maxLen >= segment.length) {
      result.push(segment.slice(cursor).trim());
      break;
    }
    const slice = segment.slice(cursor, cursor + maxLen);
    const boundaryIdx = Math.max(
      slice.lastIndexOf('\n'),
      slice.lastIndexOf('। '),
      slice.lastIndexOf('. '),
      slice.lastIndexOf(' ')
    );
    const splitAt = boundaryIdx > Math.floor(maxLen * 0.5) ? boundaryIdx + 1 : maxLen;
    result.push(segment.slice(cursor, cursor + splitAt).trim());
    cursor += splitAt;
  }
  return result.filter(Boolean);
}

export function splitTextIntoChunks(text: string, maxChunkChars = 4200): string[] {
  const clean = text.trim();
  if (clean.length <= maxChunkChars) return [clean];

  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxChunkChars && current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
    if (para.length > maxChunkChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      chunks.push(...splitSegmentOnBoundary(para, maxChunkChars));
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export function parseSectionedTranslationResponse(raw: string): {
  translatedText: string;
  summaryBullets: string[];
} {
  const trimmed = raw.trim();
  const translationMarker = '===TRANSLATION===';
  const highlightsMarker = '===HIGHLIGHTS===';

  const tIdx = trimmed.indexOf(translationMarker);
  const hIdx = trimmed.indexOf(highlightsMarker);

  if (tIdx !== -1 || hIdx !== -1) {
    let translatedText = '';
    let highlightsBlock = '';

    if (tIdx !== -1 && hIdx !== -1) {
      if (tIdx < hIdx) {
        translatedText = trimmed.slice(tIdx + translationMarker.length, hIdx).trim();
        highlightsBlock = trimmed.slice(hIdx + highlightsMarker.length).trim();
      } else {
        highlightsBlock = trimmed.slice(hIdx + highlightsMarker.length, tIdx).trim();
        translatedText = trimmed.slice(tIdx + translationMarker.length).trim();
      }
    } else if (tIdx !== -1) {
      translatedText = trimmed.slice(tIdx + translationMarker.length).trim();
    } else {
      translatedText = trimmed.slice(0, hIdx).trim();
      highlightsBlock = trimmed.slice(hIdx + highlightsMarker.length).trim();
    }

    const summaryBullets = highlightsBlock
      .split('\n')
      .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 6);

    return {
      translatedText: translatedText || trimmed,
      summaryBullets,
    };
  }

  return {
    translatedText: trimmed,
    summaryBullets: [],
  };
}

export async function translateAndRefineCharterText(params: {
  extractedText: string;
  targetLanguage: CharterTargetLanguage;
  sourceName: string;
}): Promise<{
  translatedText: string;
  summaryBullets: string[];
  model: string;
  truncationNotice?: string;
}> {
  const cleanText = String(params.extractedText || '').trim();
  if (!cleanText) {
    throw new Error('No readable text could be extracted from this PDF document.');
  }

  const maxTotalChars = 36000;
  const truncated = cleanText.length > maxTotalChars;
  const workingText = truncated ? cleanText.slice(0, maxTotalChars) : cleanText;
  const chunks = splitTextIntoChunks(workingText, 2600);
  const langLabel = LANGUAGE_LABELS[params.targetLanguage] || 'English';

  const translatedParts: string[] = [];
  const allBullets: string[] = [];
  let usedModel = getGroqModel();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isFirst = i === 0;

    // Plain-text delimited output avoids Groq's strict JSON validator failing on long multiline Bengali/Arabic text
    const { content, model } = await callGroqChat({
      temperature: 0.2,
      maxTokens: 4096,
      jsonMode: false,
      messages: [
        {
          role: 'system',
          content:
            `You are a bilingual legal/cooperative charter translator for Amanah Co-op Treasury. ` +
            `You are given raw text extracted from a Cooperative Constitution PDF ("${params.sourceName}"). ` +
            `Legacy PDF font encodings (especially Bangla/Bijoy-encoded Bengali PDFs) may contain spaced or slightly shifted vowel signs (e.g., "বিবিয় োগ" = "বিনিয়োগ", "বনর্দ েবিকা" = "নির্দেশিকা"). ` +
            `Reconstruct the true intended words accurately from context, preserve all article numbers, dates, amounts, and Shariah clauses faithfully, and format the output cleanly into ${langLabel}.\n\n` +
            `Format your response using these exact section markers:\n` +
            `===TRANSLATION===\n` +
            `<cleanly formatted ${langLabel} text for this section>\n` +
            (isFirst
              ? `\n===HIGHLIGHTS===\n- <3 to 5 concise key charter takeaways in ${langLabel}>`
              : ''),
        },
        {
          role: 'user',
          content: `Part ${i + 1} of ${chunks.length} — Target Language: ${langLabel}\n\n${chunk}`,
        },
      ],
    });

    usedModel = model;
    const parsed = parseSectionedTranslationResponse(content);
    if (parsed.translatedText) {
      translatedParts.push(parsed.translatedText);
    }
    for (const b of parsed.summaryBullets) {
      if (b && allBullets.length < 6) {
        allBullets.push(b);
      }
    }
  }

  return {
    translatedText: translatedParts.join('\n\n').trim(),
    summaryBullets: allBullets,
    model: usedModel,
    ...(truncated
      ? {
          truncationNotice: `Document exceeded ${maxTotalChars.toLocaleString()} characters; translated the first ${maxTotalChars.toLocaleString()} characters.`,
        }
      : {}),
  };
}
