import { NextResponse } from "next/server";
import { LingoDotDevEngine } from "lingo.dev/sdk";
import { analyzeTranslationWithAI } from "@/lib/aiAnalysis";

const SUPPORTED_LANGUAGES = {
  en: "English",
  de: "German",
  ar: "Arabic",
  ja: "Japanese",
  fr: "French",
  es: "Spanish",
  hi: "Hindi",
} as const;

type SupportedLocale = keyof typeof SUPPORTED_LANGUAGES;

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
  meaningWarnings: string[];
  score: number;
};

function isSupportedLocale(value: string): value is SupportedLocale {
  return value in SUPPORTED_LANGUAGES;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.LINGODOTDEV_API_KEY;
    const engineId = process.env.LINGODOTDEV_ENGINE_ID;

    if (!apiKey || !engineId) {
      return NextResponse.json(
        {
          error:
            "Missing LINGODOTDEV_API_KEY or LINGODOTDEV_ENGINE_ID in .env.local",
        },
        { status: 500 }
      );
    }

    const lingo = new LingoDotDevEngine({
      apiKey,
      engineId,
    });

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

    if (
      !sourceLanguage ||
      typeof sourceLanguage !== "string" ||
      !isSupportedLocale(sourceLanguage)
    ) {
      return NextResponse.json(
        { error: "Missing or invalid source language" },
        { status: 400 }
      );
    }

    const sourceLanguageName = SUPPORTED_LANGUAGES[sourceLanguage];

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
        !isSupportedLocale(manualTargetLanguage) ||
        manualTargetLanguage === sourceLanguage
      ) {
        return NextResponse.json(
          { error: "Missing or invalid translation language" },
          { status: 400 }
        );
      }

      const targetLanguageName = SUPPORTED_LANGUAGES[manualTargetLanguage];

      const analysis = await analyzeTranslationWithAI({
        original: poem,
        translated: existingTranslation,
        sourceLanguageName,
        targetLanguageName,
      });

      const manualResults: AnalysisResult[] = [
        {
          language: `${sourceLanguageName} (Original)`,
          text: poem,
          warnings: [],
          meaningWarnings: [],
          score: 100,
        },
        {
          language: `${targetLanguageName} (Existing Translation)`,
          text: existingTranslation,
          warnings: analysis.warnings,
          meaningWarnings: analysis.meaningWarnings,
          score: analysis.score,
        },
      ];

      return NextResponse.json({ results: manualResults });
    }

    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return NextResponse.json(
        { error: "Please choose at least one target language" },
        { status: 400 }
      );
    }

    const filteredTargetLanguages: SupportedLocale[] = targetLanguages.filter(
      (code): code is SupportedLocale =>
        typeof code === "string" &&
        isSupportedLocale(code) &&
        code !== sourceLanguage
    );

    if (filteredTargetLanguages.length === 0) {
      return NextResponse.json(
        { error: "Please choose at least one valid target language" },
        { status: 400 }
      );
    }

    const translatedTexts = await Promise.all(
      filteredTargetLanguages.map((code) =>
        lingo.localizeText(poem, {
          sourceLocale: sourceLanguage,
          targetLocale: code,
        })
      )
    );

    const analyzedResults: AnalysisResult[] = await Promise.all(
      filteredTargetLanguages.map(async (code, index) => {
        const translated = translatedTexts[index];
        const targetLanguageName = SUPPORTED_LANGUAGES[code];

        const analysis = await analyzeTranslationWithAI({
          original: poem,
          translated,
          sourceLanguageName,
          targetLanguageName,
        });

        return {
          language: targetLanguageName,
          text: translated,
          warnings: analysis.warnings,
          meaningWarnings: analysis.meaningWarnings,
          score: analysis.score,
        };
      })
    );

    const autoResults: AnalysisResult[] = [
      {
        language: `${sourceLanguageName} (Original)`,
        text: poem,
        warnings: [],
        meaningWarnings: [],
        score: 100,
      },
      ...analyzedResults,
    ];

    return NextResponse.json({ results: autoResults });
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