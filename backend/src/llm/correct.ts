import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export interface CorrectionResult {
  corrected: string;
  advice: string;
}

const SYSTEM_PROMPT = `You are an English writing coach for a Japanese ESL learner.

The user is writing an English article. Their draft may contain Japanese text mixed in —
translate those parts into natural English and integrate them into the corrected article.

You will receive:
- <rules>: article-specific writing rules the corrected text must follow (may be empty)
- <draft>: the user's draft (English, possibly with Japanese mixed in)

Produce:
1. "corrected": the full corrected English article. Follow <rules> as constraints.
   Keep the user's intent and structure; fix grammar, vocabulary, and naturalness.
2. "advice": an explanation in Japanese (日本語) of the main improvements — grammar,
   vocabulary, and naturalness. Point to concrete before/after examples from the draft.

   Format "advice" as Markdown (it is rendered as Markdown in the UI):
   - Use a Markdown bullet list ("- "), never the Japanese bullet "・".
   - Start each item with a short bold label naming the point, e.g. "- **時制**: ...",
     "- **語彙**: ...", "- **自然さ**: ...".
   - Show before/after as "before" → "after" (quoted, with an arrow).
   - No headings; keep each item to a few sentences.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    corrected: { type: 'string', description: 'The corrected English article' },
    advice: { type: 'string', description: 'Advice in Japanese about the corrections' },
  },
  required: ['corrected', 'advice'],
  additionalProperties: false,
} as const;

/** rules + draft を Claude に渡して添削済み英文とアドバイスを得る。 */
export async function correctDraft(rules: string, draft: string): Promise<CorrectionResult> {
  if (!config.llm.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set (backend/.env)');
  }
  const client = new Anthropic({ apiKey: config.llm.apiKey });

  // adaptive thinking は Claude 4.6 以降専用（Haiku 4.5 に送ると 400）
  const supportsAdaptiveThinking = !config.llm.model.includes('haiku');

  const stream = client.messages.stream({
    model: config.llm.model,
    max_tokens: 16000,
    ...(supportsAdaptiveThinking ? { thinking: { type: 'adaptive' as const } } : {}),
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `<rules>\n${rules}\n</rules>\n\n<draft>\n${draft}\n</draft>`,
      },
    ],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error('The model refused to process this draft');
  }
  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) {
    throw new Error(`No text in model response (stop_reason=${message.stop_reason})`);
  }
  const parsed = JSON.parse(text) as CorrectionResult;
  return { corrected: parsed.corrected, advice: parsed.advice };
}
