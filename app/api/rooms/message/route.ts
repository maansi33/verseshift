import { NextResponse } from "next/server";
import { addRoomMessage, getRoom } from "@/lib/roomStore";

const SUPPORTED_LANGUAGES = {
  en: "English",
  de: "German",
  ar: "Arabic",
  ja: "Japanese",
  fr: "French",
  es: "Spanish",
  hi: "Hindi",
  ur: "Urdu",
  pa: "Punjabi",
  ko: "Korean",
  zh: "Chinese",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  tr: "Turkish",
  bn: "Bengali",
} as const;

function isSupportedLocale(value: string): value is keyof typeof SUPPORTED_LANGUAGES {
  return value in SUPPORTED_LANGUAGES;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { roomCode, participantId, text, language } = body as {
      roomCode?: string;
      participantId?: string;
      text?: string;
      language?: string;
    };

    if (!roomCode || !participantId || !text || !language) {
      return NextResponse.json(
        { error: "Missing roomCode, participantId, text, or language." },
        { status: 400 }
      );
    }

    if (!isSupportedLocale(language)) {
      return NextResponse.json(
        { error: "Unsupported message language." },
        { status: 400 }
      );
    }

    const room = getRoom(roomCode.toUpperCase());

    if (!room) {
      return NextResponse.json(
        { error: "Room not found." },
        { status: 404 }
      );
    }

    const message = addRoomMessage({
      roomCode: roomCode.toUpperCase(),
      participantId,
      text,
      language,
    });

    if (!message) {
      return NextResponse.json(
        { error: "Could not add message to room." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, messageId: message.id });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}