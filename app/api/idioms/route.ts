import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { poem, sourceLanguage, targetLanguages } = await req.json();

    if (!poem || !sourceLanguage || !Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You are a cultural linguistics expert specializing in idioms and cultural equivalences across languages. Return ONLY valid JSON with no markdown, no code fences, no preamble.",
        },
        {
          role: "user",
          content: `
Analyze this poem for idioms, metaphors, and culturally-specific phrases.
For each one found, provide the culturally equivalent expression in the target languages.

Source language: ${sourceLanguage}
Target languages: ${targetLanguages.join(", ")}

Poem:
${poem}

Return ONLY this JSON structure:
{
  "idioms": [
    {
      "original": "the original phrase from the poem",
      "meaning": "what it means literally or culturally",
      "equivalents": {
        "German": "equivalent phrase in German",
        "French": "equivalent phrase in French"
      },
      "notes": "brief cultural note about this idiom"
    }
  ]
}

Rules:
- Find 2-5 idioms, metaphors, or culturally-specific phrases
- Only include languages from the target languages list
- If no good equivalent exists, write "No direct equivalent — [brief explanation]"
- Keep notes under 20 words
- Return empty idioms array if no idioms found
- No text outside the JSON object
          `.trim(),
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({ idioms: [] });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ idioms: parsed.idioms || [] });
  } catch (error) {
    console.error("Idiom route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}