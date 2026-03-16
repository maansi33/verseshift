export type RoomParticipant = {
  id: string;
  displayName: string;
  preferredLanguage: string;
};

export type StoredRoomMessage = {
  id: string;
  senderId: string;
  senderName: string;
  originalText: string;
  originalLanguage: string;
  createdAt: string;
  translations: Record<string, string>;
};

export type Room = {
  roomCode: string;
  participants: RoomParticipant[];
  messages: StoredRoomMessage[];
};

const rooms = new Map<string, Room>();

function randomId(length: number) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

function createRoomCode() {
  let code = randomId(6);
  while (rooms.has(code)) {
    code = randomId(6);
  }
  return code;
}

export function createRoom(displayName: string, preferredLanguage: string) {
  const roomCode = createRoomCode();
  const participantId = crypto.randomUUID();

  const room: Room = {
    roomCode,
    participants: [
      {
        id: participantId,
        displayName,
        preferredLanguage,
      },
    ],
    messages: [],
  };

  rooms.set(roomCode, room);

  return { room, participantId };
}

export function joinRoom(
  roomCode: string,
  displayName: string,
  preferredLanguage: string
) {
  const room = rooms.get(roomCode);

  if (!room) return null;

  const participantId = crypto.randomUUID();

  room.participants.push({
    id: participantId,
    displayName,
    preferredLanguage,
  });

  return { room, participantId };
}

export function getRoom(roomCode: string) {
  return rooms.get(roomCode) || null;
}

export function getParticipant(room: Room, participantId: string) {
  return room.participants.find((participant) => participant.id === participantId) || null;
}

export function addRoomMessage(params: {
  roomCode: string;
  participantId: string;
  text: string;
  language: string;
}) {
  const room = rooms.get(params.roomCode);
  if (!room) return null;

  const participant = getParticipant(room, params.participantId);
  if (!participant) return null;

  const message: StoredRoomMessage = {
    id: crypto.randomUUID(),
    senderId: participant.id,
    senderName: participant.displayName,
    originalText: params.text,
    originalLanguage: params.language,
    createdAt: new Date().toISOString(),
    translations: {},
  };

  room.messages.push(message);

  return message;
}

export function listRoomsForDebug() {
  return Array.from(rooms.values());
}