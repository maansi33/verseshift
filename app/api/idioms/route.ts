import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { poem, sourceLanguage, targetLanguages } = await req.json() as {
      poem?: string; sourceLanguage?: string; targetLanguages?: string[];
    };
    if (!poem || !sourceLanguage || !Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      messages: [
        { role: "system", content: "Cultural linguistics expert. Return ONLY valid JSON, no markdown, no preamble." },
        {
          role: "user", content: `Analyze this poem for idioms, metaphors, and culturally-specific phrases.
For each one, provide the culturally equivalent expression in the target languages.

Source language: ${sourceLanguage}
Target languages: ${targetLanguages.join(", ")}

Poem:
${poem}

Return ONLY:
{"idioms":[{"original":"phrase from poem","meaning":"what it means","equivalents":{"German":"equivalent"},"notes":"brief cultural note"}]}

Rules:
- Find 2-5 idioms or culturally-specific phrases
- Only include languages from the target list
- If no good equivalent, write "No direct equivalent — [brief reason]"
- Keep notes under 20 words
- Return empty idioms array if none found`.trim()
        }
      ]
    });
    const text = completion.choices[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ idioms: [] });
    const parsed = JSON.parse(match[0]) as { idioms?: unknown };
    return NextResponse.json({ idioms: Array.isArray(parsed.idioms) ? parsed.idioms : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}