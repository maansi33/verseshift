"use client";

import { ChangeEvent, useState } from "react";

type AnalysisResult = {
  language: string;
  text: string;
  warnings: string[];
  score: number;
};

const languageOptions = [
  { code: "en", name: "English" },
  { code: "de", name: "German" },
  { code: "ar", name: "Arabic" },
  { code: "ja", name: "Japanese" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "hi", name: "Hindi" },
];

export default function HomePage() {
  const [poem, setPoem] = useState("");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguages, setTargetLanguages] = useState<string[]>([
    "de",
    "ar",
    "ja",
  ]);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setPoem(text);
  }

  function handleTargetLanguageChange(code: string) {
    setTargetLanguages((prev) =>
      prev.includes(code)
        ? prev.filter((lang) => lang !== code)
        : [...prev, code]
    );
  }

  async function handleAnalyze() {
    if (!poem.trim()) {
      alert("Please paste text or upload a file.");
      return;
    }

    if (targetLanguages.length === 0) {
      alert("Please select at least one comparison language.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          poem,
          sourceLanguage,
          targetLanguages,
        }),
      });

      const rawText = await response.text();

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
          Compare how poems shift across languages, layout, and script.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Source language
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="w-full rounded-xl border border-gray-300 p-3"
            >
              {languageOptions.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Upload poem file (.txt works best)
            </label>
            <input
              type="file"
              accept=".txt,text/plain"
              onChange={handleFileUpload}
              className="block w-full rounded-xl border border-gray-300 p-3"
            />
          </div>
        </div>

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium">
            Paste poem text
          </label>
          <textarea
            value={poem}
            onChange={(e) => setPoem(e.target.value)}
            placeholder="Paste your poem here..."
            rows={12}
            className="w-full rounded-2xl border border-gray-300 p-4 outline-none focus:border-black"
          />
        </div>

        <div className="mt-6">
          <label className="mb-3 block text-sm font-medium">
            Comparison languages
          </label>
          <div className="flex flex-wrap gap-4">
            {languageOptions
              .filter((lang) => lang.code !== sourceLanguage)
              .map((lang) => (
                <label
                  key={lang.code}
                  className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={targetLanguages.includes(lang.code)}
                    onChange={() => handleTargetLanguageChange(lang.code)}
                  />
                  <span>{lang.name}</span>
                </label>
              ))}
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="mt-6 rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
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