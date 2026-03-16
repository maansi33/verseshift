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
        headers: { "Content-Type": "application/json" },
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
      if (!rawText || !rawText.trim()) throw new Error("Server returned an empty response");
      const data = JSON.parse(rawText);
      if (!response.ok) throw new Error(data.error || `API request failed with status ${response.status}`);
      setResults(data.results || []);
    } catch (error) {
      console.error("Failed to analyze poem:", error);
      alert(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function createRoom() {
    if (!roomDisplayName.trim()) { alert("Please enter your name."); return; }
    setRoomLoading(true);
    setRoomError("");
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", displayName: roomDisplayName, preferredLanguage: roomPreferredLanguage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create room.");
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
    if (!roomDisplayName.trim()) { alert("Please enter your name."); return; }
    if (!joinRoomCode.trim()) { alert("Please enter a room code."); return; }
    setRoomLoading(true);
    setRoomError("");
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", roomCode: joinRoomCode.trim().toUpperCase(), displayName: roomDisplayName, preferredLanguage: roomPreferredLanguage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not join room.");
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

  async function refreshRoom(roomCode: string, participantId: string, viewerLanguage: string) {
    try {
      const params = new URLSearchParams({ roomCode, participantId, viewerLanguage });
      const response = await fetch(`/api/rooms?${params.toString()}`, { method: "GET" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load room.");
      setRoomState(data);
    } catch (error) {
      console.error(error);
    }
  }

  async function sendRoomMessage(event: FormEvent) {
    event.preventDefault();
    if (!roomState) return;
    if (!roomMessage.trim()) { alert("Please enter a poem or message."); return; }
    setRoomLoading(true);
    setRoomError("");
    try {
      const response = await fetch("/api/rooms/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: roomState.roomCode, participantId: roomState.participantId, text: roomMessage, language: roomMessageLanguage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send message.");
      setRoomMessage("");
      await refreshRoom(roomState.roomCode, roomState.participantId, roomState.preferredLanguage);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setRoomLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Jost:wght@200;300;400&display=swap');

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

        .vs-page {
          min-height: 100vh;
        }

        /* ── Header ── */
        .vs-header {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 3rem;
          background: var(--cream);
          border-bottom: 1px solid var(--line);
        }

        .vs-wordmark {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.5rem;
          font-weight: 400;
          letter-spacing: 0.08em;
          color: var(--ink);
          text-transform: uppercase;
        }

        .vs-wordmark span {
          font-style: italic;
          font-weight: 300;
        }

        .vs-nav {
          display: flex;
          gap: 2.5rem;
          list-style: none;
        }

        .vs-nav a {
          font-size: 0.7rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--dust);
          text-decoration: none;
          transition: color 0.2s;
          cursor: pointer;
        }

        .vs-nav a:hover,
        .vs-nav a.active {
          color: var(--ink);
        }

        /* ── Hero ── */
        .vs-hero {
          padding: 12rem 3rem 6rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: end;
          border-bottom: 1px solid var(--line);
        }

        .vs-hero-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(3.5rem, 8vw, 7rem);
          font-weight: 300;
          line-height: 0.92;
          letter-spacing: -0.02em;
          color: var(--ink);
        }

        .vs-hero-title em {
          font-style: italic;
          color: var(--sienna);
        }

        .vs-hero-desc {
          font-size: 0.85rem;
          letter-spacing: 0.06em;
          line-height: 1.8;
          color: var(--dust);
          max-width: 28rem;
          align-self: end;
          padding-bottom: 0.5rem;
        }

        /* ── Section layout ── */
        .vs-section {
          padding: 5rem 3rem;
          border-bottom: 1px solid var(--line);
        }

        .vs-section-label {
          font-size: 0.65rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--dust);
          margin-bottom: 3rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .vs-section-label::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--line);
          max-width: 6rem;
        }

        /* ── Mode Toggle ── */
        .vs-mode-toggle {
          display: inline-flex;
          border: 1px solid var(--line);
          margin-bottom: 3rem;
          background: var(--warm-white);
        }

        .vs-mode-btn {
          padding: 0.65rem 1.6rem;
          font-family: 'Jost', sans-serif;
          font-size: 0.68rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          background: transparent;
          border: none;
          color: var(--dust);
          transition: all 0.2s;
        }

        .vs-mode-btn.active {
          background: var(--ink);
          color: var(--cream);
        }

        /* ── Form Grid ── */
        .vs-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-bottom: 2.5rem;
        }

        @media (max-width: 768px) {
          .vs-form-grid { grid-template-columns: 1fr; }
          .vs-hero { grid-template-columns: 1fr; padding: 9rem 1.5rem 4rem; }
          .vs-header { padding: 1.2rem 1.5rem; }
          .vs-section { padding: 3.5rem 1.5rem; }
          .vs-nav { gap: 1.5rem; }
        }

        /* ── Field ── */
        .vs-field label {
          display: block;
          font-size: 0.65rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--dust);
          margin-bottom: 0.65rem;
        }

        .vs-input,
        .vs-select,
        .vs-textarea,
        .vs-file-input {
          width: 100%;
          background: var(--warm-white);
          border: 1px solid var(--line);
          color: var(--ink);
          font-family: 'Jost', sans-serif;
          font-weight: 300;
          font-size: 0.88rem;
          transition: border-color 0.2s;
          outline: none;
          appearance: none;
        }

        .vs-input, .vs-select, .vs-file-input {
          padding: 0.8rem 1rem;
          letter-spacing: 0.04em;
        }

        .vs-select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9080' stroke-width='1.2'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 1rem center;
          padding-right: 2.5rem;
          cursor: pointer;
        }

        .vs-textarea {
          padding: 1rem;
          resize: vertical;
          line-height: 1.7;
          font-size: 0.9rem;
          letter-spacing: 0.02em;
        }

        .vs-input:focus,
        .vs-select:focus,
        .vs-textarea:focus {
          border-color: var(--ink-light);
        }

        .vs-file-input {
          cursor: pointer;
          color: var(--dust);
          font-size: 0.78rem;
          letter-spacing: 0.06em;
        }

        .vs-file-input::-webkit-file-upload-button {
          background: var(--parchment);
          border: none;
          border-right: 1px solid var(--line);
          padding: 0.8rem 1rem;
          font-family: 'Jost', sans-serif;
          font-size: 0.68rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-light);
          cursor: pointer;
          margin-right: 1rem;
        }

        /* ── Language checkboxes ── */
        .vs-langs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-bottom: 2.5rem;
        }

        .vs-lang-chip {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.45rem 0.9rem;
          border: 1px solid var(--line);
          background: var(--warm-white);
          font-size: 0.7rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.18s;
          color: var(--dust);
          user-select: none;
        }

        .vs-lang-chip:hover {
          border-color: var(--ink-light);
          color: var(--ink);
        }

        .vs-lang-chip.selected {
          background: var(--ink);
          border-color: var(--ink);
          color: var(--cream);
        }

        .vs-lang-chip input {
          display: none;
        }

        /* ── Buttons ── */
        .vs-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.85rem 2.2rem;
          font-family: 'Jost', sans-serif;
          font-size: 0.7rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }

        .vs-btn-primary {
          background: var(--ink);
          color: var(--cream);
        }

        .vs-btn-primary:hover:not(:disabled) {
          background: var(--ink-light);
        }

        .vs-btn-outline {
          background: transparent;
          border: 1px solid var(--ink);
          color: var(--ink);
        }

        .vs-btn-outline:hover:not(:disabled) {
          background: var(--ink);
          color: var(--cream);
        }

        .vs-btn:disabled {
          opacity: 0.4;
          cursor: default;
        }

        .vs-btn-arrow::after {
          content: '→';
          font-style: normal;
          letter-spacing: 0;
        }

        /* ── Results ── */
        .vs-results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
          gap: 1px;
          background: var(--line);
          margin-top: 4rem;
          border: 1px solid var(--line);
        }

        .vs-result-card {
          background: var(--warm-white);
          padding: 2.5rem 2rem;
          position: relative;
        }

        .vs-result-lang {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.4rem;
          font-weight: 400;
          color: var(--ink);
          margin-bottom: 0.35rem;
        }

        .vs-result-score {
          font-size: 0.65rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--dust);
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          gap: 0.8rem;
        }

        .vs-score-bar {
          height: 2px;
          flex: 1;
          background: var(--parchment);
          max-width: 5rem;
          position: relative;
          overflow: hidden;
        }

        .vs-score-fill {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          background: var(--sienna);
          transition: width 0.6s ease;
        }

        .vs-result-poem {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1rem;
          font-weight: 300;
          line-height: 1.85;
          white-space: pre-wrap;
          color: var(--ink-light);
          font-style: italic;
        }

        .vs-result-warnings {
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--line);
        }

        .vs-warnings-title {
          font-size: 0.62rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--dust);
          margin-bottom: 0.8rem;
        }

        .vs-warnings-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .vs-warnings-list li {
          font-size: 0.8rem;
          color: var(--ink-light);
          line-height: 1.5;
          padding-left: 0.8rem;
          border-left: 2px solid var(--sienna);
          opacity: 0.8;
        }

        .vs-meaning-list li {
          border-left-color: var(--sage);
        }

        /* ── Penpal Room ── */
        .vs-room-intro {
          max-width: 36rem;
          margin-bottom: 4rem;
        }

        .vs-room-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(2rem, 5vw, 3.2rem);
          font-weight: 300;
          line-height: 1.1;
          margin-bottom: 1rem;
          color: var(--ink);
        }

        .vs-room-title em {
          font-style: italic;
          color: var(--sienna);
        }

        .vs-room-desc {
          font-size: 0.82rem;
          letter-spacing: 0.04em;
          line-height: 1.8;
          color: var(--dust);
        }

        /* ── Room setup ── */
        .vs-room-setup {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-bottom: 3rem;
        }

        @media (max-width: 768px) {
          .vs-room-setup { grid-template-columns: 1fr; }
        }

        .vs-room-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 3rem;
        }

        .vs-divider {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          font-size: 0.65rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--dust);
          margin: 2.5rem 0;
        }

        .vs-divider::before,
        .vs-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--line);
        }

        .vs-join-form {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 1rem;
          align-items: end;
          background: var(--warm-white);
          border: 1px solid var(--line);
          padding: 2rem;
          max-width: 42rem;
        }

        @media (max-width: 500px) {
          .vs-join-form { grid-template-columns: 1fr; }
        }

        /* ── Active Room ── */
        .vs-room-meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: var(--line);
          border: 1px solid var(--line);
          margin-bottom: 2.5rem;
        }

        @media (max-width: 600px) {
          .vs-room-meta { grid-template-columns: 1fr; }
        }

        .vs-room-meta-item {
          background: var(--warm-white);
          padding: 1.5rem 1.8rem;
        }

        .vs-meta-label {
          font-size: 0.6rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--dust);
          margin-bottom: 0.4rem;
        }

        .vs-meta-value {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.3rem;
          font-weight: 400;
          color: var(--ink);
        }

        .vs-share-link {
          background: var(--warm-white);
          border: 1px solid var(--line);
          padding: 1.2rem 1.8rem;
          margin-bottom: 3rem;
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .vs-share-label {
          font-size: 0.62rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--dust);
          white-space: nowrap;
        }

        .vs-share-url {
          font-size: 0.8rem;
          color: var(--ink-light);
          word-break: break-all;
          line-height: 1.4;
        }

        /* ── Message form ── */
        .vs-message-form {
          display: grid;
          grid-template-columns: 1fr 240px;
          gap: 2rem;
          margin-bottom: 4rem;
          align-items: start;
        }

        @media (max-width: 700px) {
          .vs-message-form { grid-template-columns: 1fr; }
        }

        .vs-message-sidebar {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* ── Messages feed ── */
        .vs-messages {
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--line);
          border: 1px solid var(--line);
        }

        .vs-message {
          background: var(--warm-white);
          padding: 2.5rem 2rem;
        }

        .vs-message-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .vs-sender {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.2rem;
          font-weight: 400;
          color: var(--ink);
        }

        .vs-sender-sub {
          font-size: 0.65rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--dust);
          margin-top: 0.2rem;
        }

        .vs-message-time {
          font-size: 0.65rem;
          letter-spacing: 0.08em;
          color: var(--dust);
          white-space: nowrap;
        }

        .vs-message-cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
        }

        @media (max-width: 600px) {
          .vs-message-cols { grid-template-columns: 1fr; }
        }

        .vs-message-col-label {
          font-size: 0.62rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--dust);
          margin-bottom: 0.8rem;
        }

        .vs-message-text {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1rem;
          font-style: italic;
          font-weight: 300;
          line-height: 1.85;
          white-space: pre-wrap;
          color: var(--ink-light);
          background: var(--cream);
          padding: 1.2rem 1.4rem;
        }

        .vs-empty {
          padding: 5rem 2rem;
          text-align: center;
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.2rem;
          font-style: italic;
          color: var(--dust);
          background: var(--warm-white);
          border: 1px dashed var(--line);
        }

        .vs-error {
          font-size: 0.78rem;
          color: #8b2e2e;
          letter-spacing: 0.04em;
          margin-top: 1rem;
          padding: 0.8rem 1rem;
          border-left: 2px solid #8b2e2e;
          background: #fdf5f5;
        }

        .vs-loading-spinner {
          display: inline-block;
          width: 0.7rem;
          height: 0.7rem;
          border: 1px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .vs-footer {
          padding: 3rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid var(--line);
        }

        .vs-footer-word {
          font-family: 'Cormorant Garamond', serif;
          font-size: 0.9rem;
          font-style: italic;
          color: var(--dust);
        }

        .vs-footer-copy {
          font-size: 0.65rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--dust);
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
          <h1 className="vs-hero-title">
            Poetry<br />
            <em>Across</em><br />
            Languages
          </h1>
          <p className="vs-hero-desc">
            Explore how verse transforms across tongues — its rhythm, shape,
            and soul shifting with each translation. A study in linguistic drift
            and poetic preservation.
          </p>
        </section>

        {/* ── Analyse Section ── */}
        <section id="analyse" className="vs-section">
          <div className="vs-section-label">01 — Analysis</div>

          {/* Mode toggle */}
          <div className="vs-mode-toggle">
            <button
              className={`vs-mode-btn ${mode === "auto" ? "active" : ""}`}
              onClick={() => setMode("auto")}
            >
              Auto Translate
            </button>
            <button
              className={`vs-mode-btn ${mode === "manual" ? "active" : ""}`}
              onClick={() => setMode("manual")}
            >
              Compare Translation
            </button>
          </div>

          {/* Source language + file */}
          <div className="vs-form-grid">
            <div className="vs-field">
              <label>Source Language</label>
              <select
                className="vs-select"
                value={sourceLanguage}
                onChange={(e) => {
                  const v = e.target.value;
                  setSourceLanguage(v);
                  if (manualTargetLanguage === v) {
                    const fallback = languageOptions.find(l => l.code !== v)?.code || "de";
                    setManualTargetLanguage(fallback);
                  }
                  setTargetLanguages(prev => prev.filter(l => l !== v));
                }}
              >
                {languageOptions.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
            </div>

            {mode === "auto" ? (
              <div className="vs-field">
                <label>Upload Poem (.txt)</label>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleFileUpload}
                  className="vs-file-input"
                />
              </div>
            ) : (
              <div className="vs-field">
                <label>Translation Language</label>
                <select
                  className="vs-select"
                  value={manualTargetLanguage}
                  onChange={(e) => setManualTargetLanguage(e.target.value)}
                >
                  {languageOptions
                    .filter((lang) => lang.code !== sourceLanguage)
                    .map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Poem textarea */}
          <div className="vs-field" style={{ marginBottom: "2rem" }}>
            <label>Original Poem</label>
            <textarea
              value={poem}
              onChange={(e) => setPoem(e.target.value)}
              placeholder="Paste the original verse here…"
              rows={12}
              className="vs-textarea"
            />
          </div>

          {mode === "manual" && (
            <div className="vs-field" style={{ marginBottom: "2rem" }}>
              <label>Existing Translation</label>
              <textarea
                value={existingTranslation}
                onChange={(e) => setExistingTranslation(e.target.value)}
                placeholder="Paste the translation to compare…"
                rows={12}
                className="vs-textarea"
              />
            </div>
          )}

          {mode === "auto" && (
            <div style={{ marginBottom: "2.5rem" }}>
              <div className="vs-section-label" style={{ marginBottom: "1rem" }}>
                Comparison Languages
              </div>
              <div className="vs-langs">
                {languageOptions
                  .filter((lang) => lang.code !== sourceLanguage)
                  .map((lang) => (
                    <label
                      key={lang.code}
                      className={`vs-lang-chip ${targetLanguages.includes(lang.code) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={targetLanguages.includes(lang.code)}
                        onChange={() => handleTargetLanguageChange(lang.code)}
                      />
                      {lang.name}
                    </label>
                  ))}
              </div>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="vs-btn vs-btn-primary vs-btn-arrow"
          >
            {loading ? (
              <>
                <span className="vs-loading-spinner" />
                Analysing
              </>
            ) : mode === "auto" ? "Analyse Poem" : "Compare Translation"}
          </button>

          {/* Results */}
          {results.length > 0 && (
            <div className="vs-results-grid">
              {results.map((result) => (
                <div key={result.language} className="vs-result-card">
                  <div className="vs-result-lang">{result.language}</div>
                  <div className="vs-result-score">
                    <span>Score {result.score}/100</span>
                    <div className="vs-score-bar">
                      <div className="vs-score-fill" style={{ width: `${result.score}%` }} />
                    </div>
                  </div>
                  <pre
                    className="vs-result-poem"
                    dir={
                      result.language.toLowerCase().includes("arabic") ||
                      result.language.toLowerCase().includes("urdu") ? "rtl" : "ltr"
                    }
                  >
                    {result.text}
                  </pre>

                  {result.warnings.length > 0 && (
                    <div className="vs-result-warnings">
                      <div className="vs-warnings-title">Structural Warnings</div>
                      <ul className="vs-warnings-list">
                        {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  {result.meaningWarnings.length > 0 && (
                    <div className="vs-result-warnings">
                      <div className="vs-warnings-title">Meaning Shifts</div>
                      <ul className="vs-warnings-list vs-meaning-list">
                        {result.meaningWarnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Penpal Section ── */}
        <section id="penpal" className="vs-section">
          <div className="vs-section-label">02 — Poetry Penpal</div>

          <div className="vs-room-intro">
            <h2 className="vs-room-title">Share Verse<br /><em>Across Borders</em></h2>
            <p className="vs-room-desc">
              Create a shared room to exchange poems with someone in another language.
              Each message is translated privately into your preferred reading tongue.
            </p>
          </div>

          {!roomState ? (
            <>
              <div className="vs-room-setup">
                <div className="vs-field">
                  <label>Your Name</label>
                  <input
                    className="vs-input"
                    value={roomDisplayName}
                    onChange={(e) => setRoomDisplayName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>
                <div className="vs-field">
                  <label>Preferred Reading Language</label>
                  <select
                    className="vs-select"
                    value={roomPreferredLanguage}
                    onChange={(e) => {
                      setRoomPreferredLanguage(e.target.value);
                      setRoomMessageLanguage(e.target.value);
                    }}
                  >
                    {languageOptions.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="vs-room-actions">
                <button
                  onClick={createRoom}
                  disabled={roomLoading}
                  className="vs-btn vs-btn-primary vs-btn-arrow"
                >
                  {roomLoading ? <><span className="vs-loading-spinner" /> Working…</> : "Create Room"}
                </button>
              </div>

              <div className="vs-divider">or join existing</div>

              <form onSubmit={joinRoom} className="vs-join-form">
                <div className="vs-field">
                  <label>Room Code</label>
                  <input
                    className="vs-input"
                    value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                  />
                </div>
                <button
                  type="submit"
                  disabled={roomLoading}
                  className="vs-btn vs-btn-outline"
                >
                  Join Room
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Room meta */}
              <div className="vs-room-meta">
                <div className="vs-room-meta-item">
                  <div className="vs-meta-label">Room Code</div>
                  <div className="vs-meta-value">{roomState.roomCode}</div>
                </div>
                <div className="vs-room-meta-item">
                  <div className="vs-meta-label">You are</div>
                  <div className="vs-meta-value">{roomState.displayName}</div>
                </div>
                <div className="vs-room-meta-item">
                  <div className="vs-meta-label">Reading in</div>
                  <div className="vs-meta-value">{getLanguageName(roomState.preferredLanguage)}</div>
                </div>
              </div>

              {roomShareLink && (
                <div className="vs-share-link">
                  <span className="vs-share-label">Share</span>
                  <span className="vs-share-url">{roomShareLink}</span>
                </div>
              )}

              {/* Message form */}
              <form onSubmit={sendRoomMessage} className="vs-message-form">
                <div className="vs-field">
                  <label>Your Poem or Message</label>
                  <textarea
                    className="vs-textarea"
                    value={roomMessage}
                    onChange={(e) => setRoomMessage(e.target.value)}
                    placeholder="Write a verse to share with the room…"
                    rows={7}
                  />
                </div>
                <div className="vs-message-sidebar">
                  <div className="vs-field">
                    <label>Written in</label>
                    <select
                      className="vs-select"
                      value={roomMessageLanguage}
                      onChange={(e) => setRoomMessageLanguage(e.target.value)}
                    >
                      {languageOptions.map((lang) => (
                        <option key={lang.code} value={lang.code}>{lang.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={roomLoading}
                    className="vs-btn vs-btn-primary vs-btn-arrow"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {roomLoading ? <><span className="vs-loading-spinner" /> Sending…</> : "Send"}
                  </button>
                </div>
              </form>

              {/* Messages feed */}
              {roomState.messages.length === 0 ? (
                <div className="vs-empty">
                  No verses shared yet — be the first to write.
                </div>
              ) : (
                <div className="vs-messages">
                  {roomState.messages.map((message) => (
                    <div key={message.id} className="vs-message">
                      <div className="vs-message-header">
                        <div>
                          <div className="vs-sender">{message.senderName}</div>
                          <div className="vs-sender-sub">
                            Original · {getLanguageName(message.originalLanguage)}
                          </div>
                        </div>
                        <div className="vs-message-time">
                          {new Date(message.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="vs-message-cols">
                        <div>
                          <div className="vs-message-col-label">Original</div>
                          <pre
                            className="vs-message-text"
                            dir={message.originalLanguage === "ar" || message.originalLanguage === "ur" ? "rtl" : "ltr"}
                          >
                            {message.originalText}
                          </pre>
                        </div>
                        <div>
                          <div className="vs-message-col-label">
                            In {getLanguageName(message.translatedLanguage)}
                          </div>
                          <pre
                            className="vs-message-text"
                            dir={message.translatedLanguage === "ar" || message.translatedLanguage === "ur" ? "rtl" : "ltr"}
                          >
                            {message.translatedText}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {roomError && (
            <div className="vs-error">{roomError}</div>
          )}
        </section>

        {/* Footer */}
        <footer className="vs-footer">
          <span className="vs-footer-word">VerseShift</span>
          <span className="vs-footer-copy">Poetry in translation</span>
        </footer>
      </div>
    </>
  );
}