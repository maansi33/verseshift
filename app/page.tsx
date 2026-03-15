"use client";

import { useState } from "react";

type AnalysisResult = {
  language: string;
  text: string;
  warnings: string[];
  score: number;
};

export default function HomePage() {
  const [poem, setPoem] = useState("");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
  if (!poem.trim()) return;

  setLoading(true);

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ poem }),
    });

    const rawText = await response.text();
    console.log("API raw response:", rawText);

    if (!rawText || !rawText.trim()) {
      throw new Error("Server returned an empty response");
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Server did not return valid JSON: ${rawText}`);
    }

    if (!response.ok) {
      throw new Error(data.error || `API request failed with status ${response.status}`);
    }

    setResults(data.results || []);
  } catch (error) {
    console.error("Failed to analyze poem:", error);
    alert(error instanceof Error ? error.message : "Something went wrong");
  } finally {
    setLoading(false);
  }
}

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold">VerseShift</h1>
        <p className="mt-2 text-gray-600">
          Test how poems change across languages, layout, and script.
        </p>

        <div className="mt-8">
          <textarea
            value={poem}
            onChange={(e) => setPoem(e.target.value)}
            placeholder="Paste your poem here..."
            rows={12}
            className="w-full rounded-2xl border border-gray-300 p-4 outline-none focus:border-black"
          />
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="mt-4 rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Analyze Poem"}
        </button>

        {results.length > 0 && (
          <section className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {results.map((result) => (
              <div
                key={result.language}
                className="rounded-2xl border border-gray-200 p-5 shadow-sm"
              >
                <h2 className="text-xl font-semibold">{result.language}</h2>
                <p className="text-sm text-gray-500">
                Poem preservation score: {result.score}/100
                </p>

                <pre
                  dir={result.language === "Arabic" ? "rtl" : "ltr"}
                  className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6"
                >
                  {result.text}
                </pre>

                {result.warnings.length > 0 && (
                  <div className="mt-5">
                    <h3 className="font-medium">Warnings</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                      {result.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}