import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export type AIAnalysisResult = {
  score: number;
  warnings: string[];
  meaningWarnings: string[];
};

function clampScore(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function analyzeTranslationWithAI(params: {
  original: string;
  translated: string;
  sourceLanguageName: string;
  targetLanguageName: string;
}): Promise<AIAnalysisResult> {
  const {
    original,
    translated,
    sourceLanguageName,
    targetLanguageName,
  } = params;

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          'You are a poetry translation analyzer. Return ONLY valid JSON. Do not add explanations, intro text, markdown, or code fences.',
      },
      {
        role: "user",
        content: `
Analyze this poetry translation.

Original language: ${sourceLanguageName}
Translation language: ${targetLanguageName}

Original poem:
${original}

Translated poem:
${translated}

Return ONLY this JSON object:
{
  "score": 0,
  "warnings": [""],
  "meaningWarnings": [""]
}

Rules:
- score must be an integer from 0 to 100
- warnings must contain short structural or translation-quality issues
- meaningWarnings must contain short cultural, symbolic, metaphorical, or ambiguity-shift issues
- max 4 items in each array
- no text before or after the JSON
        `.trim(),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      score: 50,
      warnings: ["AI analysis returned non-JSON output."],
      meaningWarnings: [],
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return {
      score: 50,
      warnings: ["AI analysis could not be parsed."],
      meaningWarnings: [],
    };
  }

  const obj = parsed as Record<string, unknown>;

  return {
    score: clampScore(obj.score),
    warnings: normalizeStringArray(obj.warnings),
    meaningWarnings: normalizeStringArray(obj.meaningWarnings),
  };
}