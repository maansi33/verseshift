import { NextResponse } from "next/server";
import { LingoDotDevEngine } from "lingo.dev/sdk";
import {
  createRoom,
  getParticipant,
  getRoom,
  joinRoom,
} from "@/lib/roomStore";

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

type SupportedLocale = keyof typeof SUPPORTED_LANGUAGES;

function isSupportedLocale(value: string): value is SupportedLocale {
  return value in SUPPORTED_LANGUAGES;
}

function serializeRoom(
  roomCode: string,
  participantId: string,
  displayName: string,
  preferredLanguage: string,
  messages: {
    id: string;
    senderName: string;
    originalText: string;
    originalLanguage: string;
    translatedText: string;
    translatedLanguage: string;
    createdAt: string;
  }[]
) {
  return {
    roomCode,
    participantId,
    displayName,
    preferredLanguage,
    messages,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, roomCode, displayName, preferredLanguage } = body as {
      action?: "create" | "join";
      roomCode?: string;
      displayName?: string;
      preferredLanguage?: string;
    };

    if (!displayName || typeof displayName !== "string") {
      return NextResponse.json(
        { error: "Display name is required." },
        { status: 400 }
      );
    }

    if (
      !preferredLanguage ||
      typeof preferredLanguage !== "string" ||
      !isSupportedLocale(preferredLanguage)
    ) {
      return NextResponse.json(
        { error: "Preferred language is invalid." },
        { status: 400 }
      );
    }

    if (action === "create") {
      const result = createRoom(displayName, preferredLanguage);

      return NextResponse.json(
        serializeRoom(
          result.room.roomCode,
          result.participantId,
          displayName,
          preferredLanguage,
          []
        )
      );
    }

    if (action === "join") {
      if (!roomCode || typeof roomCode !== "string") {
        return NextResponse.json(
          { error: "Room code is required." },
          { status: 400 }
        );
      }

      const result = joinRoom(roomCode.toUpperCase(), displayName, preferredLanguage);

      if (!result) {
        return NextResponse.json(
          { error: "Room not found." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        serializeRoom(
          result.room.roomCode,
          result.participantId,
          displayName,
          preferredLanguage,
          []
        )
      );
    }

    return NextResponse.json(
      { error: "Invalid action." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const roomCode = searchParams.get("roomCode");
    const participantId = searchParams.get("participantId");
    const viewerLanguage = searchParams.get("viewerLanguage");

    if (!roomCode || !participantId || !viewerLanguage) {
      return NextResponse.json(
        { error: "Missing roomCode, participantId, or viewerLanguage." },
        { status: 400 }
      );
    }

    if (!isSupportedLocale(viewerLanguage)) {
      return NextResponse.json(
        { error: "Viewer language is invalid." },
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

    const participant = getParticipant(room, participantId);

    if (!participant) {
      return NextResponse.json(
        { error: "Participant not found in room." },
        { status: 404 }
      );
    }

    const apiKey = process.env.LINGODOTDEV_API_KEY;
    const engineId = process.env.LINGODOTDEV_ENGINE_ID;

    if (!apiKey || !engineId) {
      return NextResponse.json(
        { error: "Missing Lingo.dev configuration." },
        { status: 500 }
      );
    }

    const lingo = new LingoDotDevEngine({
      apiKey,
      engineId,
    });

    const messages = await Promise.all(
      room.messages.map(async (message) => {
        let translatedText = message.originalText;

        if (message.originalLanguage !== viewerLanguage) {
          if (!message.translations[viewerLanguage]) {
            message.translations[viewerLanguage] = await lingo.localizeText(
              message.originalText,
              {
                sourceLocale: message.originalLanguage as SupportedLocale,
                targetLocale: viewerLanguage,
              }
            );
          }

          translatedText = message.translations[viewerLanguage];
        }

        return {
          id: message.id,
          senderName: message.senderName,
          originalText: message.originalText,
          originalLanguage: message.originalLanguage,
          translatedText,
          translatedLanguage: viewerLanguage,
          createdAt: message.createdAt,
        };
      })
    );

    return NextResponse.json(
      serializeRoom(
        room.roomCode,
        participant.id,
        participant.displayName,
        participant.preferredLanguage,
        messages
      )
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}