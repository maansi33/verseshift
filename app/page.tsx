"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────
type AnalysisResult = {
  language: string; text: string; warnings: string[]; meaningWarnings: string[]; score: number;
};
type IdiomEquivalent = {
  original: string; meaning: string; equivalents: Record<string, string>; notes: string;
};
type DriftHop = {
  language: string; code: string; text: string; driftScore: number; driftNotes: string[];
};
type RoomMessage = {
  id: string; senderName: string; originalText: string; originalLanguage: string;
  translatedText: string; translatedLanguage: string; createdAt: string;
};
type RoomState = {
  roomCode: string; participantId: string; displayName: string;
  preferredLanguage: string; messages: RoomMessage[];
};

// ── Constants ─────────────────────────────────────────────────────
const languageOptions = [
  { code: "en", name: "English" }, { code: "de", name: "German" },
  { code: "ar", name: "Arabic" }, { code: "ja", name: "Japanese" },
  { code: "fr", name: "French" }, { code: "es", name: "Spanish" },
  { code: "hi", name: "Hindi" }, { code: "ur", name: "Urdu" },
  { code: "pa", name: "Punjabi" }, { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" }, { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" }, { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" }, { code: "bn", name: "Bengali" },
];

const voiceLangMap: Record<string, string> = {
  en: "en-US", de: "de-DE", ar: "ar-SA", ja: "ja-JP", fr: "fr-FR",
  es: "es-ES", hi: "hi-IN", ko: "ko-KR", zh: "zh-CN", it: "it-IT",
  pt: "pt-BR", ru: "ru-RU", tr: "tr-TR",
};

const BRAND_VOICES = [
  { id: "none",      label: "Default",    desc: "Standard faithful translation" },
  { id: "lyrical",   label: "Lyrical",    desc: "Musical, flowing, rich in imagery" },
  { id: "literal",   label: "Literal",    desc: "Word-for-word, structural fidelity" },
  { id: "romantic",  label: "Romantic",   desc: "Heightened emotion and beauty" },
  { id: "minimalist",label: "Minimalist", desc: "Spare, stripped, essential only" },
  { id: "formal",    label: "Formal",     desc: "Academic, precise, elevated register" },
];

const POEMS_OF_THE_DAY = [
  {
    title: "The Road Not Taken", author: "Robert Frost", lang: "en",
    text: `Two roads diverged in a yellow wood,
And sorry I could not travel both
And be one traveler, long I stood
And looked down one as far as I could
To where it bent in the undergrowth;

Then took the other, as just as fair,
And having perhaps the better claim,
Because it was grassy and wanted wear;
Though as for that the passing there
Had worn them really about the same.`
  },
  {
    title: "Hope is the Thing with Feathers", author: "Emily Dickinson", lang: "en",
    text: `Hope is the thing with feathers
That perches in the soul,
And sings the tune without the words,
And never stops at all,

And sweetest in the gale is heard;
And sore must be the storm
That could abash the little bird
That kept so many warm.`
  },
  {
    title: "Sonnet 18", author: "William Shakespeare", lang: "en",
    text: `Shall I compare thee to a summer's day?
Thou art more lovely and more temperate.
Rough winds do shake the darling buds of May,
And summer's lease hath all too short a date.

Sometime too hot the eye of heaven shines,
And often is his gold complexion dimmed;
And every fair from fair sometime declines,
By chance, or nature's changing course, untrimmed.`
  },
  {
    title: "I Carry Your Heart", author: "E.E. Cummings", lang: "en",
    text: `i carry your heart with me (i carry it in
my heart) i am never without it (anywhere
i go you go, my dear; and whatever is done
by only me is your doing, my darling)

i fear no fate (for you are my fate, my sweet)
i want no world (for beautiful you are my world, my true)
and it's you are whatever a moon has always meant
and whatever a sun will always sing is you`
  },
  {
    title: "The Waste Land (opening)", author: "T.S. Eliot", lang: "en",
    text: `April is the cruellest month, breeding
Lilacs out of the dead land, mixing
Memory and desire, stirring
Dull roots with spring rain.
Winter kept us warm, covering
Earth in forgetful snow, feeding
A little life with dried tubers.`
  },
];

// ── Helpers ───────────────────────────────────────────────────────
function getLanguageName(code: string) {
  return languageOptions.find((l) => l.code === code)?.name ?? code;
}
function getLangCode(langName: string): string {
  const clean = langName.replace(/\s*\(.*?\)/g, "").trim();
  return languageOptions.find((l) => l.name === clean)?.code ?? "en";
}
function isRTL(code: string) { return ["ar", "ur"].includes(code); }
function driftColor(score: number): string {
  if (score <= 20) return "#7a8c6e";
  if (score <= 50) return "#c4862a";
  return "#9b3a2e";
}
function driftLabel(score: number): string {
  if (score <= 20) return "Preserved";
  if (score <= 50) return "Some Drift";
  if (score <= 75) return "Heavy Drift";
  return "Lost";
}
function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function downloadAllPoems(results: AnalysisResult[]) {
  downloadText("verseshift-translations.txt",
    results.map((r) => `═══ ${r.language} ═══\n\n${r.text}`).join("\n\n\n"));
}
function todaysPoem() {
  const idx = Math.floor(Date.now() / 86400000) % POEMS_OF_THE_DAY.length;
  return POEMS_OF_THE_DAY[idx];
}

// ── Component ─────────────────────────────────────────────────────
export default function HomePage() {
  // Analysis
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [poem, setPoem] = useState("");
  const [existingTranslation, setExistingTranslation] = useState("");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [manualTargetLanguage, setManualTargetLanguage] = useState("de");
  const [targetLanguages, setTargetLanguages] = useState<string[]>(["de", "ar", "ja", "fr"]);
  // Brand voice
  const [brandVoice, setBrandVoice] = useState("none");
  // Glossary lock
  const [glossaryInput, setGlossaryInput] = useState("");
  const [lockedWords, setLockedWords] = useState<string[]>([]);
  // Idioms
  const [idioms, setIdioms] = useState<IdiomEquivalent[]>([]);
  const [idiomsLoading, setIdiomsLoading] = useState(false);
  const [idiomsOpen, setIdiomsOpen] = useState(false);
  // Drift chain
  const [driftOpen, setDriftOpen] = useState(false);
  const [driftChain, setDriftChain] = useState<string[]>(["fr", "ja", "ar", "en"]);
  const [driftHops, setDriftHops] = useState<DriftHop[]>([]);
  const [driftLoading, setDriftLoading] = useState(false);
  // Audio
  const [speakingLang, setSpeakingLang] = useState<string | null>(null);
  // Share card
  const [shareCard, setShareCard] = useState<{ result: AnalysisResult; original: AnalysisResult } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Room
  const [roomDisplayName, setRoomDisplayName] = useState("");
  const [roomPreferredLanguage, setRoomPreferredLanguage] = useState("en");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [roomMessage, setRoomMessage] = useState("");
  const [roomMessageLanguage, setRoomMessageLanguage] = useState("en");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState("");
  // Poem of the day
  const [potdOpen, setPotdOpen] = useState(false);

  const roomShareLink = useMemo(() => {
    if (!roomState || typeof window === "undefined") return "";
    return `${window.location.origin}?room=${roomState.roomCode}`;
  }, [roomState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("room");
    if (r) setJoinRoomCode(r.toUpperCase());
  }, []);

  useEffect(() => {
    if (!roomState) return;
    const iv = setInterval(() => void refreshRoom(roomState.roomCode, roomState.participantId, roomState.preferredLanguage), 4000);
    return () => clearInterval(iv);
  }, [roomState]);

  // ── Glossary helpers ──
  function addLockedWord() {
    const w = glossaryInput.trim();
    if (w && !lockedWords.includes(w)) setLockedWords((prev) => [...prev, w]);
    setGlossaryInput("");
  }
  function removeLockedWord(w: string) { setLockedWords((prev) => prev.filter((x) => x !== w)); }

  // ── Poem of the Day ──
  function loadPoemOfDay() {
    const p = todaysPoem();
    setPoem(p.text);
    setSourceLanguage(p.lang);
    setPotdOpen(false);
  }

  // ── Handlers ──────────────────────────────────────────────────
  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setPoem(await f.text());
  }
  function handleTargetLanguageChange(code: string) {
    setTargetLanguages((prev) => prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]);
  }

  async function handleAnalyze() {
    if (!poem.trim()) { alert("Please paste a poem or upload a file."); return; }
    if (mode === "manual" && !existingTranslation.trim()) { alert("Please paste the existing translation."); return; }
    if (mode === "auto" && targetLanguages.length === 0) { alert("Please select at least one language."); return; }
    setLoading(true); setIdioms([]); setIdiomsOpen(false);
    try {
      const res = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, poem, existingTranslation, sourceLanguage, manualTargetLanguage, targetLanguages, brandVoice, lockedWords }),
      });
      const raw = await res.text();
      if (!raw.trim()) throw new Error("Empty response from server");
      const data = JSON.parse(raw);
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setResults(data.results ?? []);
    } catch (e) { alert(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setLoading(false); }
  }

  async function handleFetchIdioms() {
    if (!poem.trim() || results.length === 0) return;
    setIdiomsLoading(true); setIdiomsOpen(true);
    try {
      const langs = results.map((r) => r.language.replace(/\s*\(.*?\)/g, "").trim()).filter((l) => !l.includes("Original"));
      const res = await fetch("/api/idioms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poem, sourceLanguage: getLanguageName(sourceLanguage), targetLanguages: langs }),
      });
      const data = await res.json() as { idioms?: IdiomEquivalent[] };
      setIdioms(data.idioms ?? []);
    } catch (e) { console.error(e); }
    finally { setIdiomsLoading(false); }
  }

  async function handleRunDrift() {
    if (!poem.trim()) { alert("Please enter a poem first."); return; }
    if (driftChain.length === 0) { alert("Please add at least one language to the chain."); return; }
    setDriftLoading(true); setDriftHops([]);
    try {
      const res = await fetch("/api/drift", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poem, chain: driftChain, sourceLanguage, lockedWords }),
      });
      const data = await res.json() as { hops?: DriftHop[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Drift chain failed");
      setDriftHops(data.hops ?? []);
    } catch (e) { alert(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setDriftLoading(false); }
  }

  function handleSpeak(text: string, langCode: string) {
    if (speakingLang === langCode) { window.speechSynthesis?.cancel(); setSpeakingLang(null); return; }
    setSpeakingLang(langCode);
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = voiceLangMap[langCode] ?? langCode; utt.rate = 0.88;
    utt.onend = () => setSpeakingLang(null); utt.onerror = () => setSpeakingLang(null);
    window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(utt);
  }

  function handleShareCard(result: AnalysisResult) {
    const original = results.find((r) => r.language.includes("Original")) ?? results[0];
    setShareCard({ result, original });
  }

  async function downloadCard() {
    if (!cardRef.current || !shareCard) return;
    try {
      const { default: h2c } = await import("html2canvas");
      const canvas = await h2c(cardRef.current, { scale: 2, backgroundColor: "#f5f0e8" });
      const a = document.createElement("a");
      a.download = `verseshift-${shareCard.result.language.toLowerCase().replace(/\s+/g, "-")}.png`;
      a.href = canvas.toDataURL("image/png"); a.click();
    } catch {
      const svg = generateCardSVG(shareCard.original, shareCard.result);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `verseshift-${shareCard.result.language.toLowerCase().replace(/\s+/g, "-")}.svg`;
      a.click(); URL.revokeObjectURL(url);
    }
  }

  function generateCardSVG(original: AnalysisResult, translated: AnalysisResult): string {
    const wrap = (t: string, max = 42) => {
      const lines: string[] = [];
      t.split("\n").forEach((line) => {
        if (line.length <= max) { lines.push(line); return; }
        const words = line.split(" "); let cur = "";
        words.forEach((w) => { if ((cur + " " + w).trim().length > max) { if (cur) lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
        if (cur) lines.push(cur);
      });
      return lines;
    };
    const oLines = wrap(original.text).slice(0, 8);
    const tLines = wrap(translated.text).slice(0, 8);
    const h = Math.max(oLines.length, tLines.length) * 22 + 220;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${h}">
  <rect width="800" height="${h}" fill="#f5f0e8"/>
  <rect width="800" height="4" fill="#8b5e3c"/>
  <text x="40" y="52" font-family="Georgia,serif" font-size="11" letter-spacing="4" fill="#9a9080">VERSESHIFT · POETRY IN TRANSLATION</text>
  <line x1="40" y1="68" x2="760" y2="68" stroke="#e8e0d0" stroke-width="1"/>
  <text x="40" y="100" font-family="Georgia,serif" font-size="22" fill="#1a1611" font-style="italic">${esc(original.language)}</text>
  <text x="420" y="100" font-family="Georgia,serif" font-size="22" fill="#8b5e3c" font-style="italic">${esc(translated.language)}</text>
  <line x1="400" y1="75" x2="400" y2="${h - 60}" stroke="#e8e0d0" stroke-width="1"/>
  ${oLines.map((l, i) => `<text x="40" y="${125 + i * 22}" font-family="Georgia,serif" font-size="13" fill="#3d3628" font-style="italic">${esc(l)}</text>`).join("\n  ")}
  ${tLines.map((l, i) => `<text x="420" y="${125 + i * 22}" font-family="Georgia,serif" font-size="13" fill="#3d3628" font-style="italic">${esc(l)}</text>`).join("\n  ")}
  <text x="40" y="${h - 24}" font-family="Georgia,serif" font-size="10" letter-spacing="3" fill="#9a9080">SCORE ${translated.score}/100</text>
  <text x="760" y="${h - 24}" font-family="Georgia,serif" font-size="10" letter-spacing="3" fill="#9a9080" text-anchor="end">verseshift.app</text>
</svg>`;
  }

  // ── Room ──────────────────────────────────────────────────────
  async function createRoom() {
    if (!roomDisplayName.trim()) { alert("Please enter your name."); return; }
    setRoomLoading(true); setRoomError("");
    try {
      const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", displayName: roomDisplayName, preferredLanguage: roomPreferredLanguage }) });
      const data = await res.json() as RoomState & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not create room.");
      setRoomState(data); setRoomMessageLanguage(roomPreferredLanguage); setJoinRoomCode(data.roomCode);
      const u = new URL(window.location.href); u.searchParams.set("room", data.roomCode); window.history.replaceState({}, "", u.toString());
    } catch (e) { setRoomError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setRoomLoading(false); }
  }
  async function joinRoom(e?: FormEvent) {
    e?.preventDefault();
    if (!roomDisplayName.trim()) { alert("Please enter your name."); return; }
    if (!joinRoomCode.trim()) { alert("Please enter a room code."); return; }
    setRoomLoading(true); setRoomError("");
    try {
      const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", roomCode: joinRoomCode.trim().toUpperCase(), displayName: roomDisplayName, preferredLanguage: roomPreferredLanguage }) });
      const data = await res.json() as RoomState & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not join room.");
      setRoomState(data); setRoomMessageLanguage(roomPreferredLanguage);
      const u = new URL(window.location.href); u.searchParams.set("room", data.roomCode); window.history.replaceState({}, "", u.toString());
    } catch (e) { setRoomError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setRoomLoading(false); }
  }
  async function refreshRoom(roomCode: string, participantId: string, viewerLanguage: string) {
    try {
      const p = new URLSearchParams({ roomCode, participantId, viewerLanguage });
      const res = await fetch(`/api/rooms?${p.toString()}`);
      const data = await res.json() as RoomState;
      if (res.ok) setRoomState(data);
    } catch (e) { console.error(e); }
  }
  async function sendRoomMessage(e: FormEvent) {
    e.preventDefault();
    if (!roomState || !roomMessage.trim()) { alert("Please enter a message."); return; }
    setRoomLoading(true); setRoomError("");
    try {
      const res = await fetch("/api/rooms/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomCode: roomState.roomCode, participantId: roomState.participantId, text: roomMessage, language: roomMessageLanguage }) });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not send message.");
      setRoomMessage(""); await refreshRoom(roomState.roomCode, roomState.participantId, roomState.preferredLanguage);
    } catch (e) { setRoomError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setRoomLoading(false); }
  }

  // ── Render ────────────────────────────────────────────────────
  const potd = todaysPoem();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Jost:wght@200;300;400&family=Scheherazade+New:wght@400;700&display=swap');
        :root {
          --cream:#f5f0e8; --warm-white:#faf8f4; --parchment:#e8e0d0;
          --ink:#1a1611; --ink-light:#3d3628; --dust:#9a9080;
          --sienna:#8b5e3c; --sage:#7a8c6e; --line:rgba(26,22,17,0.12);
          --drift-green:#7a8c6e; --drift-amber:#c4862a; --drift-red:#9b3a2e;
        }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:var(--cream);color:var(--ink);font-family:'Jost',sans-serif;font-weight:300;letter-spacing:.02em}
        .vs-page{min-height:100vh}

        /* Header */
        .vs-header{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1.5rem 3rem;background:var(--cream);border-bottom:1px solid var(--line)}
        .vs-wordmark{font-family:'Cormorant Garamond',serif;font-size:1.5rem;font-weight:400;letter-spacing:.08em;text-transform:uppercase}
        .vs-wordmark span{font-style:italic;font-weight:300}
        .vs-nav{display:flex;gap:2.5rem;list-style:none}
        .vs-nav a{font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--dust);text-decoration:none;transition:color .2s;cursor:pointer}
        .vs-nav a:hover,.vs-nav a.active{color:var(--ink)}

        /* Hero */
        .vs-hero{padding:12rem 3rem 6rem;display:grid;grid-template-columns:1fr 1fr;gap:4rem;align-items:end;border-bottom:1px solid var(--line)}
        .vs-hero-title{font-family:'Cormorant Garamond',serif;font-size:clamp(3.5rem,8vw,7rem);font-weight:300;line-height:.92;letter-spacing:-.02em}
        .vs-hero-title em{font-style:italic;color:var(--sienna)}
        .vs-hero-desc{font-size:.85rem;letter-spacing:.06em;line-height:1.8;color:var(--dust);max-width:28rem;align-self:end;padding-bottom:.5rem}
        .vs-potd-banner{background:var(--warm-white);border:1px solid var(--line);padding:1.2rem 1.8rem;display:flex;align-items:center;gap:1.5rem;margin-top:2rem;cursor:pointer;transition:border-color .2s}
        .vs-potd-banner:hover{border-color:var(--sienna)}
        .vs-potd-label{font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;color:var(--sienna);white-space:nowrap}
        .vs-potd-title{font-family:'Cormorant Garamond',serif;font-size:1rem;font-style:italic;color:var(--ink)}
        .vs-potd-author{font-size:.72rem;color:var(--dust);margin-top:.1rem}
        .vs-potd-arrow{margin-left:auto;color:var(--dust);font-size:1.1rem}

        /* Section */
        .vs-section{padding:5rem 3rem;border-bottom:1px solid var(--line)}
        .vs-section-label{font-size:.65rem;letter-spacing:.22em;text-transform:uppercase;color:var(--dust);margin-bottom:3rem;display:flex;align-items:center;gap:1rem}
        .vs-section-label::after{content:'';flex:1;height:1px;background:var(--line);max-width:6rem}

        /* Mode toggle */
        .vs-mode-toggle{display:inline-flex;border:1px solid var(--line);margin-bottom:3rem;background:var(--warm-white)}
        .vs-mode-btn{padding:.65rem 1.6rem;font-family:'Jost',sans-serif;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;background:transparent;border:none;color:var(--dust);transition:all .2s}
        .vs-mode-btn.active{background:var(--ink);color:var(--cream)}

        /* Form */
        .vs-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:2.5rem}
        .vs-form-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2rem;margin-bottom:2.5rem}
        .vs-field label{display:block;font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:var(--dust);margin-bottom:.65rem}
        .vs-input,.vs-select,.vs-textarea,.vs-file-input{width:100%;background:var(--warm-white);border:1px solid var(--line);color:var(--ink);font-family:'Jost',sans-serif;font-weight:300;font-size:.88rem;transition:border-color .2s;outline:none;appearance:none}
        .vs-input,.vs-select,.vs-file-input{padding:.8rem 1rem;letter-spacing:.04em}
        .vs-select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9080' stroke-width='1.2'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 1rem center;padding-right:2.5rem;cursor:pointer}
        .vs-textarea{padding:1rem;resize:vertical;line-height:1.7;font-size:.9rem;letter-spacing:.02em}
        .vs-input:focus,.vs-select:focus,.vs-textarea:focus{border-color:var(--ink-light)}
        .vs-file-input{cursor:pointer;color:var(--dust);font-size:.78rem}
        .vs-file-input::-webkit-file-upload-button{background:var(--parchment);border:none;border-right:1px solid var(--line);padding:.8rem 1rem;font-family:'Jost',sans-serif;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-light);cursor:pointer;margin-right:1rem}

        /* Brand voice */
        .vs-voice-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(10rem,1fr));gap:.5rem;margin-bottom:2.5rem}
        .vs-voice-chip{padding:.65rem 1rem;border:1px solid var(--line);background:var(--warm-white);cursor:pointer;transition:all .18s;text-align:left}
        .vs-voice-chip:hover{border-color:var(--ink-light)}
        .vs-voice-chip.selected{background:var(--ink);border-color:var(--ink)}
        .vs-voice-chip.selected .vs-voice-name{color:var(--cream)}
        .vs-voice-chip.selected .vs-voice-desc{color:rgba(250,248,244,.55)}
        .vs-voice-name{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);transition:color .18s}
        .vs-voice-desc{font-size:.62rem;color:var(--dust);margin-top:.2rem;line-height:1.4;transition:color .18s}

        /* Glossary */
        .vs-glossary-box{background:var(--warm-white);border:1px solid var(--line);padding:1.5rem;margin-bottom:2.5rem}
        .vs-glossary-title{font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:var(--dust);margin-bottom:1rem}
        .vs-glossary-input-row{display:flex;gap:.8rem;margin-bottom:1rem}
        .vs-glossary-input-row .vs-input{flex:1}
        .vs-locked-words{display:flex;flex-wrap:wrap;gap:.5rem}
        .vs-locked-word{display:flex;align-items:center;gap:.4rem;padding:.3rem .8rem;background:var(--cream);border:1px solid var(--sienna);font-size:.72rem;color:var(--sienna);letter-spacing:.06em}
        .vs-locked-word button{background:none;border:none;cursor:pointer;color:var(--sienna);font-size:.8rem;line-height:1;padding:0}
        .vs-locked-hint{font-size:.68rem;color:var(--dust);font-style:italic}

        /* Lang chips */
        .vs-langs{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:2.5rem}
        .vs-lang-chip{display:flex;align-items:center;gap:.45rem;padding:.45rem .9rem;border:1px solid var(--line);background:var(--warm-white);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .18s;color:var(--dust);user-select:none}
        .vs-lang-chip:hover{border-color:var(--ink-light);color:var(--ink)}
        .vs-lang-chip.selected{background:var(--ink);border-color:var(--ink);color:var(--cream)}
        .vs-lang-chip input{display:none}

        /* Buttons */
        .vs-btn{display:inline-flex;align-items:center;gap:.6rem;padding:.85rem 2.2rem;font-family:'Jost',sans-serif;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;border:none;transition:all .2s}
        .vs-btn-primary{background:var(--ink);color:var(--cream)}
        .vs-btn-primary:hover:not(:disabled){background:var(--ink-light)}
        .vs-btn-outline{background:transparent;border:1px solid var(--ink);color:var(--ink)}
        .vs-btn-outline:hover:not(:disabled){background:var(--ink);color:var(--cream)}
        .vs-btn-ghost{background:transparent;border:1px solid var(--line);color:var(--dust)}
        .vs-btn-ghost:hover:not(:disabled){border-color:var(--ink);color:var(--ink)}
        .vs-btn-sienna{background:transparent;border:1px solid var(--sienna);color:var(--sienna)}
        .vs-btn-sienna:hover:not(:disabled){background:var(--sienna);color:var(--cream)}
        .vs-btn:disabled{opacity:.4;cursor:default}
        .vs-btn-sm{padding:.5rem 1rem;font-size:.62rem}
        .vs-btn-arrow::after{content:'→';font-style:normal;letter-spacing:0}
        .vs-btn-speaking{background:var(--sienna)!important;color:var(--cream)!important;border-color:var(--sienna)!important}

        /* Toolbar */
        .vs-results-toolbar{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:3.5rem;margin-bottom:1.5rem;align-items:center;padding-bottom:1.5rem;border-bottom:1px solid var(--line)}
        .vs-toolbar-label{font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--dust);margin-right:auto}

        /* Results */
        .vs-results-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(22rem,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
        .vs-result-card{background:var(--warm-white);padding:2.5rem 2rem;position:relative}
        .vs-result-lang{font-family:'Cormorant Garamond',serif;font-size:1.4rem;font-weight:400;color:var(--ink);margin-bottom:.35rem}
        .vs-result-score{font-size:.65rem;letter-spacing:.16em;text-transform:uppercase;color:var(--dust);margin-bottom:1.2rem;display:flex;align-items:center;gap:.8rem}
        .vs-score-bar{height:2px;flex:1;background:var(--parchment);max-width:5rem;position:relative;overflow:hidden}
        .vs-score-fill{position:absolute;top:0;left:0;bottom:0;background:var(--sienna);transition:width .6s ease}
        .vs-result-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1.5rem}
        .vs-result-poem{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:300;line-height:1.85;white-space:pre-wrap;color:var(--ink-light);font-style:italic}
        .vs-result-poem[dir="rtl"]{font-family:'Scheherazade New','Noto Naskh Arabic','Arial Unicode MS',serif;font-size:1.15rem;font-style:normal;text-align:right;unicode-bidi:embed;direction:rtl;line-height:2.2}
        .vs-result-warnings{margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--line)}
        .vs-warnings-title{font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--dust);margin-bottom:.8rem}
        .vs-warnings-list{list-style:none;display:flex;flex-direction:column;gap:.5rem}
        .vs-warnings-list li{font-size:.8rem;color:var(--ink-light);line-height:1.5;padding-left:.8rem;border-left:2px solid var(--sienna);opacity:.8}
        .vs-meaning-list li{border-left-color:var(--sage)}

        /* Glossary locked word highlight */
        .vs-locked-highlight{background:rgba(139,94,60,.15);border-bottom:2px solid var(--sienna);padding:0 .1rem}

        /* Idiom panel */
        .vs-panel{margin-top:2.5rem;border:1px solid var(--line);background:var(--warm-white)}
        .vs-panel-header{display:flex;align-items:center;justify-content:space-between;padding:1.5rem 2rem;border-bottom:1px solid var(--line);cursor:pointer}
        .vs-panel-title{font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-weight:400;color:var(--ink)}
        .vs-panel-toggle{font-size:.65rem;letter-spacing:.14em;text-transform:uppercase;color:var(--dust)}
        .vs-panel-body{padding:2rem;display:flex;flex-direction:column;gap:2rem}
        .vs-idiom-card{padding:1.5rem;border:1px solid var(--line);background:var(--cream)}
        .vs-idiom-phrase{font-family:'Cormorant Garamond',serif;font-size:1.1rem;font-style:italic;color:var(--ink);margin-bottom:.4rem}
        .vs-idiom-meaning{font-size:.78rem;color:var(--dust);letter-spacing:.04em;margin-bottom:1rem;line-height:1.6}
        .vs-idiom-equivalents{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:.8rem;margin-bottom:1rem}
        .vs-idiom-eq{padding:.7rem 1rem;background:var(--warm-white);border:1px solid var(--line)}
        .vs-idiom-eq-lang{font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:var(--dust);margin-bottom:.3rem}
        .vs-idiom-eq-text{font-family:'Cormorant Garamond',serif;font-size:.95rem;font-style:italic;color:var(--ink-light)}
        .vs-idiom-note{font-size:.72rem;color:var(--dust);border-left:2px solid var(--sage);padding-left:.8rem;line-height:1.5}
        .vs-panel-empty{padding:2rem;text-align:center;font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--dust);font-size:1rem}

        /* Drift chain */
        .vs-drift-setup{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1.5rem;align-items:center}
        .vs-drift-chain{display:flex;align-items:center;flex-wrap:wrap;gap:0;margin-bottom:2rem}
        .vs-drift-hop{display:flex;flex-direction:column;align-items:center;min-width:10rem;flex:1}
        .vs-drift-hop-lang{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:400;color:var(--ink);margin-bottom:.3rem}
        .vs-drift-hop-badge{font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;padding:.2rem .6rem;margin-bottom:.8rem}
        .vs-drift-hop-arrow{font-size:1.2rem;color:var(--dust);padding:0 .5rem;align-self:center;margin-top:-1.5rem}
        .vs-drift-bar-wrap{width:100%;height:4px;background:var(--parchment);margin-top:.4rem}
        .vs-drift-bar-fill{height:100%;transition:width .8s ease}
        .vs-drift-poem{font-family:'Cormorant Garamond',serif;font-size:.88rem;font-style:italic;line-height:1.7;white-space:pre-wrap;color:var(--ink-light);padding:1rem;background:var(--cream);border:1px solid var(--line);margin-top:.6rem;width:100%;max-height:10rem;overflow-y:auto}
        .vs-drift-poem[dir="rtl"]{font-family:'Scheherazade New',serif;text-align:right;direction:rtl;font-style:normal;line-height:2}
        .vs-drift-notes{margin-top:.5rem;display:flex;flex-direction:column;gap:.2rem}
        .vs-drift-note{font-size:.68rem;color:var(--dust);padding-left:.6rem;border-left:2px solid;line-height:1.4}
        .vs-drift-connector{flex:0 0 2rem;height:2px;background:var(--line);align-self:center;margin-top:-2rem}
        .vs-drift-total{display:flex;align-items:center;gap:1.5rem;padding:1.5rem 2rem;border-top:1px solid var(--line);background:var(--cream)}
        .vs-drift-total-label{font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:var(--dust)}
        .vs-drift-total-score{font-family:'Cormorant Garamond',serif;font-size:1.8rem;font-weight:300}

        /* Share card modal */
        .vs-modal-backdrop{position:fixed;inset:0;background:rgba(26,22,17,.6);z-index:200;display:flex;align-items:center;justify-content:center;padding:2rem}
        .vs-modal{background:var(--cream);max-width:760px;width:100%;max-height:90vh;overflow-y:auto}
        .vs-modal-header{display:flex;align-items:center;justify-content:space-between;padding:1.5rem 2rem;border-bottom:1px solid var(--line)}
        .vs-modal-title{font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-weight:400;color:var(--ink)}
        .vs-modal-close{background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--dust);padding:.2rem .5rem}
        .vs-modal-body{padding:2rem}
        .vs-modal-actions{display:flex;gap:1rem;padding:1.5rem 2rem;border-top:1px solid var(--line)}
        .vs-poem-card{background:var(--cream);border:1px solid var(--parchment);padding:3rem 2.5rem;position:relative}
        .vs-poem-card-accent{position:absolute;top:0;left:0;right:0;height:3px;background:var(--sienna)}
        .vs-poem-card-header{font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--dust);margin-bottom:1.5rem}
        .vs-poem-card-cols{display:grid;grid-template-columns:1fr 1fr;gap:2.5rem}
        .vs-poem-card-col-label{font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:var(--dust);margin-bottom:.8rem}
        .vs-poem-card-text{font-family:'Cormorant Garamond',serif;font-size:1rem;font-style:italic;font-weight:300;line-height:1.85;white-space:pre-wrap;color:var(--ink-light)}
        .vs-poem-card-text[dir="rtl"]{font-family:'Scheherazade New',serif;font-style:normal;text-align:right;direction:rtl;line-height:2.2}
        .vs-poem-card-footer{margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
        .vs-poem-card-score{font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--dust)}
        .vs-poem-card-brand{font-family:'Cormorant Garamond',serif;font-size:.85rem;font-style:italic;color:var(--dust)}

        /* Room */
        .vs-room-intro{max-width:36rem;margin-bottom:4rem}
        .vs-room-title{font-family:'Cormorant Garamond',serif;font-size:clamp(2rem,5vw,3.2rem);font-weight:300;line-height:1.1;margin-bottom:1rem}
        .vs-room-title em{font-style:italic;color:var(--sienna)}
        .vs-room-desc{font-size:.82rem;letter-spacing:.04em;line-height:1.8;color:var(--dust)}
        .vs-room-setup{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:3rem}
        .vs-room-actions{display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:3rem}
        .vs-divider{display:flex;align-items:center;gap:1.5rem;font-size:.65rem;letter-spacing:.16em;text-transform:uppercase;color:var(--dust);margin:2.5rem 0}
        .vs-divider::before,.vs-divider::after{content:'';flex:1;height:1px;background:var(--line)}
        .vs-join-form{display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:end;background:var(--warm-white);border:1px solid var(--line);padding:2rem;max-width:42rem}
        .vs-room-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:2.5rem}
        .vs-room-meta-item{background:var(--warm-white);padding:1.5rem 1.8rem}
        .vs-meta-label{font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;color:var(--dust);margin-bottom:.4rem}
        .vs-meta-value{font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:400;color:var(--ink)}
        .vs-share-link{background:var(--warm-white);border:1px solid var(--line);padding:1.2rem 1.8rem;margin-bottom:3rem;display:flex;align-items:center;gap:1.5rem}
        .vs-share-label{font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--dust);white-space:nowrap}
        .vs-share-url{font-size:.8rem;color:var(--ink-light);word-break:break-all;line-height:1.4}
        .vs-message-form{display:grid;grid-template-columns:1fr 240px;gap:2rem;margin-bottom:4rem;align-items:start}
        .vs-message-sidebar{display:flex;flex-direction:column;gap:1.5rem}
        .vs-messages{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line)}
        .vs-message{background:var(--warm-white);padding:2.5rem 2rem}
        .vs-message-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1.5rem}
        .vs-sender{font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-weight:400;color:var(--ink)}
        .vs-sender-sub{font-size:.65rem;letter-spacing:.14em;text-transform:uppercase;color:var(--dust);margin-top:.2rem}
        .vs-message-time{font-size:.65rem;letter-spacing:.08em;color:var(--dust);white-space:nowrap}
        .vs-message-cols{display:grid;grid-template-columns:1fr 1fr;gap:2rem}
        .vs-message-col-label{font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--dust);margin-bottom:.8rem}
        .vs-message-text{font-family:'Cormorant Garamond',serif;font-size:1rem;font-style:italic;font-weight:300;line-height:1.85;white-space:pre-wrap;color:var(--ink-light);background:var(--cream);padding:1.2rem 1.4rem}
        .vs-message-text[dir="rtl"]{font-family:'Scheherazade New',serif;font-style:normal;text-align:right;direction:rtl;line-height:2.2}
        .vs-empty{padding:5rem 2rem;text-align:center;font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-style:italic;color:var(--dust);background:var(--warm-white);border:1px dashed var(--line)}
        .vs-error{font-size:.78rem;color:#8b2e2e;letter-spacing:.04em;margin-top:1rem;padding:.8rem 1rem;border-left:2px solid #8b2e2e;background:#fdf5f5}
        .vs-loading-spinner{display:inline-block;width:.7rem;height:.7rem;border:1px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin .6s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .vs-footer{padding:3rem;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--line)}
        .vs-footer-word{font-family:'Cormorant Garamond',serif;font-size:.9rem;font-style:italic;color:var(--dust)}
        .vs-footer-copy{font-size:.65rem;letter-spacing:.14em;text-transform:uppercase;color:var(--dust)}

        @media(max-width:768px){
          .vs-form-grid,.vs-form-grid-3,.vs-room-setup,.vs-message-form{grid-template-columns:1fr}
          .vs-hero{grid-template-columns:1fr;padding:9rem 1.5rem 4rem}
          .vs-header{padding:1.2rem 1.5rem}
          .vs-section{padding:3.5rem 1.5rem}
          .vs-nav{gap:1.5rem}
          .vs-poem-card-cols{grid-template-columns:1fr}
          .vs-room-meta,.vs-message-cols,.vs-join-form{grid-template-columns:1fr}
          .vs-drift-chain{flex-direction:column}
          .vs-drift-hop{width:100%}
        }
      `}</style>

      <div className="vs-page">
        {/* ── Header ── */}
        <header className="vs-header">
          <div className="vs-wordmark">Verse<span>Shift</span></div>
          <nav><ul className="vs-nav">
            <li><a href="#analyse" className="active">Analyse</a></li>
            <li><a href="#drift">Drift Chain</a></li>
            <li><a href="#penpal">Penpal</a></li>
          </ul></nav>
        </header>

        {/* ── Hero ── */}
        <section className="vs-hero">
          <h1 className="vs-hero-title">Poetry<br /><em>Across</em><br />Languages</h1>
          <div>
            <p className="vs-hero-desc">
              Explore how verse transforms across tongues — its rhythm, shape, and soul
              shifting with each translation. A study in linguistic drift and poetic preservation.
            </p>
            {/* Poem of the Day banner */}
            <div className="vs-potd-banner" onClick={() => setPotdOpen(!potdOpen)}>
              <span className="vs-potd-label">Poem of the Day</span>
              <div>
                <div className="vs-potd-title">{potd.title}</div>
                <div className="vs-potd-author">{potd.author}</div>
              </div>
              <span className="vs-potd-arrow">{potdOpen ? "↑" : "↓"}</span>
            </div>
            {potdOpen && (
              <div style={{ background: "var(--warm-white)", border: "1px solid var(--line)", borderTop: "none", padding: "1.5rem 1.8rem" }}>
                <pre style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontSize: "0.95rem", lineHeight: 1.85, whiteSpace: "pre-wrap", color: "var(--ink-light)", marginBottom: "1.2rem" }}>{potd.text}</pre>
                <button onClick={loadPoemOfDay} className="vs-btn vs-btn-sienna vs-btn-sm vs-btn-arrow">
                  Load into Analyser
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── Analysis ── */}
        <section id="analyse" className="vs-section">
          <div className="vs-section-label">01 — Analysis</div>

          <div className="vs-mode-toggle">
            <button className={`vs-mode-btn ${mode === "auto" ? "active" : ""}`} onClick={() => setMode("auto")}>Auto Translate</button>
            <button className={`vs-mode-btn ${mode === "manual" ? "active" : ""}`} onClick={() => setMode("manual")}>Compare Translation</button>
          </div>

          {/* Source + target */}
          <div className="vs-form-grid">
            <div className="vs-field">
              <label>Source Language</label>
              <select className="vs-select" value={sourceLanguage} onChange={(e) => {
                const v = e.target.value; setSourceLanguage(v);
                if (manualTargetLanguage === v) setManualTargetLanguage(languageOptions.find((l) => l.code !== v)?.code ?? "de");
                setTargetLanguages((prev) => prev.filter((l) => l !== v));
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

          {/* Brand Voice */}
          <div style={{ marginBottom: "2.5rem" }}>
            <div className="vs-section-label" style={{ marginBottom: "1rem" }}>Translation Voice</div>
            <div className="vs-voice-grid">
              {BRAND_VOICES.map((v) => (
                <div key={v.id} className={`vs-voice-chip ${brandVoice === v.id ? "selected" : ""}`} onClick={() => setBrandVoice(v.id)}>
                  <div className="vs-voice-name">{v.label}</div>
                  <div className="vs-voice-desc">{v.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Glossary Lock */}
          <div className="vs-glossary-box">
            <div className="vs-glossary-title">✦ Glossary Lock — Words that will never be translated</div>
            <div className="vs-glossary-input-row">
              <input
                className="vs-input" placeholder="e.g. Ophelia, Eden, Lethe…"
                value={glossaryInput}
                onChange={(e) => setGlossaryInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLockedWord(); } }}
              />
              <button onClick={addLockedWord} className="vs-btn vs-btn-outline vs-btn-sm">Lock Word</button>
            </div>
            {lockedWords.length > 0 ? (
              <div className="vs-locked-words">
                {lockedWords.map((w) => (
                  <span key={w} className="vs-locked-word">
                    {w} <button onClick={() => removeLockedWord(w)} title="Remove">✕</button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="vs-locked-hint">No locked words yet. Add words that should stay untranslated in every language.</div>
            )}
          </div>

          {/* Poem textarea */}
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
            {loading ? <><span className="vs-loading-spinner" /> Analysing…</> : mode === "auto" ? "Analyse Poem" : "Compare Translation"}
          </button>

          {/* Results */}
          {results.length > 0 && (
            <>
              <div className="vs-results-toolbar">
                <span className="vs-toolbar-label">{results.length} version{results.length !== 1 ? "s" : ""}</span>
                <button onClick={() => downloadAllPoems(results)} className="vs-btn vs-btn-ghost vs-btn-sm">↓ Download All</button>
                <button onClick={handleFetchIdioms} disabled={idiomsLoading} className="vs-btn vs-btn-sienna vs-btn-sm">
                  {idiomsLoading ? <><span className="vs-loading-spinner" /> Finding…</> : "✦ Idiom Equivalence"}
                </button>
              </div>

              <div className="vs-results-grid">
                {results.map((result) => {
                  const lc = getLangCode(result.language);
                  const rtl = isRTL(lc);
                  const speaking = speakingLang === result.language;
                  const isOrig = result.language.includes("Original");
                  return (
                    <div key={result.language} className="vs-result-card">
                      <div className="vs-result-lang">{result.language}</div>
                      <div className="vs-result-score">
                        <span>Score {result.score}/100</span>
                        <div className="vs-score-bar"><div className="vs-score-fill" style={{ width: `${result.score}%` }} /></div>
                      </div>
                      <div className="vs-result-actions">
                        <button onClick={() => handleSpeak(result.text, lc)} className={`vs-btn vs-btn-ghost vs-btn-sm ${speaking ? "vs-btn-speaking" : ""}`}>
                          {speaking ? "◼ Stop" : "▶ Listen"}
                        </button>
                        <button onClick={() => downloadText(`${result.language.toLowerCase().replace(/\s+/g, "-")}.txt`, result.text)} className="vs-btn vs-btn-ghost vs-btn-sm">↓ Save</button>
                        {!isOrig && <button onClick={() => handleShareCard(result)} className="vs-btn vs-btn-ghost vs-btn-sm">✦ Share Card</button>}
                      </div>
                      <div className="vs-result-poem" dir={rtl ? "rtl" : "ltr"}>{result.text}</div>
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

              {/* Idiom panel */}
              {idiomsOpen && (
                <div className="vs-panel">
                  <div className="vs-panel-header" onClick={() => setIdiomsOpen(!idiomsOpen)}>
                    <span className="vs-panel-title">Cultural Idiom Equivalence</span>
                    <span className="vs-panel-toggle">{idiomsOpen ? "Collapse ↑" : "Expand ↓"}</span>
                  </div>
                  <div className="vs-panel-body">
                    {idiomsLoading ? (
                      <div className="vs-panel-empty"><span className="vs-loading-spinner" style={{ marginRight: "0.5rem" }} />Analysing cultural phrases…</div>
                    ) : idioms.length === 0 ? (
                      <div className="vs-panel-empty">No distinct idioms detected.</div>
                    ) : idioms.map((idiom, i) => (
                      <div key={i} className="vs-idiom-card">
                        <div className="vs-idiom-phrase">"{idiom.original}"</div>
                        <div className="vs-idiom-meaning">{idiom.meaning}</div>
                        <div className="vs-idiom-equivalents">
                          {Object.entries(idiom.equivalents).map(([lang, eq]) => (
                            <div key={lang} className="vs-idiom-eq">
                              <div className="vs-idiom-eq-lang">{lang}</div>
                              <div className="vs-idiom-eq-text">{eq as string}</div>
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

        {/* ── Drift Chain ── */}
        <section id="drift" className="vs-section">
          <div className="vs-section-label">02 — Drift Chain</div>
          <div className="vs-room-intro">
            <h2 className="vs-room-title">The Telephone<br /><em>Game of Poetry</em></h2>
            <p className="vs-room-desc">
              Watch your poem pass through a chain of languages and see how much meaning
              mutates at each hop — scored against the original.
            </p>
          </div>

          <div style={{ marginBottom: "1.2rem" }}>
            <div className="vs-section-label" style={{ marginBottom: "1rem" }}>Chain Languages (in order)</div>
            <div className="vs-drift-setup">
              {driftChain.map((code, idx) => (
                <span key={idx} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ background: "var(--warm-white)", border: "1px solid var(--line)", padding: "0.35rem 0.8rem", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink)" }}>
                    {getLanguageName(code)}
                  </span>
                  <button onClick={() => setDriftChain((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dust)", fontSize: "0.8rem" }}>✕</button>
                  {idx < driftChain.length - 1 && <span style={{ color: "var(--dust)", fontSize: "0.9rem" }}>→</span>}
                </span>
              ))}
              <select className="vs-select" style={{ width: "auto", padding: "0.4rem 2rem 0.4rem 0.8rem", fontSize: "0.72rem" }}
                value="" onChange={(e) => { if (e.target.value) setDriftChain((prev) => [...prev, e.target.value]); }}>
                <option value="">+ Add language</option>
                {languageOptions.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
              {driftChain.length > 0 && (
                <button onClick={() => setDriftChain([])} className="vs-btn vs-btn-ghost vs-btn-sm">Clear</button>
              )}
            </div>
          </div>

          <button onClick={handleRunDrift} disabled={driftLoading || !poem.trim()} className="vs-btn vs-btn-primary vs-btn-arrow">
            {driftLoading ? <><span className="vs-loading-spinner" /> Running Chain…</> : "Run Drift Chain"}
          </button>
          {!poem.trim() && <span style={{ marginLeft: "1rem", fontSize: "0.72rem", color: "var(--dust)", letterSpacing: "0.06em" }}>← Enter a poem in the Analysis section first</span>}

          {driftHops.length > 0 && (
            <div className="vs-panel" style={{ marginTop: "3rem" }}>
              <div className="vs-drift-chain" style={{ padding: "2rem", flexDirection: "row", overflowX: "auto", gap: 0 }}>
                {driftHops.map((hop, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
                    <div className="vs-drift-hop">
                      <div className="vs-drift-hop-lang">{hop.language}</div>
                      <div className="vs-drift-hop-badge" style={{ background: `${driftColor(hop.driftScore)}22`, color: driftColor(hop.driftScore), border: `1px solid ${driftColor(hop.driftScore)}44` }}>
                        {hop.driftScore === 0 ? "Origin" : `${driftLabel(hop.driftScore)} · ${hop.driftScore}%`}
                      </div>
                      {hop.driftScore > 0 && (
                        <div className="vs-drift-bar-wrap">
                          <div className="vs-drift-bar-fill" style={{ width: `${hop.driftScore}%`, background: driftColor(hop.driftScore) }} />
                        </div>
                      )}
                      <div className="vs-drift-poem" dir={isRTL(hop.code) ? "rtl" : "ltr"}>{hop.text}</div>
                      <div className="vs-drift-notes">
                        {hop.driftNotes.map((n, ni) => (
                          <div key={ni} className="vs-drift-note" style={{ borderLeftColor: driftColor(hop.driftScore) }}>{n}</div>
                        ))}
                      </div>
                    </div>
                    {i < driftHops.length - 1 && (
                      <div style={{ alignSelf: "center", padding: "0 0.8rem", color: "var(--dust)", fontSize: "1.4rem", marginTop: "2rem", flexShrink: 0 }}>→</div>
                    )}
                  </div>
                ))}
              </div>
              {/* Total drift */}
              <div className="vs-drift-total">
                <div>
                  <div className="vs-drift-total-label">Total Drift</div>
                  <div className="vs-drift-total-score" style={{ color: driftColor(driftHops[driftHops.length - 1]?.driftScore ?? 0) }}>
                    {driftHops[driftHops.length - 1]?.driftScore ?? 0}%
                  </div>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--dust)", lineHeight: 1.6, maxWidth: "28rem" }}>
                  Cumulative meaning drift from origin → {driftHops[driftHops.length - 1]?.language}.
                  {driftHops[driftHops.length - 1]?.driftScore > 60 && " The poem has changed significantly through the chain."}
                  {(driftHops[driftHops.length - 1]?.driftScore ?? 0) <= 60 && (driftHops[driftHops.length - 1]?.driftScore ?? 0) > 20 && " Some drift has occurred — key images may have shifted."}
                  {(driftHops[driftHops.length - 1]?.driftScore ?? 0) <= 20 && " The poem has survived the chain remarkably intact."}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Penpal ── */}
        <section id="penpal" className="vs-section">
          <div className="vs-section-label">03 — Poetry Penpal</div>
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
                  {roomState.messages.map((msg) => (
                    <div key={msg.id} className="vs-message">
                      <div className="vs-message-header">
                        <div>
                          <div className="vs-sender">{msg.senderName}</div>
                          <div className="vs-sender-sub">Original · {getLanguageName(msg.originalLanguage)}</div>
                        </div>
                        <div className="vs-message-time">{new Date(msg.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="vs-message-cols">
                        <div>
                          <div className="vs-message-col-label">Original</div>
                          <div className="vs-message-text" dir={isRTL(msg.originalLanguage) ? "rtl" : "ltr"}>{msg.originalText}</div>
                        </div>
                        <div>
                          <div className="vs-message-col-label">In {getLanguageName(msg.translatedLanguage)}</div>
                          <div className="vs-message-text" dir={isRTL(msg.translatedLanguage) ? "rtl" : "ltr"}>{msg.translatedText}</div>
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
                    <div className="vs-poem-card-text" dir={isRTL(getLangCode(shareCard.original.language)) ? "rtl" : "ltr"}>{shareCard.original.text}</div>
                  </div>
                  <div>
                    <div className="vs-poem-card-col-label">{shareCard.result.language}</div>
                    <div className="vs-poem-card-text" dir={isRTL(getLangCode(shareCard.result.language)) ? "rtl" : "ltr"}>{shareCard.result.text}</div>
                  </div>
                </div>
                <div className="vs-poem-card-footer">
                  <span className="vs-poem-card-score">Translation score {shareCard.result.score}/100</span>
                  <span className="vs-poem-card-brand">VerseShift</span>
                </div>
              </div>
            </div>
            <div className="vs-modal-actions">
              <button onClick={downloadCard} className="vs-btn vs-btn-primary">↓ Download Image</button>
              <button onClick={() => setShareCard(null)} className="vs-btn vs-btn-ghost">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}