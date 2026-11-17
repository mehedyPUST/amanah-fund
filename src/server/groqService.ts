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

async function callGroqChat(params: {
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<{ content: string; model: string }> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in the server environment.');
  }

  const model = getGroqModel();
  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.35,
    max_tokens: params.maxTokens ?? 2048,
  };

  if (params.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(GROQ_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(28000),
  });

  if (!response.ok) {
    let errorMessage = `Groq API request failed (${response.status}).`;
    try {
      const errJson = (await response.json()) as { error?: { message?: string } };
      if (errJson?.error?.message) {
        errorMessage = `Groq API error (${response.status}): ${errJson.error.message}`;
      }
    } catch {
      // Ignore parse failures on upstream error bodies
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    throw new Error('Groq API returned an empty completion.');
  }

  return {
    content,
    model: data?.model || model,
  };
}

async function callGroqJson<T>(params: {
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<{ parsed: T; model: string }> {
  const result = await callGroqChat({
    ...params,
    jsonMode: true,
  });

  const clean = stripJsonCodeFences(result.content);
  try {
    return {
      parsed: JSON.parse(clean) as T,
      model: result.model,
    };
  } catch {
    const startIdx = clean.indexOf('{');
    const endIdx = clean.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      return {
        parsed: JSON.parse(clean.slice(startIdx, endIdx + 1)) as T,
        model: result.model,
      };
    }
    throw new Error('Groq API returned invalid JSON output.');
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
    maxTokens: 1600,
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
          `4. Return ONLY valid JSON with keys: "rewrittenTitle" (string, include if title was provided), "rewrittenText" (string), and "improvements" (array of 1-3 short strings describing what improved).`,
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

  // Inspect raw text for unsafe inline schemes too
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

  // Immediately reject obvious deterministic spam/phishing without wasting AI tokens
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
            `Return ONLY valid JSON: { "isSpam": boolean, "riskLevel": "safe" | "caution" | "spam", "reason": string, "flaggedLinks": string[], "signals": string[] }.`,
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

function splitTextIntoChunks(text: string, maxChunkChars = 9000): string[] {
  const clean = text.trim();
  if (clean.length <= maxChunkChars) return [clean];

  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxChunkChars && current.trim()) {
      chunks.push(current.trim());
      current = para;
    } else if (para.length > maxChunkChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      for (let i = 0; i < para.length; i += maxChunkChars) {
        chunks.push(para.slice(i, i + maxChunkChars));
      }
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
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
  const chunks = splitTextIntoChunks(workingText, 9000);
  const langLabel = LANGUAGE_LABELS[params.targetLanguage] || 'English';

  const translatedParts: string[] = [];
  const allBullets: string[] = [];
  let usedModel = getGroqModel();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isFirst = i === 0;

    const { parsed, model } = await callGroqJson<{
      translatedText?: string;
      summaryBullets?: string[];
    }>({
      temperature: 0.2,
      maxTokens: 3200,
      messages: [
        {
          role: 'system',
          content:
            `You are a bilingual legal/cooperative charter translator for Amanah Co-op Treasury. ` +
            `You are given raw text extracted from a Cooperative Constitution PDF ("${params.sourceName}"). ` +
            `Note: Legacy PDF font encodings (especially Bangla/Bijoy/ANSI-encoded Bengali PDFs) may contain spaced or slightly scrambled vowel signs (e.g., "বিবিয় োগ" = "বিনিয়োগ", "বনর্দ েবিকা" = "নির্দেশিকা"). ` +
            `Reconstruct the true intended words accurately from context, preserve all article numbers, dates, amounts, and Shariah clauses faithfully, and translate/render the entire section cleanly into ${langLabel}. ` +
            `Return ONLY valid JSON: { "translatedText": string, "summaryBullets": string[] (${isFirst ? '3 to 5 concise key charter takeaways in ' + langLabel : 'empty array or 1-2 highlights'}) }.`,
        },
        {
          role: 'user',
          content: `Part ${i + 1} of ${chunks.length} — Target Language: ${langLabel}\n\n${chunk}`,
        },
      ],
    });

    usedModel = model;
    if (parsed.translatedText) {
      translatedParts.push(String(parsed.translatedText).trim());
    }
    if (Array.isArray(parsed.summaryBullets)) {
      for (const b of parsed.summaryBullets) {
        const cleanBullet = String(b || '').trim();
        if (cleanBullet && allBullets.length < 6) {
          allBullets.push(cleanBullet);
        }
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
