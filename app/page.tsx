"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type AnalysisResult = {
  language: string;
  text: string;
  warnings: string[];
  meaningWarnings: string[];
  score: number;
};

type RoomMessage = {
  id: string;
  senderName: string;
  originalText: string;
  originalLanguage: string;
  translatedText: string;
  translatedLanguage: string;
  createdAt: string;
};

type RoomState = {
  roomCode: string;
  participantId: string;
  displayName: string;
  preferredLanguage: string;
  messages: RoomMessage[];
};

const languageOptions = [
  { code: "en", name: "English" },
  { code: "de", name: "German" },
  { code: "ar", name: "Arabic" },
  { code: "ja", name: "Japanese" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "hi", name: "Hindi" },
  { code: "ur", name: "Urdu" },
  { code: "pa", name: "Punjabi" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "bn", name: "Bengali" },
];

function getLanguageName(code: string) {
  return languageOptions.find((lang) => lang.code === code)?.name || code;
}

export default function HomePage() {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [poem, setPoem] = useState("");
  const [existingTranslation, setExistingTranslation] = useState("");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [manualTargetLanguage, setManualTargetLanguage] = useState("de");
  const [targetLanguages, setTargetLanguages] = useState<string[]>([
    "de",
    "ar",
    "ja",
    "ur",
  ]);

  const [roomDisplayName, setRoomDisplayName] = useState("");
  const [roomPreferredLanguage, setRoomPreferredLanguage] = useState("en");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [roomMessage, setRoomMessage] = useState("");
  const [roomMessageLanguage, setRoomMessageLanguage] = useState("en");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState("");

  const roomShareLink = useMemo(() => {
    if (!roomState || typeof window === "undefined") return "";
    return `${window.location.origin}?room=${roomState.roomCode}`;
  }, [roomState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");
    if (roomFromUrl) {
      setJoinRoomCode(roomFromUrl.toUpperCase());
    }
  }, []);

  useEffect(() => {
    if (!roomState) return;

    const interval = setInterval(() => {
      void refreshRoom(roomState.roomCode, roomState.participantId, roomState.preferredLanguage);
    }, 4000);

    return () => clearInterval(interval);
  }, [roomState]);

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
      alert("Please paste the original poem or upload a file.");
      return;
    }

    if (mode === "manual" && !existingTranslation.trim()) {
      alert("Please paste the existing translation.");
      return;
    }

    if (mode === "auto" && targetLanguages.length === 0) {
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
          mode,
          poem,
          existingTranslation,
          sourceLanguage,
          manualTargetLanguage,
          targetLanguages,
        }),
      });

      const rawText = await response.text();

      if (!rawText || !rawText.trim()) {
        throw new Error("Server returned an empty response");
      }

      const data = JSON.parse(rawText);

      if (!response.ok) {
        throw new Error(
          data.error || `API request failed with status ${response.status}`
        );
      }

      setResults(data.results || []);
    } catch (error) {
      console.error("Failed to analyze poem:", error);
      alert(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function createRoom() {
    if (!roomDisplayName.trim()) {
      alert("Please enter your name.");
      return;
    }

    setRoomLoading(true);
    setRoomError("");

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          displayName: roomDisplayName,
          preferredLanguage: roomPreferredLanguage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not create room.");
      }

      setRoomState(data);
      setRoomMessageLanguage(roomPreferredLanguage);
      setJoinRoomCode(data.roomCode);

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("room", data.roomCode);
      window.history.replaceState({}, "", nextUrl.toString());
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setRoomLoading(false);
    }
  }

  async function joinRoom(event?: FormEvent) {
    event?.preventDefault();

    if (!roomDisplayName.trim()) {
      alert("Please enter your name.");
      return;
    }

    if (!joinRoomCode.trim()) {
      alert("Please enter a room code.");
      return;
    }

    setRoomLoading(true);
    setRoomError("");

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "join",
          roomCode: joinRoomCode.trim().toUpperCase(),
          displayName: roomDisplayName,
          preferredLanguage: roomPreferredLanguage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not join room.");
      }

      setRoomState(data);
      setRoomMessageLanguage(roomPreferredLanguage);

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("room", data.roomCode);
      window.history.replaceState({}, "", nextUrl.toString());
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setRoomLoading(false);
    }
  }

  async function refreshRoom(
    roomCode: string,
    participantId: string,
    viewerLanguage: string
  ) {
    try {
      const params = new URLSearchParams({
        roomCode,
        participantId,
        viewerLanguage,
      });

      const response = await fetch(`/api/rooms?${params.toString()}`, {
        method: "GET",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load room.");
      }

      setRoomState(data);
    } catch (error) {
      console.error(error);
    }
  }

  async function sendRoomMessage(event: FormEvent) {
    event.preventDefault();

    if (!roomState) return;

    if (!roomMessage.trim()) {
      alert("Please enter a poem or message.");
      return;
    }

    setRoomLoading(true);
    setRoomError("");

    try {
      const response = await fetch("/api/rooms/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomCode: roomState.roomCode,
          participantId: roomState.participantId,
          text: roomMessage,
          language: roomMessageLanguage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not send message.");
      }

      setRoomMessage("");
      await refreshRoom(
        roomState.roomCode,
        roomState.participantId,
        roomState.preferredLanguage
      );
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setRoomLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-6xl space-y-16">
        <section>
          <h1 className="text-4xl font-bold">VerseShift</h1>
          <p className="mt-2 text-gray-600">
            Compare how poems shift across languages, layout, and meaning.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2">
              <input
                type="radio"
                name="mode"
                checked={mode === "auto"}
                onChange={() => setMode("auto")}
              />
              <span>Auto Translate</span>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2">
              <input
                type="radio"
                name="mode"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
              />
              <span>Compare Existing Translation</span>
            </label>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Source language
              </label>
              <select
                value={sourceLanguage}
                onChange={(e) => {
                  const newSourceLanguage = e.target.value;
                  setSourceLanguage(newSourceLanguage);

                  if (manualTargetLanguage === newSourceLanguage) {
                    const fallback =
                      languageOptions.find(
                        (lang) => lang.code !== newSourceLanguage
                      )?.code || "de";
                    setManualTargetLanguage(fallback);
                  }

                  setTargetLanguages((prev) =>
                    prev.filter((lang) => lang !== newSourceLanguage)
                  );
                }}
                className="w-full rounded-xl border border-gray-300 p-3"
              >
                {languageOptions.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {mode === "auto" ? (
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
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Existing translation language
                </label>
                <select
                  value={manualTargetLanguage}
                  onChange={(e) => setManualTargetLanguage(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-3"
                >
                  {languageOptions
                    .filter((lang) => lang.code !== sourceLanguage)
                    .map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium">
              Paste original poem
            </label>
            <textarea
              value={poem}
              onChange={(e) => setPoem(e.target.value)}
              placeholder="Paste the original poem here..."
              rows={12}
              className="w-full rounded-2xl border border-gray-300 p-4 outline-none focus:border-black"
            />
          </div>

          {mode === "manual" && (
            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium">
                Paste existing translation
              </label>
              <textarea
                value={existingTranslation}
                onChange={(e) => setExistingTranslation(e.target.value)}
                placeholder="Paste an existing translation here..."
                rows={12}
                className="w-full rounded-2xl border border-gray-300 p-4 outline-none focus:border-black"
              />
            </div>
          )}

          {mode === "auto" && (
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
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="mt-6 rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
          >
            {loading
              ? "Analyzing..."
              : mode === "auto"
                ? "Analyze Poem"
                : "Compare Translation"}
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
                    dir={
                      result.language.toLowerCase().includes("arabic") ||
                      result.language.toLowerCase().includes("urdu")
                        ? "rtl"
                        : "ltr"
                    }
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

                  {result.meaningWarnings.length > 0 && (
                    <div className="mt-5">
                      <h3 className="font-medium">Meaning Shift Risks</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                        {result.meaningWarnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </section>

        <section className="rounded-3xl border border-gray-200 p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-bold">Poetry Penpal Room</h2>
            <p className="text-gray-600">
              Share poems with someone in another language using a room code.
            </p>
          </div>

          {!roomState ? (
            <>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Your name
                  </label>
                  <input
                    value={roomDisplayName}
                    onChange={(e) => setRoomDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full rounded-xl border border-gray-300 p-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Your preferred reading language
                  </label>
                  <select
                    value={roomPreferredLanguage}
                    onChange={(e) => {
                      setRoomPreferredLanguage(e.target.value);
                      setRoomMessageLanguage(e.target.value);
                    }}
                    className="w-full rounded-xl border border-gray-300 p-3"
                  >
                    {languageOptions.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-4">
                <button
                  onClick={createRoom}
                  disabled={roomLoading}
                  className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
                >
                  {roomLoading ? "Working..." : "Create Room"}
                </button>
              </div>

              <form
                onSubmit={joinRoom}
                className="mt-8 grid gap-4 rounded-2xl border border-gray-200 p-4 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Join with room code
                  </label>
                  <input
                    value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="w-full rounded-xl border border-gray-300 p-3"
                  />
                </div>

                <button
                  type="submit"
                  disabled={roomLoading}
                  className="self-end rounded-xl border border-black px-5 py-3 disabled:opacity-50"
                >
                  Join Room
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mt-6 grid gap-4 rounded-2xl border border-gray-200 p-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-gray-500">Room code</p>
                  <p className="font-semibold">{roomState.roomCode}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">You are</p>
                  <p className="font-semibold">{roomState.displayName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Reading language</p>
                  <p className="font-semibold">
                    {getLanguageName(roomState.preferredLanguage)}
                  </p>
                </div>
              </div>

              {roomShareLink && (
                <div className="mt-4 rounded-2xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Share link</p>
                  <p className="break-all text-sm">{roomShareLink}</p>
                </div>
              )}

              <form onSubmit={sendRoomMessage} className="mt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  <textarea
                    value={roomMessage}
                    onChange={(e) => setRoomMessage(e.target.value)}
                    placeholder="Write a poem or message to share..."
                    rows={6}
                    className="w-full rounded-2xl border border-gray-300 p-4 outline-none focus:border-black"
                  />

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Message language
                      </label>
                      <select
                        value={roomMessageLanguage}
                        onChange={(e) => setRoomMessageLanguage(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 p-3"
                      >
                        {languageOptions.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={roomLoading}
                      className="w-full rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
                    >
                      {roomLoading ? "Sending..." : "Send to Room"}
                    </button>
                  </div>
                </div>
              </form>

              <div className="mt-8 space-y-4">
                {roomState.messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-gray-500">
                    No poems shared yet.
                  </div>
                ) : (
                  roomState.messages.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-2xl border border-gray-200 p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{message.senderName}</p>
                          <p className="text-sm text-gray-500">
                            Original: {getLanguageName(message.originalLanguage)}
                          </p>
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(message.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="mb-2 text-sm font-medium text-gray-600">
                            Original text
                          </p>
                          <pre
                            dir={
                              message.originalLanguage === "ar" ||
                              message.originalLanguage === "ur"
                                ? "rtl"
                                : "ltr"
                            }
                            className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm"
                          >
                            {message.originalText}
                          </pre>
                        </div>

                        <div>
                          <p className="mb-2 text-sm font-medium text-gray-600">
                            In your language ({getLanguageName(message.translatedLanguage)})
                          </p>
                          <pre
                            dir={
                              message.translatedLanguage === "ar" ||
                              message.translatedLanguage === "ur"
                                ? "rtl"
                                : "ltr"
                            }
                            className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm"
                          >
                            {message.translatedText}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {roomError && (
            <p className="mt-4 text-sm text-red-600">{roomError}</p>
          )}
        </section>
      </div>
    </main>
  );
}