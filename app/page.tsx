"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type AnalysisResult = {
  language: string;
  text: string;
  warnings: string[];
  meaningWarnings: string[];
  score: number;
};

type IdiomEquivalent = {
  original: string;
  meaning: string;
  equivalents: Record<string, string>;
  notes: string;
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

// BCP-47 voice codes for Web Speech API
const voiceLangMap: Record<string, string> = {
  en: "en-US", de: "de-DE", ar: "ar-SA", ja: "ja-JP",
  fr: "fr-FR", es: "es-ES", hi: "hi-IN", ko: "ko-KR",
  zh: "zh-CN", it: "it-IT", pt: "pt-BR", ru: "ru-RU",
  tr: "tr-TR",
};

function getLanguageName(code: string) {
  return languageOptions.find((l) => l.code === code)?.name || code;
}

function getLangCode(languageName: string): string {
  const clean = languageName.replace(/\s*\(.*?\)/g, "").trim();
  return languageOptions.find((l) => l.name === clean)?.code || "en";
}

// ── Download helpers ──────────────────────────────────────────────
function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadAllPoems(results: AnalysisResult[], sourceTitle = "poem") {
  const content = results
    .map((r) => `═══ ${r.language} ═══\n\n${r.text}\n`)
    .join("\n\n");
  downloadText(`${sourceTitle}-translations.txt`, content);
}

// ── Audio helper ──────────────────────────────────────────────────
function speakText(text: string, langCode: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = voiceLangMap[langCode] || langCode;
  utt.rate = 0.88;
  utt.pitch = 1;
  window.speechSynthesis.speak(utt);
}

export default function HomePage() {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [poem, setPoem] = useState("");
  const [existingTranslation, setExistingTranslation] = useState("");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [manualTargetLanguage, setManualTargetLanguage] = useState("de");
  const [targetLanguages, setTargetLanguages] = useState<string[]>(["de", "ar", "ja", "ur"]);

  // Idiom state
  const [idioms, setIdioms] = useState<IdiomEquivalent[]>([]);
  const [idiomsLoading, setIdiomsLoading] = useState(false);
  const [idiomsOpen, setIdiomsOpen] = useState(false);

  // Audio state
  const [speakingLang, setSpeakingLang] = useState<string | null>(null);

  // Share card state
  const [shareCard, setShareCard] = useState<{ result: AnalysisResult; original: AnalysisResult } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Room state
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
    if (roomFromUrl) setJoinRoomCode(roomFromUrl.toUpperCase());
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
    setPoem(await file.text());
  }

  function handleTargetLanguageChange(code: string) {
    setTargetLanguages((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  }

  async function handleAnalyze() {
    if (!poem.trim()) { alert("Please paste the original poem or upload a file."); return; }
    if (mode === "manual" && !existingTranslation.trim()) { alert("Please paste the existing translation."); return; }
    if (mode === "auto" && targetLanguages.length === 0) { alert("Please select at least one comparison language."); return; }

    setLoading(true);
    setIdioms([]);
    setIdiomsOpen(false);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, poem, existingTranslation, sourceLanguage, manualTargetLanguage, targetLanguages }),
      });
      const rawText = await response.text();
      if (!rawText?.trim()) throw new Error("Server returned an empty response");
      const data = JSON.parse(rawText);
      if (!response.ok) throw new Error(data.error || `API request failed with status ${response.status}`);
      setResults(data.results || []);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchIdioms() {
    if (!poem.trim() || results.length === 0) return;
    setIdiomsLoading(true);
    setIdiomsOpen(true);
    try {
      const langs = results.map((r) => r.language.replace(/\s*\(.*?\)/g, "").trim()).filter((l) => !l.includes("Original"));
      const response = await fetch("/api/idioms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poem, sourceLanguage: getLanguageName(sourceLanguage), targetLanguages: langs }),
      });
      const data = await response.json();
      setIdioms(data.idioms || []);
    } catch (error) {
      console.error("Idiom fetch failed:", error);
    } finally {
      setIdiomsLoading(false);
    }
  }

  function handleSpeak(text: string, langCode: string) {
    if (speakingLang === langCode) {
      window.speechSynthesis?.cancel();
      setSpeakingLang(null);
      return;
    }
    setSpeakingLang(langCode);
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = voiceLangMap[langCode] || langCode;
    utt.rate = 0.88;
    utt.onend = () => setSpeakingLang(null);
    utt.onerror = () => setSpeakingLang(null);
    window.speechSynthesis?.cancel();
    window.speechSynthesis?.speak(utt);
  }

  async function handleShareCard(result: AnalysisResult) {
    const original = results.find((r) => r.language.includes("Original")) || results[0];
    setShareCard({ result, original });
  }

  async function downloadCard() {
    if (!cardRef.current || !shareCard) return;
    try {
      // Use html2canvas if available, otherwise fallback to SVG download
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(cardRef.current, { scale: 2, useCORS: true, backgroundColor: "#f5f0e8" });
      const link = document.createElement("a");
      link.download = `verseshift-${shareCard.result.language.toLowerCase().replace(/\s+/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // Fallback: download as SVG text card
      const svg = generateCardSVG(shareCard.original, shareCard.result);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `verseshift-${shareCard.result.language.toLowerCase().replace(/\s+/g, "-")}.svg`;
      a.click(); URL.revokeObjectURL(url);
    }
  }

  function generateCardSVG(original: AnalysisResult, translated: AnalysisResult): string {
    const wrap = (text: string, maxChars = 42) => {
      const lines: string[] = [];
      text.split("\n").forEach((line) => {
        if (line.length <= maxChars) { lines.push(line); return; }
        const words = line.split(" "); let cur = "";
        words.forEach((w) => {
          if ((cur + " " + w).trim().length > maxChars) { if (cur) lines.push(cur); cur = w; }
          else cur = (cur + " " + w).trim();
        });
        if (cur) lines.push(cur);
      });
      return lines;
    };
    const origLines = wrap(original.text).slice(0, 8);
    const transLines = wrap(translated.text).slice(0, 8);
    const h = Math.max(origLines.length, transLines.length) * 22 + 220;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${h}" viewBox="0 0 800 ${h}">
  <rect width="800" height="${h}" fill="#f5f0e8"/>
  <rect x="0" y="0" width="800" height="4" fill="#8b5e3c"/>
  <text x="40" y="52" font-family="Georgia,serif" font-size="11" letter-spacing="4" fill="#9a9080" text-anchor="start">VERSESHIFT · POETRY IN TRANSLATION</text>
  <line x1="40" y1="68" x2="760" y2="68" stroke="#e8e0d0" stroke-width="1"/>
  <text x="40" y="100" font-family="Georgia,serif" font-size="22" fill="#1a1611" font-style="italic">${original.language}</text>
  <text x="420" y="100" font-family="Georgia,serif" font-size="22" fill="#8b5e3c" font-style="italic">${translated.language}</text>
  <line x1="400" y1="75" x2="400" y2="${h - 60}" stroke="#e8e0d0" stroke-width="1"/>
  ${origLines.map((l, i) => `<text x="40" y="${125 + i * 22}" font-family="Georgia,serif" font-size="13" fill="#3d3628" font-style="italic">${l.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</text>`).join("\n  ")}
  ${transLines.map((l, i) => `<text x="420" y="${125 + i * 22}" font-family="Georgia,serif" font-size="13" fill="#3d3628" font-style="italic">${l.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</text>`).join("\n  ")}
  <text x="40" y="${h - 24}" font-family="Georgia,serif" font-size="10" letter-spacing="3" fill="#9a9080">SCORE ${translated.score}/100</text>
  <text x="760" y="${h - 24}" font-family="Georgia,serif" font-size="10" letter-spacing="3" fill="#9a9080" text-anchor="end">verseshift.app</text>
</svg>`;
  }

  // ── Room functions ──────────────────────────────────────────────
  async function createRoom() {
    if (!roomDisplayName.trim()) { alert("Please enter your name."); return; }
    setRoomLoading(true); setRoomError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", displayName: roomDisplayName, preferredLanguage: roomPreferredLanguage }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create room.");
      setRoomState(data); setRoomMessageLanguage(roomPreferredLanguage); setJoinRoomCode(data.roomCode);
      const nextUrl = new URL(window.location.href); nextUrl.searchParams.set("room", data.roomCode);
      window.history.replaceState({}, "", nextUrl.toString());
    } catch (error) { setRoomError(error instanceof Error ? error.message : "Something went wrong"); }
    finally { setRoomLoading(false); }
  }

  async function joinRoom(event?: FormEvent) {
    event?.preventDefault();
    if (!roomDisplayName.trim()) { alert("Please enter your name."); return; }
    if (!joinRoomCode.trim()) { alert("Please enter a room code."); return; }
    setRoomLoading(true); setRoomError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", roomCode: joinRoomCode.trim().toUpperCase(), displayName: roomDisplayName, preferredLanguage: roomPreferredLanguage }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not join room.");
      setRoomState(data); setRoomMessageLanguage(roomPreferredLanguage);
      const nextUrl = new URL(window.location.href); nextUrl.searchParams.set("room", data.roomCode);
      window.history.replaceState({}, "", nextUrl.toString());
    } catch (error) { setRoomError(error instanceof Error ? error.message : "Something went wrong"); }
    finally { setRoomLoading(false); }
  }

  async function refreshRoom(roomCode: string, participantId: string, viewerLanguage: string) {
    try {
      const params = new URLSearchParams({ roomCode, participantId, viewerLanguage });
      const response = await fetch(`/api/rooms?${params.toString()}`, { method: "GET" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load room.");
      setRoomState(data);
    } catch (error) { console.error(error); }
  }

  async function sendRoomMessage(event: FormEvent) {
    event.preventDefault();
    if (!roomState || !roomMessage.trim()) { alert("Please enter a poem or message."); return; }
    setRoomLoading(true); setRoomError("");
    try {
      const response = await fetch("/api/rooms/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomCode: roomState.roomCode, participantId: roomState.participantId, text: roomMessage, language: roomMessageLanguage }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send message.");
      setRoomMessage("");
      await refreshRoom(roomState.roomCode, roomState.participantId, roomState.preferredLanguage);
    } catch (error) { setRoomError(error instanceof Error ? error.message : "Something went wrong"); }
    finally { setRoomLoading(false); }
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Jost:wght@200;300;400&family=Scheherazade+New:wght@400;700&display=swap');

        :root {
          --cream: #f5f0e8;
          --warm-white: #faf8f4;
          --parchment: #e8e0d0;
          --ink: #1a1611;
          --ink-light: #3d3628;
          --dust: #9a9080;
          --sienna: #8b5e3c;
          --sage: #7a8c6e;
          --line: rgba(26,22,17,0.12);
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background-color: var(--cream);
          color: var(--ink);
          font-family: 'Jost', sans-serif;
          font-weight: 300;
          letter-spacing: 0.02em;
        }

        .vs-page { min-height: 100vh; }

        /* Header */
        .vs-header {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.5rem 3rem;
          background: var(--cream);
          border-bottom: 1px solid var(--line);
        }
        .vs-wordmark { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; font-weight: 400; letter-spacing: 0.08em; color: var(--ink); text-transform: uppercase; }
        .vs-wordmark span { font-style: italic; font-weight: 300; }
        .vs-nav { display: flex; gap: 2.5rem; list-style: none; }
        .vs-nav a { font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dust); text-decoration: none; transition: color 0.2s; cursor: pointer; }
        .vs-nav a:hover, .vs-nav a.active { color: var(--ink); }

        /* Hero */
        .vs-hero { padding: 12rem 3rem 6rem; display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: end; border-bottom: 1px solid var(--line); }
        .vs-hero-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(3.5rem, 8vw, 7rem); font-weight: 300; line-height: 0.92; letter-spacing: -0.02em; color: var(--ink); }
        .vs-hero-title em { font-style: italic; color: var(--sienna); }
        .vs-hero-desc { font-size: 0.85rem; letter-spacing: 0.06em; line-height: 1.8; color: var(--dust); max-width: 28rem; align-self: end; padding-bottom: 0.5rem; }

        /* Section */
        .vs-section { padding: 5rem 3rem; border-bottom: 1px solid var(--line); }
        .vs-section-label { font-size: 0.65rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--dust); margin-bottom: 3rem; display: flex; align-items: center; gap: 1rem; }
        .vs-section-label::after { content: ''; flex: 1; height: 1px; background: var(--line); max-width: 6rem; }

        /* Mode toggle */
        .vs-mode-toggle { display: inline-flex; border: 1px solid var(--line); margin-bottom: 3rem; background: var(--warm-white); }
        .vs-mode-btn { padding: 0.65rem 1.6rem; font-family: 'Jost', sans-serif; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; background: transparent; border: none; color: var(--dust); transition: all 0.2s; }
        .vs-mode-btn.active { background: var(--ink); color: var(--cream); }

        /* Form */
        .vs-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2.5rem; }
        .vs-field label { display: block; font-size: 0.65rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dust); margin-bottom: 0.65rem; }
        .vs-input, .vs-select, .vs-textarea, .vs-file-input {
          width: 100%; background: var(--warm-white); border: 1px solid var(--line);
          color: var(--ink); font-family: 'Jost', sans-serif; font-weight: 300;
          font-size: 0.88rem; transition: border-color 0.2s; outline: none; appearance: none;
        }
        .vs-input, .vs-select, .vs-file-input { padding: 0.8rem 1rem; letter-spacing: 0.04em; }
        .vs-select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9080' stroke-width='1.2'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 1rem center; padding-right: 2.5rem; cursor: pointer; }
        .vs-textarea { padding: 1rem; resize: vertical; line-height: 1.7; font-size: 0.9rem; letter-spacing: 0.02em; }
        .vs-input:focus, .vs-select:focus, .vs-textarea:focus { border-color: var(--ink-light); }
        .vs-file-input { cursor: pointer; color: var(--dust); font-size: 0.78rem; letter-spacing: 0.06em; }
        .vs-file-input::-webkit-file-upload-button { background: var(--parchment); border: none; border-right: 1px solid var(--line); padding: 0.8rem 1rem; font-family: 'Jost', sans-serif; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-light); cursor: pointer; margin-right: 1rem; }

        /* Language chips */
        .vs-langs { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 2.5rem; }
        .vs-lang-chip { display: flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.9rem; border: 1px solid var(--line); background: var(--warm-white); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; transition: all 0.18s; color: var(--dust); user-select: none; }
        .vs-lang-chip:hover { border-color: var(--ink-light); color: var(--ink); }
        .vs-lang-chip.selected { background: var(--ink); border-color: var(--ink); color: var(--cream); }
        .vs-lang-chip input { display: none; }

        /* Buttons */
        .vs-btn { display: inline-flex; align-items: center; gap: 0.6rem; padding: 0.85rem 2.2rem; font-family: 'Jost', sans-serif; font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; cursor: pointer; border: none; transition: all 0.2s; }
        .vs-btn-primary { background: var(--ink); color: var(--cream); }
        .vs-btn-primary:hover:not(:disabled) { background: var(--ink-light); }
        .vs-btn-outline { background: transparent; border: 1px solid var(--ink); color: var(--ink); }
        .vs-btn-outline:hover:not(:disabled) { background: var(--ink); color: var(--cream); }
        .vs-btn-ghost { background: transparent; border: 1px solid var(--line); color: var(--dust); }
        .vs-btn-ghost:hover:not(:disabled) { border-color: var(--ink); color: var(--ink); }
        .vs-btn-sienna { background: transparent; border: 1px solid var(--sienna); color: var(--sienna); }
        .vs-btn-sienna:hover:not(:disabled) { background: var(--sienna); color: var(--cream); }
        .vs-btn:disabled { opacity: 0.4; cursor: default; }
        .vs-btn-sm { padding: 0.5rem 1rem; font-size: 0.62rem; }
        .vs-btn-arrow::after { content: '→'; font-style: normal; letter-spacing: 0; }

        /* Actions toolbar */
        .vs-results-toolbar { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-top: 3.5rem; margin-bottom: 1.5rem; align-items: center; padding-bottom: 1.5rem; border-bottom: 1px solid var(--line); }
        .vs-toolbar-label { font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dust); margin-right: auto; }

        /* Results grid */
        .vs-results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); }
        .vs-result-card { background: var(--warm-white); padding: 2.5rem 2rem; position: relative; }
        .vs-result-lang { font-family: 'Cormorant Garamond', serif; font-size: 1.4rem; font-weight: 400; color: var(--ink); margin-bottom: 0.35rem; }
        .vs-result-score { font-size: 0.65rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dust); margin-bottom: 1.2rem; display: flex; align-items: center; gap: 0.8rem; }
        .vs-score-bar { height: 2px; flex: 1; background: var(--parchment); max-width: 5rem; position: relative; overflow: hidden; }
        .vs-score-fill { position: absolute; top: 0; left: 0; bottom: 0; background: var(--sienna); transition: width 0.6s ease; }
        .vs-result-poem { font-family: 'Cormorant Garamond', serif; font-size: 1rem; font-weight: 300; line-height: 1.85; white-space: pre-wrap; color: var(--ink-light); font-style: italic; }
        .vs-result-poem[dir="rtl"] { font-family: 'Scheherazade New', 'Noto Naskh Arabic', 'Arial Unicode MS', serif; font-size: 1.15rem; font-style: normal; text-align: right; unicode-bidi: embed; direction: rtl; line-height: 2.2; }
        .vs-result-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
        .vs-result-warnings { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--line); }
        .vs-warnings-title { font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dust); margin-bottom: 0.8rem; }
        .vs-warnings-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
        .vs-warnings-list li { font-size: 0.8rem; color: var(--ink-light); line-height: 1.5; padding-left: 0.8rem; border-left: 2px solid var(--sienna); opacity: 0.8; }
        .vs-meaning-list li { border-left-color: var(--sage); }

        /* Audio button state */
        .vs-btn-speaking { background: var(--sienna) !important; color: var(--cream) !important; border-color: var(--sienna) !important; }

        /* Idiom panel */
        .vs-idiom-panel { margin-top: 2.5rem; border: 1px solid var(--line); background: var(--warm-white); }
        .vs-idiom-header { display: flex; align-items: center; justify-content: space-between; padding: 1.5rem 2rem; border-bottom: 1px solid var(--line); cursor: pointer; }
        .vs-idiom-title { font-family: 'Cormorant Garamond', serif; font-size: 1.2rem; font-weight: 400; color: var(--ink); }
        .vs-idiom-toggle { font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--dust); }
        .vs-idiom-body { padding: 2rem; display: flex; flex-direction: column; gap: 2rem; }
        .vs-idiom-card { padding: 1.5rem; border: 1px solid var(--line); background: var(--cream); }
        .vs-idiom-phrase { font-family: 'Cormorant Garamond', serif; font-size: 1.1rem; font-style: italic; color: var(--ink); margin-bottom: 0.4rem; }
        .vs-idiom-meaning { font-size: 0.78rem; color: var(--dust); letter-spacing: 0.04em; margin-bottom: 1rem; line-height: 1.6; }
        .vs-idiom-equivalents { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 0.8rem; margin-bottom: 1rem; }
        .vs-idiom-eq { padding: 0.7rem 1rem; background: var(--warm-white); border: 1px solid var(--line); }
        .vs-idiom-eq-lang { font-size: 0.58rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dust); margin-bottom: 0.3rem; }
        .vs-idiom-eq-text { font-family: 'Cormorant Garamond', serif; font-size: 0.95rem; font-style: italic; color: var(--ink-light); }
        .vs-idiom-note { font-size: 0.72rem; color: var(--dust); border-left: 2px solid var(--sage); padding-left: 0.8rem; line-height: 1.5; }
        .vs-idiom-empty { padding: 2rem; text-align: center; font-family: 'Cormorant Garamond', serif; font-style: italic; color: var(--dust); font-size: 1rem; }

        /* Share card modal */
        .vs-modal-backdrop { position: fixed; inset: 0; background: rgba(26,22,17,0.6); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 2rem; }
        .vs-modal { background: var(--cream); max-width: 760px; width: 100%; max-height: 90vh; overflow-y: auto; }
        .vs-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.5rem 2rem; border-bottom: 1px solid var(--line); }
        .vs-modal-title { font-family: 'Cormorant Garamond', serif; font-size: 1.2rem; font-weight: 400; color: var(--ink); }
        .vs-modal-close { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--dust); padding: 0.2rem 0.5rem; }
        .vs-modal-body { padding: 2rem; }
        .vs-modal-actions { display: flex; gap: 1rem; padding: 1.5rem 2rem; border-top: 1px solid var(--line); }

        /* Poem card (shareable) */
        .vs-poem-card { background: var(--cream); border: 1px solid var(--parchment); padding: 3rem 2.5rem; position: relative; }
        .vs-poem-card-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--sienna); }
        .vs-poem-card-header { font-size: 0.6rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--dust); margin-bottom: 1.5rem; }
        .vs-poem-card-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5rem; }
        .vs-poem-card-col-label { font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dust); margin-bottom: 0.8rem; }
        .vs-poem-card-text { font-family: 'Cormorant Garamond', serif; font-size: 1rem; font-style: italic; font-weight: 300; line-height: 1.85; white-space: pre-wrap; color: var(--ink-light); }
        .vs-poem-card-text[dir="rtl"] { font-family: 'Scheherazade New', 'Noto Naskh Arabic', 'Arial Unicode MS', serif; font-size: 1.1rem; font-style: normal; text-align: right; unicode-bidi: embed; direction: rtl; line-height: 2.2; }
        .vs-poem-card-footer { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }
        .vs-poem-card-score { font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dust); }
        .vs-poem-card-brand { font-family: 'Cormorant Garamond', serif; font-size: 0.85rem; font-style: italic; color: var(--dust); }

        /* Room */
        .vs-room-intro { max-width: 36rem; margin-bottom: 4rem; }
        .vs-room-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(2rem, 5vw, 3.2rem); font-weight: 300; line-height: 1.1; margin-bottom: 1rem; color: var(--ink); }
        .vs-room-title em { font-style: italic; color: var(--sienna); }
        .vs-room-desc { font-size: 0.82rem; letter-spacing: 0.04em; line-height: 1.8; color: var(--dust); }
        .vs-room-setup { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 3rem; }
        .vs-room-actions { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 3rem; }
        .vs-divider { display: flex; align-items: center; gap: 1.5rem; font-size: 0.65rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dust); margin: 2.5rem 0; }
        .vs-divider::before, .vs-divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
        .vs-join-form { display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: end; background: var(--warm-white); border: 1px solid var(--line); padding: 2rem; max-width: 42rem; }
        .vs-room-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); margin-bottom: 2.5rem; }
        .vs-room-meta-item { background: var(--warm-white); padding: 1.5rem 1.8rem; }
        .vs-meta-label { font-size: 0.6rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--dust); margin-bottom: 0.4rem; }
        .vs-meta-value { font-family: 'Cormorant Garamond', serif; font-size: 1.3rem; font-weight: 400; color: var(--ink); }
        .vs-share-link { background: var(--warm-white); border: 1px solid var(--line); padding: 1.2rem 1.8rem; margin-bottom: 3rem; display: flex; align-items: center; gap: 1.5rem; }
        .vs-share-label { font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dust); white-space: nowrap; }
        .vs-share-url { font-size: 0.8rem; color: var(--ink-light); word-break: break-all; line-height: 1.4; }
        .vs-message-form { display: grid; grid-template-columns: 1fr 240px; gap: 2rem; margin-bottom: 4rem; align-items: start; }
        .vs-message-sidebar { display: flex; flex-direction: column; gap: 1.5rem; }
        .vs-messages { display: flex; flex-direction: column; gap: 1px; background: var(--line); border: 1px solid var(--line); }
        .vs-message { background: var(--warm-white); padding: 2.5rem 2rem; }
        .vs-message-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
        .vs-sender { font-family: 'Cormorant Garamond', serif; font-size: 1.2rem; font-weight: 400; color: var(--ink); }
        .vs-sender-sub { font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--dust); margin-top: 0.2rem; }
        .vs-message-time { font-size: 0.65rem; letter-spacing: 0.08em; color: var(--dust); white-space: nowrap; }
        .vs-message-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
        .vs-message-col-label { font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dust); margin-bottom: 0.8rem; }
        .vs-message-text { font-family: 'Cormorant Garamond', serif; font-size: 1rem; font-style: italic; font-weight: 300; line-height: 1.85; white-space: pre-wrap; color: var(--ink-light); background: var(--cream); padding: 1.2rem 1.4rem; }
        .vs-message-text[dir="rtl"] { font-family: 'Scheherazade New', 'Noto Naskh Arabic', 'Arial Unicode MS', serif; font-size: 1.1rem; font-style: normal; text-align: right; unicode-bidi: embed; direction: rtl; line-height: 2.2; }
        .vs-empty { padding: 5rem 2rem; text-align: center; font-family: 'Cormorant Garamond', serif; font-size: 1.2rem; font-style: italic; color: var(--dust); background: var(--warm-white); border: 1px dashed var(--line); }
        .vs-error { font-size: 0.78rem; color: #8b2e2e; letter-spacing: 0.04em; margin-top: 1rem; padding: 0.8rem 1rem; border-left: 2px solid #8b2e2e; background: #fdf5f5; }
        .vs-loading-spinner { display: inline-block; width: 0.7rem; height: 0.7rem; border: 1px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .vs-footer { padding: 3rem; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--line); }
        .vs-footer-word { font-family: 'Cormorant Garamond', serif; font-size: 0.9rem; font-style: italic; color: var(--dust); }
        .vs-footer-copy { font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--dust); }

        @media (max-width: 768px) {
          .vs-form-grid, .vs-room-setup, .vs-message-form { grid-template-columns: 1fr; }
          .vs-hero { grid-template-columns: 1fr; padding: 9rem 1.5rem 4rem; }
          .vs-header { padding: 1.2rem 1.5rem; }
          .vs-section { padding: 3.5rem 1.5rem; }
          .vs-nav { gap: 1.5rem; }
          .vs-poem-card-cols { grid-template-columns: 1fr; }
          .vs-room-meta { grid-template-columns: 1fr; }
          .vs-message-cols { grid-template-columns: 1fr; }
          .vs-join-form { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="vs-page">
        {/* Header */}
        <header className="vs-header">
          <div className="vs-wordmark">Verse<span>Shift</span></div>
          <nav>
            <ul className="vs-nav">
              <li><a href="#analyse" className="active">Analyse</a></li>
              <li><a href="#penpal">Penpal</a></li>
            </ul>
          </nav>
        </header>

        {/* Hero */}
        <section className="vs-hero">
          <h1 className="vs-hero-title">Poetry<br /><em>Across</em><br />Languages</h1>
          <p className="vs-hero-desc">
            Explore how verse transforms across tongues — its rhythm, shape, and soul shifting
            with each translation. A study in linguistic drift and poetic preservation.
          </p>
        </section>

        {/* ── Analyse ── */}
        <section id="analyse" className="vs-section">
          <div className="vs-section-label">01 — Analysis</div>

          <div className="vs-mode-toggle">
            <button className={`vs-mode-btn ${mode === "auto" ? "active" : ""}`} onClick={() => setMode("auto")}>Auto Translate</button>
            <button className={`vs-mode-btn ${mode === "manual" ? "active" : ""}`} onClick={() => setMode("manual")}>Compare Translation</button>
          </div>

          <div className="vs-form-grid">
            <div className="vs-field">
              <label>Source Language</label>
              <select className="vs-select" value={sourceLanguage} onChange={(e) => {
                const v = e.target.value; setSourceLanguage(v);
                if (manualTargetLanguage === v) setManualTargetLanguage(languageOptions.find(l => l.code !== v)?.code || "de");
                setTargetLanguages(prev => prev.filter(l => l !== v));
              }}>
                {languageOptions.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
            {mode === "auto" ? (
              <div className="vs-field">
                <label>Upload Poem (.txt)</label>
                <input type="file" accept=".txt,text/plain" onChange={handleFileUpload} className="vs-file-input" />
              </div>
            ) : (
              <div className="vs-field">
                <label>Translation Language</label>
                <select className="vs-select" value={manualTargetLanguage} onChange={(e) => setManualTargetLanguage(e.target.value)}>
                  {languageOptions.filter((l) => l.code !== sourceLanguage).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="vs-field" style={{ marginBottom: "2rem" }}>
            <label>Original Poem</label>
            <textarea value={poem} onChange={(e) => setPoem(e.target.value)} placeholder="Paste the original verse here…" rows={12} className="vs-textarea" />
          </div>

          {mode === "manual" && (
            <div className="vs-field" style={{ marginBottom: "2rem" }}>
              <label>Existing Translation</label>
              <textarea value={existingTranslation} onChange={(e) => setExistingTranslation(e.target.value)} placeholder="Paste the translation to compare…" rows={12} className="vs-textarea" />
            </div>
          )}

          {mode === "auto" && (
            <div style={{ marginBottom: "2.5rem" }}>
              <div className="vs-section-label" style={{ marginBottom: "1rem" }}>Comparison Languages</div>
              <div className="vs-langs">
                {languageOptions.filter((l) => l.code !== sourceLanguage).map((l) => (
                  <label key={l.code} className={`vs-lang-chip ${targetLanguages.includes(l.code) ? "selected" : ""}`}>
                    <input type="checkbox" checked={targetLanguages.includes(l.code)} onChange={() => handleTargetLanguageChange(l.code)} />
                    {l.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <button onClick={handleAnalyze} disabled={loading} className="vs-btn vs-btn-primary vs-btn-arrow">
            {loading ? <><span className="vs-loading-spinner" /> Analysing</> : mode === "auto" ? "Analyse Poem" : "Compare Translation"}
          </button>

          {/* Results */}
          {results.length > 0 && (
            <>
              {/* Toolbar */}
              <div className="vs-results-toolbar">
                <span className="vs-toolbar-label">{results.length} version{results.length !== 1 ? "s" : ""}</span>
                <button onClick={() => downloadAllPoems(results)} className="vs-btn vs-btn-ghost vs-btn-sm">
                  ↓ Download All
                </button>
                <button onClick={handleFetchIdioms} disabled={idiomsLoading} className="vs-btn vs-btn-sienna vs-btn-sm">
                  {idiomsLoading ? <><span className="vs-loading-spinner" /> Finding Idioms</> : "✦ Idiom Equivalence"}
                </button>
              </div>

              <div className="vs-results-grid">
                {results.map((result) => {
                  const langCode = getLangCode(result.language);
                  const isSpeaking = speakingLang === result.language;
                  const isOriginal = result.language.includes("Original");
                  return (
                    <div key={result.language} className="vs-result-card">
                      <div className="vs-result-lang">{result.language}</div>
                      <div className="vs-result-score">
                        <span>Score {result.score}/100</span>
                        <div className="vs-score-bar"><div className="vs-score-fill" style={{ width: `${result.score}%` }} /></div>
                      </div>

                      {/* Per-card actions */}
                      <div className="vs-result-actions">
                        <button
                          onClick={() => handleSpeak(result.text, langCode)}
                          className={`vs-btn vs-btn-ghost vs-btn-sm ${isSpeaking ? "vs-btn-speaking" : ""}`}
                          title={isSpeaking ? "Stop audio" : "Listen to poem"}
                        >
                          {isSpeaking ? "◼ Stop" : "▶ Listen"}
                        </button>
                        <button onClick={() => downloadText(`${result.language.toLowerCase().replace(/\s+/g, "-")}.txt`, result.text)} className="vs-btn vs-btn-ghost vs-btn-sm" title="Download this translation">
                          ↓ Save
                        </button>
                        {!isOriginal && (
                          <button onClick={() => handleShareCard(result)} className="vs-btn vs-btn-ghost vs-btn-sm" title="Share as image card">
                            ✦ Share Card
                          </button>
                        )}
                      </div>

                      <div className="vs-result-poem" dir={["ar", "ur"].includes(langCode) ? "rtl" : "ltr"}>
                        {result.text}
                      </div>

                      {result.warnings.length > 0 && (
                        <div className="vs-result-warnings">
                          <div className="vs-warnings-title">Structural Warnings</div>
                          <ul className="vs-warnings-list">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                        </div>
                      )}
                      {result.meaningWarnings.length > 0 && (
                        <div className="vs-result-warnings">
                          <div className="vs-warnings-title">Meaning Shifts</div>
                          <ul className="vs-warnings-list vs-meaning-list">{result.meaningWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Idiom Panel */}
              {idiomsOpen && (
                <div className="vs-idiom-panel">
                  <div className="vs-idiom-header" onClick={() => setIdiomsOpen(!idiomsOpen)}>
                    <span className="vs-idiom-title">Cultural Idiom Equivalence</span>
                    <span className="vs-idiom-toggle">{idiomsOpen ? "Collapse ↑" : "Expand ↓"}</span>
                  </div>
                  <div className="vs-idiom-body">
                    {idiomsLoading ? (
                      <div className="vs-idiom-empty"><span className="vs-loading-spinner" style={{ marginRight: "0.5rem" }} />Analysing cultural phrases…</div>
                    ) : idioms.length === 0 ? (
                      <div className="vs-idiom-empty">No distinct idioms or culturally-specific phrases detected.</div>
                    ) : idioms.map((idiom, i) => (
                      <div key={i} className="vs-idiom-card">
                        <div className="vs-idiom-phrase">"{idiom.original}"</div>
                        <div className="vs-idiom-meaning">{idiom.meaning}</div>
                        <div className="vs-idiom-equivalents">
                          {Object.entries(idiom.equivalents).map(([lang, eq]) => (
                            <div key={lang} className="vs-idiom-eq">
                              <div className="vs-idiom-eq-lang">{lang}</div>
                              <div className="vs-idiom-eq-text">{eq}</div>
                            </div>
                          ))}
                        </div>
                        {idiom.notes && <div className="vs-idiom-note">{idiom.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Penpal ── */}
        <section id="penpal" className="vs-section">
          <div className="vs-section-label">02 — Poetry Penpal</div>
          <div className="vs-room-intro">
            <h2 className="vs-room-title">Share Verse<br /><em>Across Borders</em></h2>
            <p className="vs-room-desc">Create a shared room to exchange poems with someone in another language. Each message is translated privately into your preferred reading tongue.</p>
          </div>

          {!roomState ? (
            <>
              <div className="vs-room-setup">
                <div className="vs-field">
                  <label>Your Name</label>
                  <input className="vs-input" value={roomDisplayName} onChange={(e) => setRoomDisplayName(e.target.value)} placeholder="Enter your name" />
                </div>
                <div className="vs-field">
                  <label>Preferred Reading Language</label>
                  <select className="vs-select" value={roomPreferredLanguage} onChange={(e) => { setRoomPreferredLanguage(e.target.value); setRoomMessageLanguage(e.target.value); }}>
                    {languageOptions.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="vs-room-actions">
                <button onClick={createRoom} disabled={roomLoading} className="vs-btn vs-btn-primary vs-btn-arrow">
                  {roomLoading ? <><span className="vs-loading-spinner" /> Working…</> : "Create Room"}
                </button>
              </div>
              <div className="vs-divider">or join existing</div>
              <form onSubmit={joinRoom} className="vs-join-form">
                <div className="vs-field">
                  <label>Room Code</label>
                  <input className="vs-input" value={joinRoomCode} onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())} placeholder="Enter code" />
                </div>
                <button type="submit" disabled={roomLoading} className="vs-btn vs-btn-outline">Join Room</button>
              </form>
            </>
          ) : (
            <>
              <div className="vs-room-meta">
                <div className="vs-room-meta-item"><div className="vs-meta-label">Room Code</div><div className="vs-meta-value">{roomState.roomCode}</div></div>
                <div className="vs-room-meta-item"><div className="vs-meta-label">You are</div><div className="vs-meta-value">{roomState.displayName}</div></div>
                <div className="vs-room-meta-item"><div className="vs-meta-label">Reading in</div><div className="vs-meta-value">{getLanguageName(roomState.preferredLanguage)}</div></div>
              </div>
              {roomShareLink && (
                <div className="vs-share-link">
                  <span className="vs-share-label">Share</span>
                  <span className="vs-share-url">{roomShareLink}</span>
                </div>
              )}
              <form onSubmit={sendRoomMessage} className="vs-message-form">
                <div className="vs-field">
                  <label>Your Poem or Message</label>
                  <textarea className="vs-textarea" value={roomMessage} onChange={(e) => setRoomMessage(e.target.value)} placeholder="Write a verse to share…" rows={7} />
                </div>
                <div className="vs-message-sidebar">
                  <div className="vs-field">
                    <label>Written in</label>
                    <select className="vs-select" value={roomMessageLanguage} onChange={(e) => setRoomMessageLanguage(e.target.value)}>
                      {languageOptions.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                    </select>
                  </div>
                  <button type="submit" disabled={roomLoading} className="vs-btn vs-btn-primary vs-btn-arrow" style={{ width: "100%", justifyContent: "center" }}>
                    {roomLoading ? <><span className="vs-loading-spinner" /> Sending…</> : "Send"}
                  </button>
                </div>
              </form>
              {roomState.messages.length === 0 ? (
                <div className="vs-empty">No verses shared yet — be the first to write.</div>
              ) : (
                <div className="vs-messages">
                  {roomState.messages.map((message) => (
                    <div key={message.id} className="vs-message">
                      <div className="vs-message-header">
                        <div>
                          <div className="vs-sender">{message.senderName}</div>
                          <div className="vs-sender-sub">Original · {getLanguageName(message.originalLanguage)}</div>
                        </div>
                        <div className="vs-message-time">{new Date(message.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="vs-message-cols">
                        <div>
                          <div className="vs-message-col-label">Original</div>
                          <div className="vs-message-text" dir={["ar", "ur"].includes(message.originalLanguage) ? "rtl" : "ltr"}>{message.originalText}</div>
                        </div>
                        <div>
                          <div className="vs-message-col-label">In {getLanguageName(message.translatedLanguage)}</div>
                          <div className="vs-message-text" dir={["ar", "ur"].includes(message.translatedLanguage) ? "rtl" : "ltr"}>{message.translatedText}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {roomError && <div className="vs-error">{roomError}</div>}
        </section>

        {/* Footer */}
        <footer className="vs-footer">
          <span className="vs-footer-word">VerseShift</span>
          <span className="vs-footer-copy">Poetry in translation</span>
        </footer>
      </div>

      {/* ── Share Card Modal ── */}
      {shareCard && (
        <div className="vs-modal-backdrop" onClick={() => setShareCard(null)}>
          <div className="vs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vs-modal-header">
              <span className="vs-modal-title">Share Card — {shareCard.result.language}</span>
              <button className="vs-modal-close" onClick={() => setShareCard(null)}>✕</button>
            </div>
            <div className="vs-modal-body">
              <div className="vs-poem-card" ref={cardRef}>
                <div className="vs-poem-card-accent" />
                <div className="vs-poem-card-header">VerseShift · Poetry in Translation</div>
                <div className="vs-poem-card-cols">
                  <div>
                    <div className="vs-poem-card-col-label">{shareCard.original.language}</div>
                    <div className="vs-poem-card-text" dir={["ar", "ur"].includes(getLangCode(shareCard.original.language)) ? "rtl" : "ltr"}>{shareCard.original.text}</div>
                  </div>
                  <div>
                    <div className="vs-poem-card-col-label">{shareCard.result.language}</div>
                    <div className="vs-poem-card-text" dir={["ar", "ur"].includes(getLangCode(shareCard.result.language)) ? "rtl" : "ltr"}>
                      {shareCard.result.text}
                    </div>
                  </div>
                </div>
                <div className="vs-poem-card-footer">
                  <span className="vs-poem-card-score">Translation score {shareCard.result.score}/100</span>
                  <span className="vs-poem-card-brand">VerseShift</span>
                </div>
              </div>
            </div>
            <div className="vs-modal-actions">
              <button onClick={downloadCard} className="vs-btn vs-btn-primary">
                ↓ Download Image
              </button>
              <button onClick={() => setShareCard(null)} className="vs-btn vs-btn-ghost">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}