import { GoogleGenAI, Type } from '@google/genai';

export interface ReceiptExtractionResult {
  channel: 'bank' | 'mfs';
  providerName: string;
  referenceId: string;
  senderAccount: string;
  amount: number | null;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function verifyPaymentReceiptImage(params: {
  imageBase64: string;
  currency: string;
}): Promise<ReceiptExtractionResult> {
  let mimeType = 'image/jpeg';
  let data = params.imageBase64.trim();

  const match = data.match(
    /^data:(image\/(?:png|jpeg|jpg|webp|gif)|application\/pdf);base64,(.+)$/i
  );
  if (match) {
    mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    data = match[2];
  }

  if (!data) {
    throw new Error('Receipt file payload is empty.');
  }

  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data,
          },
        },
        {
          text:
            `Extract cooperative payment transfer details from this Bank or Mobile Financial Service (MFS such as bKash, Nagad, Rocket, Upay, Islami Bank, DBBL, BRAC Bank, City Bank, Standard Chartered) screenshot, PDF receipt, or deposit slip. ` +
            `Return JSON matching the schema. Expected currency: ${params.currency}. If a field is unreadable, return an empty string (or null for amount) and explain briefly in summary.`,
        },
      ],
    },
    config: {
      systemInstruction:
        'You are a careful financial reconciliation assistant for a cooperative treasury. Only extract values clearly visible on the receipt image; never fabricate transaction IDs.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          channel: {
            type: Type.STRING,
            description: 'Either "mfs" for mobile wallets (bKash, Nagad, Rocket, Upay) or "bank" for bank transfers.',
          },
          providerName: {
            type: Type.STRING,
            description: 'Name of the bank or MFS provider shown on the receipt.',
          },
          referenceId: {
            type: Type.STRING,
            description: 'Transaction ID, TrxID, UTR, or bank slip reference number.',
          },
          senderAccount: {
            type: Type.STRING,
            description: 'Sender phone number, wallet ID, or bank account identifier if shown.',
          },
          amount: {
            type: Type.NUMBER,
            description: 'Numeric transfer amount without currency symbols, or 0 if unreadable.',
          },
          confidence: {
            type: Type.STRING,
            description: '"high", "medium", or "low".',
          },
          summary: {
            type: Type.STRING,
            description: 'Short 1-sentence reconciliation summary of what was read from the slip.',
          },
        },
        required: ['channel', 'providerName', 'referenceId', 'senderAccount', 'confidence', 'summary'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as Partial<ReceiptExtractionResult>;

  const channel: 'bank' | 'mfs' = parsed.channel === 'bank' ? 'bank' : 'mfs';
  const confidence: 'high' | 'medium' | 'low' =
    parsed.confidence === 'high' || parsed.confidence === 'low' ? parsed.confidence : 'medium';

  return {
    channel,
    providerName: String(parsed.providerName || '').trim(),
    referenceId: String(parsed.referenceId || '').trim(),
    senderAccount: String(parsed.senderAccount || '').trim(),
    amount:
      typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) && parsed.amount > 0
        ? parsed.amount
        : null,
    confidence,
    summary:
      String(parsed.summary || '').trim() ||
      'Receipt scanned. Please verify the extracted TrxID and amount before submitting.',
  };
}
