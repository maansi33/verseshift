import { NextResponse } from "next/server";
import { LingoDotDevEngine } from "lingo.dev/sdk";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: "English", de: "German", ar: "Arabic", ja: "Japanese",
  fr: "French", es: "Spanish", hi: "Hindi", ur: "Urdu",
  pa: "Punjabi", ko: "Korean", zh: "Chinese", it: "Italian",
  pt: "Portuguese", ru: "Russian", tr: "Turkish", bn: "Bengali",
};

async function scoreDrift(
  original: string,
  current: string,
  fromLang: string,
  toLang: string
): Promise<{ score: number; notes: string[] }> {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Poetry translation drift analyzer. Return ONLY valid JSON, no markdown, no preamble." },
        {
          role: "user", content: `Compare these two texts and score how much meaning has DRIFTED.

From: ${fromLang} → To: ${toLang}

Original:
${original}

After translation chain:
${current}

Return ONLY:
{"driftScore":0,"notes":[""]}

Rules:
- driftScore: integer 0-100. 0=perfect preservation, 100=completely different
- notes: 1-3 short strings about what changed. If score < 15 write ["Meaning preserved"]
- No text outside JSON`.trim()
        }
      ]
    });
    const text = completion.choices[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { score: 50, notes: ["Could not analyze"] };
    const p = JSON.parse(match[0]) as { driftScore?: number; notes?: unknown };
    const score = typeof p.driftScore === "number" ? Math.max(0, Math.min(100, Math.round(p.driftScore))) : 50;
    const notes = Array.isArray(p.notes) ? (p.notes as unknown[]).filter((n): n is string => typeof n === "string").slice(0, 3) : [];
    return { score, notes };
  } catch {
    return { score: 50, notes: ["Analysis failed"] };
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.LINGODOTDEV_API_KEY;
    const engineId = process.env.LINGODOTDEV_ENGINE_ID;
    if (!apiKey || !engineId) return NextResponse.json({ error: "Missing Lingo.dev config." }, { status: 500 });

    const body = await req.json() as { poem?: string; chain?: string[]; sourceLanguage?: string; lockedWords?: string[] };
    const { poem, chain, sourceLanguage = "en", lockedWords = [] } = body;

    if (!poem || !Array.isArray(chain) || chain.length < 1) {
      return NextResponse.json({ error: "Missing poem or chain." }, { status: 400 });
    }

    const lingo = new LingoDotDevEngine({ apiKey, engineId });

    const LOCK_OPEN = "«";
    const LOCK_CLOSE = "»";
    const lockedSet = new Set(lockedWords.map((w) => w.toLowerCase()));

    function applyLock(text: string): string {
      if (!lockedSet.size) return text;
      let result = text;
      for (const word of lockedSet) {
        const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(`\\b${esc}\\b`, "gi"), (m) => `${LOCK_OPEN}${m}${LOCK_CLOSE}`);
      }
      return result;
    }

    function stripLock(text: string): string {
      return text.replace(/[«»]/g, "");
    }

    type DriftHop = { language: string; code: string; text: string; driftScore: number; driftNotes: string[] };
    const hops: DriftHop[] = [];
    let currentText = poem;
    let currentCode = sourceLanguage;

    hops.push({ language: SUPPORTED_LANGUAGES[sourceLanguage] ?? sourceLanguage, code: sourceLanguage, text: poem, driftScore: 0, driftNotes: ["Original"] });

    for (const targetCode of chain) {
      const targetLang = SUPPORTED_LANGUAGES[targetCode] ?? targetCode;
      let translated: string;
      try {
        const locked = applyLock(currentText);
        const raw = await lingo.localizeText(locked, { sourceLocale: currentCode as never, targetLocale: targetCode as never });
        translated = stripLock(raw);
      } catch {
        translated = currentText;
      }
      const { score, notes } = await scoreDrift(poem, translated, SUPPORTED_LANGUAGES[sourceLanguage] ?? sourceLanguage, targetLang);
      hops.push({ language: targetLang, code: targetCode, text: translated, driftScore: score, driftNotes: notes });
      currentText = translated;
      currentCode = targetCode;
    }

    return NextResponse.json({ hops });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}