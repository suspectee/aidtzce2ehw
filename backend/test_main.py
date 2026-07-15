import httpx
import pytest
from fastapi import WebSocketDisconnect

from backend.main import Participant, app, get_or_create_room, room_socket, rooms


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def clear_rooms() -> None:
    rooms.clear()


@pytest.mark.anyio
async def test_create_room() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/rooms", json={"title": "Platform interview"})

    assert response.status_code == 201
    payload = response.json()
    assert payload["title"] == "Platform interview"
    assert len(payload["roomId"]) == 8
    assert payload["roomId"].isalnum()


class FakeWebSocket:
    def __init__(self, incoming: list[dict[str, str]]) -> None:
        self.incoming = incoming
        self.sent: list[dict[str, object]] = []
        self.accepted = False

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, message: dict[str, object]) -> None:
        self.sent.append(message)

    async def receive_json(self) -> dict[str, str]:
        if not self.incoming:
            raise WebSocketDisconnect()
        return self.incoming.pop(0)


def test_room_presence_deduplicates_reconnected_client() -> None:
    room = get_or_create_room("presence-test")
    first_socket = FakeWebSocket([])
    replacement_socket = FakeWebSocket([])
    participant = Participant(client_id="same-client", name="You", color="#e46d3c")

    room.clients[first_socket] = participant  # type: ignore[index]
    room.clients[replacement_socket] = participant  # type: ignore[index]

    assert room.public_participants() == [participant.public()]
    assert room.snapshot()["participants"] == [participant.public()]


@pytest.mark.anyio
async def test_room_websocket_syncs_updates() -> None:
    socket = FakeWebSocket(
        [{"type": "code:update", "code": "print('hello')", "language": "python"}]
    )

    await room_socket(socket, "demo", client_id="a", name="Ada")  # type: ignore[arg-type]

    assert socket.accepted
    assert socket.sent[0]["type"] == "room:snapshot"
    assert socket.sent[1]["type"] == "presence:update"
    assert socket.sent[2]["type"] == "code:update"
    assert socket.sent[2]["code"] == "print('hello')"
    assert socket.sent[2]["version"] == 1
