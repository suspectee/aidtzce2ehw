from __future__ import annotations

import json
import socket
import threading
import time
from collections.abc import Callable, Generator
from typing import Any

import httpx
import pytest
import uvicorn
from websockets.sync.client import ClientConnection, connect

from backend.main import app, rooms


@pytest.fixture(scope="module")
def live_server() -> Generator[str, None, None]:
    """Run the actual ASGI app on an ephemeral TCP port for this test module."""
    rooms.clear()
    listen_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listen_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listen_socket.bind(("127.0.0.1", 0))
    listen_socket.listen()
    port = listen_socket.getsockname()[1]

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
    )
    server = uvicorn.Server(config)
    server_thread = threading.Thread(
        target=server.run,
        kwargs={"sockets": [listen_socket]},
        daemon=True,
    )
    server_thread.start()

    base_url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if not server_thread.is_alive():
            raise RuntimeError("The integration test server stopped during startup.")
        try:
            response = httpx.get(f"{base_url}/api/health", timeout=0.2)
            if response.status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.05)
    else:
        server.should_exit = True
        server_thread.join(timeout=2)
        raise RuntimeError("The integration test server did not become ready.")

    try:
        yield base_url
    finally:
        server.should_exit = True
        server_thread.join(timeout=5)
        listen_socket.close()
        if server_thread.is_alive():
            raise RuntimeError("The integration test server did not shut down cleanly.")


def create_room(base_url: str, title: str) -> dict[str, Any]:
    response = httpx.post(
        f"{base_url}/api/rooms",
        json={"title": title},
        timeout=2,
    )
    assert response.status_code == 201
    return response.json()


def websocket_url(base_url: str, room_id: str, client_id: str, name: str) -> str:
    return (
        base_url.replace("http://", "ws://")
        + f"/ws/rooms/{room_id}?client_id={client_id}&name={name}"
    )


def receive_message(
    connection: ClientConnection,
    message_type: str,
    predicate: Callable[[dict[str, Any]], bool] | None = None,
    timeout: float = 2,
) -> dict[str, Any]:
    """Skip unrelated broadcasts until the requested protocol message arrives."""
    deadline = time.monotonic() + timeout
    received_types: list[str] = []

    while time.monotonic() < deadline:
        remaining = deadline - time.monotonic()
        raw_message = connection.recv(timeout=max(remaining, 0.01))
        message = json.loads(raw_message)
        received_types.append(message.get("type", "unknown"))
        if message.get("type") == message_type and (predicate is None or predicate(message)):
            return message

    raise AssertionError(
        f"Did not receive {message_type!r}; received message types: {received_types}"
    )


def participant_ids(message: dict[str, Any]) -> set[str]:
    return {participant["clientId"] for participant in message["participants"]}


@pytest.mark.integration
def test_created_room_can_be_joined_using_the_client_protocol(live_server: str) -> None:
    room = create_room(live_server, "Backend Engineer · Integration interview")
    room_id = room["roomId"]

    assert room["title"] == "Backend Engineer · Integration interview"
    assert len(room_id) == 8

    with connect(
        websocket_url(live_server, room_id, "interviewer-1", "Ada"),
        open_timeout=2,
        close_timeout=2,
    ) as interviewer:
        snapshot = receive_message(interviewer, "room:snapshot")
        presence = receive_message(interviewer, "presence:update")

        assert snapshot["roomId"] == room_id
        assert snapshot["title"] == room["title"]
        assert snapshot["language"] == "javascript"
        assert snapshot["version"] == 0
        assert "function summarizeEvents" in snapshot["code"]
        assert participant_ids(presence) == {"interviewer-1"}

        interviewer.send(json.dumps({"type": "ping"}))
        assert receive_message(interviewer, "pong")["type"] == "pong"


@pytest.mark.integration
def test_two_clients_share_presence_edits_and_reconnect_state(live_server: str) -> None:
    room = create_room(live_server, "Full-stack Engineer · Pairing session")
    room_id = room["roomId"]
    interviewer_url = websocket_url(live_server, room_id, "interviewer-2", "Grace")
    candidate_url = websocket_url(live_server, room_id, "candidate-1", "Lin")

    with connect(interviewer_url, open_timeout=2, close_timeout=2) as interviewer:
        receive_message(interviewer, "room:snapshot")
        receive_message(interviewer, "presence:update")

        with connect(candidate_url, open_timeout=2, close_timeout=2) as candidate:
            candidate_snapshot = receive_message(candidate, "room:snapshot")
            candidate_presence = receive_message(candidate, "presence:update")
            interviewer_presence = receive_message(
                interviewer,
                "presence:update",
                lambda message: participant_ids(message)
                == {"interviewer-2", "candidate-1"},
            )

            assert participant_ids(candidate_snapshot) == {
                "interviewer-2",
                "candidate-1",
            }
            assert participant_ids(candidate_presence) == {
                "interviewer-2",
                "candidate-1",
            }
            assert participant_ids(interviewer_presence) == {
                "interviewer-2",
                "candidate-1",
            }

            first_code = "print('shared from interviewer')"
            interviewer.send(
                json.dumps(
                    {
                        "type": "code:update",
                        "code": first_code,
                        "language": "python",
                    }
                )
            )

            interviewer_update = receive_message(interviewer, "code:update")
            candidate_update = receive_message(candidate, "code:update")
            for update in (interviewer_update, candidate_update):
                assert update["clientId"] == "interviewer-2"
                assert update["code"] == first_code
                assert update["language"] == "python"
                assert update["version"] == 1

            second_code = "const answer: number = 42"
            candidate.send(
                json.dumps(
                    {
                        "type": "code:update",
                        "code": second_code,
                        "language": "typescript",
                    }
                )
            )
            candidate_update = receive_message(candidate, "code:update")
            interviewer_update = receive_message(interviewer, "code:update")
            assert candidate_update["version"] == 2
            assert interviewer_update["version"] == 2
            assert interviewer_update["code"] == second_code

        remaining_presence = receive_message(
            interviewer,
            "presence:update",
            lambda message: participant_ids(message) == {"interviewer-2"},
        )
        assert participant_ids(remaining_presence) == {"interviewer-2"}

    late_joiner_url = websocket_url(live_server, room_id, "observer-1", "Sam")
    with connect(late_joiner_url, open_timeout=2, close_timeout=2) as late_joiner:
        reconnect_snapshot = receive_message(late_joiner, "room:snapshot")
        assert reconnect_snapshot["code"] == second_code
        assert reconnect_snapshot["language"] == "typescript"
        assert reconnect_snapshot["version"] == 2

    persisted_snapshot = httpx.get(f"{live_server}/api/rooms/{room_id}", timeout=2)
    assert persisted_snapshot.status_code == 200
    assert persisted_snapshot.json()["code"] == second_code
    assert persisted_snapshot.json()["version"] == 2
