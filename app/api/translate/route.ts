import { NextResponse } from "next/server";
import { LingoDotDevEngine } from "lingo.dev/sdk";
import { analyzePoemShape } from "@/lib/analysis";

const lingo = new LingoDotDevEngine({
  apiKey: process.env.LINGODOTDEV_API_KEY,
  engineId: process.env.LINGODOTDEV_ENGINE_ID,
});

const languages = [
  { code: "de", name: "German" },
  { code: "ar", name: "Arabic" },
  { code: "ja", name: "Japanese" },
];

type AnalysisResult = {
  language: string;
  text: string;
  warnings: string[];
  score: number;
};

export async function POST(req: Request) {
  try {
    const { poem } = await req.json();

    if (!poem || typeof poem !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid poem" },
        { status: 400 }
      );
    }

    const results: AnalysisResult[] = [
      {
        language: "English",
        text: poem,
        warnings: [],
        score: 100,
      },
    ];

    for (const lang of languages) {
      const translated = await lingo.localizeText(poem, {
        sourceLocale: "en",
        targetLocale: lang.code,
      });

      const analysis = analyzePoemShape(poem, translated, lang.name);

      results.push({
        language: lang.name,
        text: translated,
        warnings: analysis.warnings,
        score: analysis.score,
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Route error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}