"""MCP connection and authentication.

This is the ONLY module that knows how a target is authenticated (design §5,
D18). Everything else receives ready-to-use tools.

Vertical slice: `auth = "bearer"` only. The OAuth authorization-code and
client-credentials modes (D18/D19) are NOT implemented here yet; a target that
declares them raises, rather than silently degrading to something weaker.
"""

from __future__ import annotations

import base64
import hashlib
import http.server
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .config import env_or

SUPPORTED_AUTH = {"bearer", "oauth"}

#: Per-target token cache. Gitignored, mode 0600, and NEVER copied into runs/.
AUTH_DIR = Path(__file__).resolve().parent.parent / ".auth"

#: How long preflight waits for the browser callback before giving up, so a run
#: can never hang forever on a human who walked away.
DEFAULT_AUTH_WAIT = int(os.environ.get("MCP_TEST_AUTH_WAIT", "180"))

#: Loopback port for the redirect. Fixed rather than ephemeral because the
#: redirect URI is registered with the authorization server and must match.
DEFAULT_REDIRECT_PORT = 8765


class AuthError(RuntimeError):
    """No usable credential for a target. Maps to harnessError.kind == 'auth'."""


def resolve_token(target: dict[str, Any]) -> str:
    """Resolve the bearer token for a target. Never returns an empty string.

    Both auth modes end here, because both end in an Authorization header:
    OAuth is a way of OBTAINING a bearer token, not a replacement for it.
    """
    auth = target.get("auth", "bearer")
    if auth not in SUPPORTED_AUTH:
        raise AuthError(
            f"Target {target['name']!r} declares auth={auth!r}, which is not implemented. "
            f"Supported: {sorted(SUPPORTED_AUTH)}."
        )

    if auth == "oauth":
        # Preflight (D19) already ran the interactive half, so by the time a
        # probe asks there is either a cached token or a silent refresh.
        token = cached_token(target["name"])
        if not token:
            raise AuthError(
                f"Target {target['name']!r}: no usable OAuth token. Run "
                f"`make mcp-login TARGET={target['name']}` or re-run interactively."
            )
        return token

    explicit = env_or(target.get("token_env"))
    if not explicit:
        raise AuthError(
            f"Target {target['name']!r} is auth=\"bearer\" but "
            f"{target.get('token_env')!r} is empty. Supply a token there, or "
            "configure the target as auth=\"oauth\"."
        )
    return explicit


def connection_spec(target: dict[str, Any], token: str) -> dict[str, Any]:
    """URL + headers for this target, in the shape the MCP transport wants."""
    return {
        "transport": "streamable_http",
        "url": target["url"],
        "headers": {"Authorization": f"Bearer {token}"},
    }


# --------------------------------------------------------------------------
# OAuth 2.1 authorization code + PKCE (D18/D19)
#
# Everything the harness knows about OAuth lives below this line. The rest of
# the runner only ever sees a bearer token: OAuth is a way of OBTAINING one,
# not a replacement for the Authorization header, and `auth = "bearer"` is
# untouched by any of it.
# --------------------------------------------------------------------------


def _get_json(url: str, timeout: int = 30) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", "replace"))


def _post_form(url: str, data: dict[str, str], timeout: int = 30) -> dict[str, Any]:
    body = urllib.parse.urlencode(data).encode()
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        raise AuthError(f"POST {url} failed: {exc.code} {detail}") from exc


def _post_json(url: str, payload: dict[str, Any], timeout: int = 30) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        raise AuthError(f"POST {url} failed: {exc.code} {detail}") from exc


def _resource_metadata_url(mcp_url: str) -> str:
    """Read the discovery pointer off the server's own 401 (never hardcoded).

    A target configured `auth = "oauth"` should need nothing but its URL, so
    the pointer comes from `WWW-Authenticate: ... resource_metadata="..."`.
    """
    request = urllib.request.Request(
        mcp_url,
        data=json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "mcp-tests", "version": "0.1"},
                },
            }
        ).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30):
            raise AuthError(
                f"{mcp_url} did not challenge for authentication, so OAuth discovery "
                "cannot start. Is this target really protected?"
            )
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise AuthError(f"{mcp_url} answered {exc.code}, expected a 401 challenge.") from exc
        header = exc.headers.get("WWW-Authenticate", "")

    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key.strip().lower() == "resource_metadata":
            return value.strip().strip('"')
    raise AuthError(
        f"{mcp_url} challenged without a resource_metadata pointer: {header!r}. "
        "For the local target this usually means the frontend dev server (port 3100) "
        "is not running — Tomcat does not serve the .well-known documents."
    )


def _authorization_server_metadata(issuer: str) -> dict[str, Any]:
    """Resolve AS metadata for an issuer, trying the RFC 8414 layouts in order.

    Validated, not merely fetched: `<issuer>/.well-known/oauth-authorization-server`
    on this deployment returns the MCP server's own info document with a 200, so
    a status check alone would happily accept a document with no endpoints in it.
    """
    parsed = urllib.parse.urlsplit(issuer)
    root = f"{parsed.scheme}://{parsed.netloc}"
    path = parsed.path.rstrip("/")
    candidates = [
        f"{root}/.well-known/oauth-authorization-server{path}",
        f"{root}/.well-known/openid-configuration{path}",
        f"{root}/.well-known/oauth-authorization-server",
        f"{issuer.rstrip('/')}/.well-known/oauth-authorization-server",
    ]
    tried: list[str] = []
    for url in candidates:
        try:
            meta = _get_json(url)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            tried.append(url)
            continue
        if meta.get("authorization_endpoint") and meta.get("token_endpoint"):
            return meta
        tried.append(f"{url} (200 but no endpoints)")
    raise AuthError(f"No authorization server metadata for {issuer!r}. Tried: {tried}")


def discover(mcp_url: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """(protected resource metadata, authorization server metadata) for a target."""
    metadata_url = _resource_metadata_url(mcp_url)
    try:
        resource_meta = _get_json(metadata_url)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AuthError(
            f"{mcp_url} points its OAuth discovery at {metadata_url}, which is "
            f"unreachable ({exc}). For the local target that document is served by "
            "the frontend dev server on port 3100 (vite mcpWellKnownPlugin), NOT by "
            "Tomcat — start `make dev`, or use auth = \"bearer\" for local."
        ) from exc
    servers = resource_meta.get("authorization_servers") or []
    if not servers:
        raise AuthError(f"{mcp_url}: resource metadata lists no authorization_servers.")
    return resource_meta, _authorization_server_metadata(servers[0])


def _cache_path(target_name: str) -> Path:
    return AUTH_DIR / f"{target_name}.json"


def _load_cache(target_name: str) -> dict[str, Any]:
    path = _cache_path(target_name)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_cache(target_name: str, data: dict[str, Any]) -> None:
    AUTH_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(target_name)
    # Written 0600 BEFORE any secret reaches it, not fixed up afterwards.
    handle = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(handle, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


def _register_client(
    as_meta: dict[str, Any], redirect_uri: str, scopes: str
) -> dict[str, Any]:
    endpoint = as_meta.get("registration_endpoint")
    if not endpoint:
        raise AuthError(
            "The authorization server offers no dynamic client registration and no "
            "client_id is configured for this target."
        )
    return _post_json(
        endpoint,
        {
            "client_name": "schema-forge mcp-tests harness",
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
            "scope": scopes,
        },
    )


class _CallbackServer(http.server.HTTPServer):
    """Loopback receiver that can rebind immediately.

    Without SO_REUSEADDR a socket left in TIME_WAIT by the previous attempt
    makes the next authorization fail on a port that is not actually in use.
    """

    allow_reuse_address = True


#: Enough of the CLI's own command line to recognise a sibling run. The module
#: path is what `python -m runner.cli` puts in argv, so it survives being
#: launched through `uv run`, through the Streamlit UI, or directly.
_HARNESS_MARKER = "runner.cli"


def _port_holder(port: int) -> tuple[int, str] | None:
    """(pid, command line) of whoever is LISTENING on `port`, when knowable.

    Uses `lsof`, which is present on macOS and on most Linux images, and is
    read-only. Deliberately total: every failure mode — no lsof, no permission
    to see another user's process, a slow or hung call, an unparseable line —
    returns None, and the caller falls back to the generic advice. A diagnosis
    that guesses is worse than one that admits it does not know.
    """
    lsof = shutil.which("lsof")
    if not lsof:
        return None
    try:
        pids = subprocess.run(
            [lsof, "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        ).stdout.split()
        if not pids:
            return None
        pid = int(pids[0])
        command = subprocess.run(
            ["ps", "-o", "command=", "-p", str(pid)],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        ).stdout.strip()
    except (OSError, ValueError, subprocess.SubprocessError):
        return None
    # Bounded: a command line can be arbitrarily long, and this ends up inside
    # an error message a human reads.
    if len(command) > 300:
        command = command[:300] + " ..."
    return (pid, command) if command else None


def _bind_failure_message(port: int, exc: OSError) -> str:
    """Why the loopback redirect could not be bound, blaming the right thing.

    The common cause is ANOTHER run of this same harness, still alive and
    waiting for the human to finish an OAuth login in the browser. Telling that
    user to change `redirect_port` is actively wrong: the port is registered
    with the authorization server and is supposed to stay stable, so moving it
    to dodge your own stale process trades a one-line fix for a re-registration.
    """
    holder = _port_holder(port)
    if holder and _HARNESS_MARKER in holder[1]:
        pid, command = holder
        return (
            f"Cannot bind the loopback redirect on 127.0.0.1:{port} ({exc}). "
            f"Another run of this harness (pid {pid}) is already waiting for you "
            f"to authorize it in the browser, and it is holding the port:\n"
            f"    {command}\n"
            f"Finish that login in your browser, or stop that run, then try again. "
            f"Do NOT change `redirect_port` for this: it is registered with the "
            f"authorization server and is meant to stay stable."
        )
    message = f"Cannot bind the loopback redirect on 127.0.0.1:{port} ({exc}). "
    if holder:
        message += f"Port held by pid {holder[0]}: {holder[1]}. "
    return message + "Set `redirect_port` on the target if the port is taken."


class _CallbackHandler(http.server.BaseHTTPRequestHandler):
    """Single-shot loopback receiver for the authorization code."""

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        self.server.auth_result = {k: v[0] for k, v in query.items()}  # type: ignore[attr-defined]
        body = b"<html><body><h3>You can close this tab and return to the terminal.</h3></body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: Any) -> None:
        """Silence the default stderr access log."""


@dataclass
class AuthorizationRequest:
    """One in-flight authorization, split into its two halves on purpose.

    `url` is what a CLI opens in a browser and a UI renders as a link; the
    waiting is a separate call. One implementation, two presentations — nothing
    here calls `webbrowser.open()`.
    """

    url: str
    state: str
    verifier: str
    redirect_uri: str
    client: dict[str, Any]
    as_meta: dict[str, Any]
    scopes: str
    _server: Any = field(repr=False, default=None)


def begin_authorization(
    target: dict[str, Any], *, redirect_port: int | None = None
) -> AuthorizationRequest:
    """First half: everything up to (not including) the human."""
    name = target["name"]
    cache = _load_cache(name)
    port = redirect_port or int(target.get("redirect_port", DEFAULT_REDIRECT_PORT))
    redirect_uri = f"http://127.0.0.1:{port}/callback"

    _resource_meta, as_meta = discover(target["url"])
    scopes = target.get("scopes") or " ".join(
        as_meta.get("scopes_supported", ["neo:read", "neo:write"])
    )

    client = cache.get("client") or {}
    if not client.get("client_id") or redirect_uri not in client.get("redirect_uris", []):
        client = _register_client(as_meta, redirect_uri, scopes)
        # Cached immediately, not at token time: a failed or abandoned
        # authorization would otherwise register a brand-new client on the
        # server every single attempt.
        cache["client"] = client
        cache["token_endpoint"] = as_meta["token_endpoint"]
        _save_cache(name, cache)

    if "S256" not in as_meta.get("code_challenge_methods_supported", ["S256"]):
        raise AuthError(
            f"Target {name!r}: the authorization server does not advertise S256 PKCE."
        )

    verifier = base64.urlsafe_b64encode(secrets.token_bytes(64)).decode().rstrip("=")
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    state = secrets.token_urlsafe(24)

    try:
        server = _CallbackServer(("127.0.0.1", port), _CallbackHandler)
    except OSError as exc:
        raise AuthError(_bind_failure_message(port, exc)) from exc
    server.auth_result = None  # type: ignore[attr-defined]
    server.timeout = 1

    params = {
        "response_type": "code",
        "client_id": client["client_id"],
        "redirect_uri": redirect_uri,
        "scope": scopes,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": target["url"],
    }
    url = f"{as_meta['authorization_endpoint']}?{urllib.parse.urlencode(params)}"
    return AuthorizationRequest(
        url=url,
        state=state,
        verifier=verifier,
        redirect_uri=redirect_uri,
        client=client,
        as_meta=as_meta,
        scopes=scopes,
        _server=server,
    )


def complete_authorization(
    request: AuthorizationRequest, target_name: str, *, wait: int = DEFAULT_AUTH_WAIT
) -> str:
    """Second half: wait for the callback, exchange the code, cache the tokens."""
    server = request._server
    deadline = time.monotonic() + wait
    try:
        while server.auth_result is None and time.monotonic() < deadline:
            server.handle_request()
    finally:
        server.server_close()

    result = server.auth_result
    if result is None:
        raise AuthError(
            f"Timed out after {wait}s waiting for the authorization callback. "
            "Raise MCP_TEST_AUTH_WAIT if you need longer."
        )
    if "error" in result:
        raise AuthError(
            f"Authorization denied: {result['error']} {result.get('error_description', '')}"
        )
    if result.get("state") != request.state:
        raise AuthError("Authorization state mismatch — discarding the response.")

    tokens = _post_form(
        request.as_meta["token_endpoint"],
        {
            "grant_type": "authorization_code",
            "code": result["code"],
            "redirect_uri": request.redirect_uri,
            "client_id": request.client["client_id"],
            "code_verifier": request.verifier,
            "resource": "",
        },
    )
    return _store_tokens(target_name, request.client, request.as_meta, tokens)


def _store_tokens(
    target_name: str,
    client: dict[str, Any],
    as_meta: dict[str, Any],
    tokens: dict[str, Any],
) -> str:
    access = tokens.get("access_token")
    if not access:
        raise AuthError(f"Token endpoint returned no access_token: {tokens}")
    cache = _load_cache(target_name)
    cache.update(
        {
            "client": client,
            "token_endpoint": as_meta["token_endpoint"],
            "access_token": access,
            "refresh_token": tokens.get("refresh_token") or cache.get("refresh_token"),
            # 60s of slack so a token cannot expire between the check and the call.
            "expires_at": time.time() + int(tokens.get("expires_in", 3600)) - 60,
        }
    )
    _save_cache(target_name, cache)
    return access


def _refresh(target_name: str, cache: dict[str, Any]) -> str | None:
    """Silent mid-run refresh. Returns None when it is not possible."""
    if not cache.get("refresh_token") or not cache.get("token_endpoint"):
        return None
    try:
        tokens = _post_form(
            cache["token_endpoint"],
            {
                "grant_type": "refresh_token",
                "refresh_token": cache["refresh_token"],
                "client_id": cache["client"]["client_id"],
            },
        )
    except AuthError:
        return None
    return _store_tokens(target_name, cache["client"], {"token_endpoint": cache["token_endpoint"]}, tokens)


def cached_token(target_name: str) -> str | None:
    """A still-valid access token for a target, refreshing silently if needed."""
    cache = _load_cache(target_name)
    if not cache.get("access_token"):
        return None
    if cache.get("expires_at", 0) > time.time():
        return cache["access_token"]
    return _refresh(target_name, cache)


def is_headless() -> bool:
    """No TTY, no DISPLAY, or CI — behave as --no-interactive without being asked."""
    if os.environ.get("CI"):
        return True
    if not sys.stdin.isatty():
        return True
    return sys.platform not in ("darwin", "win32") and not os.environ.get("DISPLAY")


def preflight(
    target: dict[str, Any],
    *,
    interactive: bool,
    on_authorize_url: Callable[[str], None] | None = None,
    wait: int = DEFAULT_AUTH_WAIT,
) -> None:
    """Resolve auth for a target BEFORE the first probe runs (D19).

    Front-loaded, never lazy: a 20-minute run that stops at probe 7 waiting for
    a browser only finishes if the human never walked away. Once probe 1 starts,
    no human is needed again — and bad credentials surface in second 2.
    """
    auth = target.get("auth", "bearer")
    if auth == "bearer":
        resolve_token(target)
        return
    if auth != "oauth":
        raise AuthError(f"Target {target['name']!r}: auth={auth!r} is not implemented.")

    if cached_token(target["name"]):
        return
    if not interactive:
        raise AuthError(
            f"Target {target['name']!r}: no valid cached token and the run is "
            "non-interactive, so the browser flow cannot start."
        )

    request = begin_authorization(target)
    if on_authorize_url:
        on_authorize_url(request.url)
    complete_authorization(request, target["name"], wait=wait)


@asynccontextmanager
async def mcp_session(target: dict[str, Any]):
    """Open one MCP session for one probe and yield the raw MCP `ClientSession`.

    Probes are fully independent (design §3): a fresh session per probe, closed
    when the probe ends.

    Deliberately returns an SDK session, not LangChain tools: converting the
    session into agent-library tools belongs to `agent.py`, which is the single
    file allowed to import the agent library (design §5, protecting D8).
    """
    # Imported lazily so that `--help` and config errors do not require the
    # MCP stack to be installed.
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    token = resolve_token(target)
    spec = connection_spec(target, token)
    async with streamablehttp_client(spec["url"], headers=spec["headers"]) as (
        read,
        write,
        _get_session_id,
    ):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session


class VerificationError(RuntimeError):
    """The post-condition check could not be carried out.

    Distinct from "the effect is absent": could-not-verify and verified-absent
    are different answers and must never be conflated.
    """


async def call_tool(session: Any, name: str, args: dict[str, Any]) -> Any:
    """Call one MCP tool and return its parsed JSON payload.

    Used by the expectEffect post-condition, which runs outside the agent, in
    its own session, so nothing the agent held can influence the answer.
    """
    try:
        result = await session.call_tool(name, args)
    except Exception as exc:  # noqa: BLE001 - surfaced as a harness error, not a verdict
        raise VerificationError(f"calling {name}: {type(exc).__name__}: {exc}") from exc

    if getattr(result, "isError", False):
        raise VerificationError(f"{name} returned an error: {result.content}")

    texts = [c.text for c in result.content if getattr(c, "type", None) == "text"]
    if not texts:
        raise VerificationError(f"{name} returned no text content")
    try:
        return json.loads(texts[0])
    except json.JSONDecodeError as exc:
        raise VerificationError(f"{name} returned non-JSON content") from exc


def count_rows(payload: Any) -> int:
    """How many records an MCP read returned, across the shapes NEO uses."""
    if isinstance(payload, list):
        return len(payload)
    if not isinstance(payload, dict):
        raise VerificationError(f"cannot count rows in a {type(payload).__name__}")
    for key in ("totalRows", "totalCount"):
        if isinstance(payload.get(key), int):
            return payload[key]
    for key in ("data", "items", "results", "records"):
        if isinstance(payload.get(key), list):
            return len(payload[key])
    raise VerificationError(f"cannot count rows in payload keys {sorted(payload)}")
