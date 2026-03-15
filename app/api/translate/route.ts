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

type RequestBody = {
  mode?: "auto" | "manual";
  poem?: string;
  existingTranslation?: string;
  sourceLanguage?: string;
  manualTargetLanguage?: string;
  targetLanguages?: string[];
};

type AnalysisResult = {
  language: string;
  text: string;
  warnings: string[];
  score: number;
};

export async function POST(req: Request) {
  try {
    const {
      mode = "auto",
      poem,
      existingTranslation,
      sourceLanguage,
      manualTargetLanguage,
      targetLanguages,
    }: RequestBody = await req.json();

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

    const originalLanguageName = languageMap[sourceLanguage] || sourceLanguage;

    if (mode === "manual") {
      if (!existingTranslation || typeof existingTranslation !== "string") {
        return NextResponse.json(
          { error: "Missing or invalid existing translation" },
          { status: 400 }
        );
      }

      if (
        !manualTargetLanguage ||
        typeof manualTargetLanguage !== "string" ||
        manualTargetLanguage === sourceLanguage
      ) {
        return NextResponse.json(
          { error: "Missing or invalid translation language" },
          { status: 400 }
        );
      }

      const translationLanguageName =
        languageMap[manualTargetLanguage] || manualTargetLanguage;

      const analysis = analyzePoemShape(
        poem,
        existingTranslation,
        translationLanguageName
      );

      const manualResults: AnalysisResult[] = [
        {
          language: `${originalLanguageName} (Original)`,
          text: poem,
          warnings: [],
          score: 100,
        },
        {
          language: `${translationLanguageName} (Existing Translation)`,
          text: existingTranslation,
          warnings: analysis.warnings,
          score: analysis.score,
        },
      ];
      return NextResponse.json({
        results: manualResults,
      });
    }

    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return NextResponse.json(
        { error: "Please choose at least one target language" },
        { status: 400 }
      );
    }

    const filteredTargetLanguages = targetLanguages.filter(
      (code) => code !== sourceLanguage
    );

    const results: AnalysisResult[] = [
      {
        language: `${originalLanguageName} (Original)`,
        text: poem,
        warnings: [],
        score: 100,
      },
    ];

    for (const code of filteredTargetLanguages) {
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