import { NextResponse } from "next/server";
import { LingoDotDevEngine } from "lingo.dev/sdk";
import { analyzePoemShape } from "@/lib/analysis";

const lingo = new LingoDotDevEngine({
  apiKey: process.env.LINGODOTDEV_API_KEY,
  engineId: process.env.LINGODOTDEV_ENGINE_ID,
});

const languageMap: Record<string, string> = {
  en: "English",
  de: "German",
  ar: "Arabic",
  ja: "Japanese",
  fr: "French",
  es: "Spanish",
  hi: "Hindi",
};

type AnalysisResult = {
  language: string;
  text: string;
  warnings: string[];
  score: number;
};

export async function POST(req: Request) {
  try {
    const { poem, sourceLanguage, targetLanguages } = await req.json();

    if (!poem || typeof poem !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid poem" },
        { status: 400 }
      );
    }

    if (!sourceLanguage || typeof sourceLanguage !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid source language" },
        { status: 400 }
      );
    }

    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return NextResponse.json(
        { error: "Please choose at least one target language" },
        { status: 400 }
      );
    }

    const results: AnalysisResult[] = [
      {
        language: languageMap[sourceLanguage] || sourceLanguage,
        text: poem,
        warnings: [],
        score: 100,
      },
    ];

    for (const code of targetLanguages) {
      const translated = await lingo.localizeText(poem, {
        sourceLocale: sourceLanguage,
        targetLocale: code,
      });

      const languageName = languageMap[code] || code;
      const analysis = analyzePoemShape(poem, translated, languageName);

      results.push({
        language: languageName,
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