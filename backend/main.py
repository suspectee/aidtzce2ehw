from __future__ import annotations

import asyncio
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


DEFAULT_CODE = """function summarizeEvents(events) {
  // Return a summary grouped by event type.
  return events.reduce((summary, event) => {
    const current = summary[event.type] ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += event.value;
    summary[event.type] = current;
    return summary;
  }, {});
}

const sample = [
  { type: \"click\", value: 12 },
  { type: \"view\", value: 4 },
  { type: \"click\", value: 8 },
];

console.log(JSON.stringify(summarizeEvents(sample), null, 2));"""


class CreateRoomRequest(BaseModel):
    title: str = "Frontend Engineer · Live interview"


@dataclass
class Participant:
    client_id: str
    name: str
    color: str

    def public(self) -> dict[str, str]:
        return {
            "clientId": self.client_id,
            "name": self.name,
            "color": self.color,
        }


@dataclass
class Room:
    room_id: str
    title: str
    code: str = DEFAULT_CODE
    language: str = "javascript"
    version: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    clients: dict[WebSocket, Participant] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def snapshot(self) -> dict[str, Any]:
        return {
            "type": "room:snapshot",
            "roomId": self.room_id,
            "title": self.title,
            "code": self.code,
            "language": self.language,
            "version": self.version,
            "participants": [participant.public() for participant in self.clients.values()],
        }


app = FastAPI(title="Pairwise API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rooms: dict[str, Room] = {}
COLORS = ["#e46d3c", "#6c8cff", "#55b98a", "#be78d3", "#d6a73f", "#3ba9ba"]


def get_or_create_room(room_id: str, title: str | None = None) -> Room:
    if room_id not in rooms:
        rooms[room_id] = Room(
            room_id=room_id,
            title=title or "Frontend Engineer · Live interview",
        )
    return rooms[room_id]


async def broadcast(room: Room, message: dict[str, Any]) -> None:
    stale: list[WebSocket] = []
    for socket in list(room.clients):
        try:
            await socket.send_json(message)
        except Exception:
            stale.append(socket)
    for socket in stale:
        room.clients.pop(socket, None)


async def broadcast_presence(room: Room) -> None:
    await broadcast(
        room,
        {
            "type": "presence:update",
            "participants": [participant.public() for participant in room.clients.values()],
        },
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/rooms", status_code=201)
async def create_room(payload: CreateRoomRequest) -> dict[str, Any]:
    title = payload.title.strip()[:100] or "Frontend Engineer · Live interview"
    while True:
        room_id = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
        if room_id not in rooms:
            break
    room = get_or_create_room(room_id, title)
    return {
        "roomId": room.room_id,
        "title": room.title,
        "createdAt": room.created_at.isoformat(),
    }


@app.get("/api/rooms/{room_id}")
async def room_details(room_id: str) -> dict[str, Any]:
    room = rooms.get(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room.snapshot()


@app.websocket("/ws/rooms/{room_id}")
async def room_socket(
    websocket: WebSocket,
    room_id: str,
    client_id: str = "guest",
    name: str = "Guest",
) -> None:
    await websocket.accept()
    room = get_or_create_room(room_id[:32])
    color = COLORS[sum(ord(char) for char in client_id) % len(COLORS)]
    participant = Participant(
        client_id=client_id[:64],
        name=(name.strip() or "Guest")[:32],
        color=color,
    )
    room.clients[websocket] = participant

    await websocket.send_json(room.snapshot())
    await broadcast_presence(room)

    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")

            if message_type == "code:update":
                code = message.get("code", "")
                language = message.get("language", room.language)
                if not isinstance(code, str) or len(code) > 150_000:
                    await websocket.send_json(
                        {"type": "room:error", "message": "Document is too large."}
                    )
                    continue
                if language not in {"javascript", "python", "typescript", "html", "css", "json"}:
                    language = "javascript"

                async with room.lock:
                    room.code = code
                    room.language = language
                    room.version += 1
                    update = {
                        "type": "code:update",
                        "code": room.code,
                        "language": room.language,
                        "version": room.version,
                        "clientId": participant.client_id,
                    }
                await broadcast(room, update)

            elif message_type == "presence:rename":
                next_name = str(message.get("name", "")).strip()[:32]
                if next_name:
                    participant.name = next_name
                    await broadcast_presence(room)

            elif message_type == "ping":
                await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        room.clients.pop(websocket, None)
        await broadcast_presence(room)
