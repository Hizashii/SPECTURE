import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_BODY = json.dumps(
    {
        "error": {
            "code": "payload_too_large",
            "message": "Request body is too large.",
            "details": None,
        }
    }
).encode()


class _TooLarge(Exception):
    pass


class BodySizeLimit:
    """Refuses request bodies over ``max_bytes``, whether or not Content-Length is sent."""

    def __init__(self, app: ASGIApp, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = False

        async def tracking_send(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        async def refuse() -> None:
            await send(
                {
                    "type": "http.response.start",
                    "status": 413,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(_BODY)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": _BODY})

        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await refuse()
            return

        total = 0

        async def limited_receive() -> Message:
            nonlocal total
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body", b""))
                if total > self.max_bytes:
                    raise _TooLarge
            return message

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _TooLarge:
            if not started:
                await refuse()
