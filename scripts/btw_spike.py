#!/usr/bin/env python3
"""Phase 2.0 spike — /btw capture from live PTY.

Runs a hidden PTY session, sends a normal message to seed context, then
sends `/btw what's 2 plus 2?` and captures all ANSI/escape output.
Analyses the byte stream for modal open/close markers and checks whether
/btw content appears in the parent session's JSONL.

Usage:
    cd /tmp/btw-spike-<ts>   # scratch git-init'd dir
    CLAUDE_CONFIG_DIR=~/.cc-mirror/zai/config \
    python3 /path/to/btw_spike.py

Or run directly (see __main__ block — sets env and scratch cwd itself).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Paths / constants
# ---------------------------------------------------------------------------

ZAI_BIN = Path.home() / ".cc-mirror/zai/native/claude"
ZAI_CONFIG_DIR = Path.home() / ".cc-mirror/zai/config"

# ---------------------------------------------------------------------------
# Import PtyChannel from the repo
# ---------------------------------------------------------------------------

_REPO_SRC = Path(__file__).parent.parent / "src"
if str(_REPO_SRC) not in sys.path:
    sys.path.insert(0, str(_REPO_SRC))

from clau_decode.pty_runner import (  # noqa: E402
    DEFAULT_COLS,
    DEFAULT_ROWS,
    PtyChannel,
    _pty_env,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ensure_trust(config_dir: Path, cwd: str) -> bool:
    """Pre-empt the TUI trust dialog (copied from server.py)."""
    path = config_dir / ".claude.json"
    if path.exists():
        with path.open("r") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise RuntimeError(f"{path}: expected top-level object")
    else:
        data = {}
    projects = data.setdefault("projects", {})
    proj = projects.setdefault(cwd, {})
    if proj.get("hasTrustDialogAccepted") is True:
        return False
    proj["hasTrustDialogAccepted"] = True
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)
    return True


def _strip_ansi(data: bytes) -> str:
    """Remove ANSI escape sequences and return printable UTF-8 text."""
    text = data.decode("utf-8", errors="replace")
    # Remove CSI sequences (ESC [ ... final-byte)
    text = re.sub(r"\x1b\[[^a-zA-Z]*[a-zA-Z]", "", text)
    # Remove OSC sequences (ESC ] ... ST or BEL)
    text = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", text)
    # Remove other ESC + one-char sequences
    text = re.sub(r"\x1b[^[]", "", text)
    # Remove remaining bare ESC
    text = re.sub(r"\x1b", "", text)
    # Remove carriage returns
    text = text.replace("\r", "")
    return text


def extract_btw_response(raw_bytes: bytes, modal_open_offset: int) -> Optional[str]:
    """Extract the assistant text from the /btw modal region.

    Spike finding: the /btw TUI renders responses via cursor-relative
    in-place writes (no alt-screen). The final response text is written
    with the pattern:

        CSI 4C CSI 3A <text> CSI K  (= move right 4, up 3, write text, clear-to-EOL)

    This pattern distinguishes the FINAL write from the loading animation
    frames (which use colour wrappers: CSI_color <char> CSI_reset instead
    of a trailing CSI K).  The LAST match of this pattern before the
    footer "↑/↓scroll · f to fork · Esc to close" is the complete
    response.

    Falls back to a broader ANSI-strip scan if the cursor-relative
    pattern is not found (e.g., future TUI versions may change rendering).

    Returns None if no extractable text is found.
    """
    if modal_open_offset < 0 or modal_open_offset >= len(raw_bytes):
        return None
    region = raw_bytes[modal_open_offset:]

    # Primary extraction: find the final cursor-relative write before the footer.
    # Pattern: \x1b[4C\x1b[3A <non-ESC text> \x1b[K
    final_write_re = re.compile(rb"\x1b\[4C\x1b\[3A([^\x1b]+)\x1b\[K")
    footer_marker = "↑/↓scroll".encode("utf-8")
    footer_idx = region.find(footer_marker)
    search_region = region if footer_idx < 0 else region[:footer_idx]

    matches = list(final_write_re.finditer(search_region))
    if matches:
        # Last match is the complete response (earlier matches are partial
        # streaming updates at earlier cursor positions within the response).
        text = matches[-1].group(1).decode("utf-8", errors="replace").strip()
        if text:
            return text

    # Fallback: broad ANSI-strip.
    stripped = _strip_ansi(region)
    lines = [ln.strip() for ln in stripped.splitlines()]
    content_lines = [
        ln for ln in lines
        if ln
        and not all(c in "─│┌┐└┘╔╗╚╝╠╣═╦╩╪─ /-|>" for c in ln)
        and not ln.startswith("/btw")
    ]
    return "\n".join(content_lines) if content_lines else None


# ---------------------------------------------------------------------------
# Inline unit assertions for extract_btw_response
# ---------------------------------------------------------------------------

def _run_inline_assertions() -> None:
    """Quick sanity-check extract_btw_response with synthetic fixtures.

    Fixtures use the real cursor-relative write pattern discovered in
    the spike:  CSI 4C  CSI 3A  <text>  CSI K  (move right, up, write, clear-to-EOL).
    """
    # Fixture 1: exact pattern from the spike — should extract "4."
    # Synthesised to match the real pattern: \x1b[4C\x1b[3A<text>\x1b[K
    f1 = b"\x1b[4C\x1b[3A4.\x1b[K"
    result1 = extract_btw_response(f1, 0)
    assert result1 is not None and "4." in result1, (
        f"fixture1 failed: {result1!r}"
    )

    # Fixture 2: modal_open_offset beyond all bytes → None
    result2 = extract_btw_response(b"abc", 999)
    assert result2 is None, f"fixture2 failed: {result2!r}"

    # Fixture 3: animation frames followed by final write — should return
    # the final "The answer is 4" not the animation chars
    # Animation: \x1b[4C\x1b[3A\x1b[38;2;255;193;7mo\x1b[39m  (yellow 'o' = animation)
    # Final:     \x1b[4C\x1b[3AThe answer is 4\x1b[K
    f3 = (
        b"\x1b[4C\x1b[3A\x1b[38;2;255;193;7mo\x1b[39m"   # animation frame 1
        b"\x1b[4C\x1b[3A\x1b[38;2;255;193;7mO\x1b[39m"   # animation frame 2
        b"\x1b[4C\x1b[3AThe answer is 4\x1b[K"            # final write
    )
    result3 = extract_btw_response(f3, 0)
    assert result3 is not None and "The answer is 4" in result3, (
        f"fixture3 failed: {result3!r}"
    )

    print("[assertions] all 3 inline assertions passed")


# ---------------------------------------------------------------------------
# JSONL helpers
# ---------------------------------------------------------------------------


def _encoded_path(cwd: str) -> str:
    """Encode a cwd path the same way claude does for its projects dir.

    claude uses the real path (resolving symlinks), strips the leading /,
    then replaces each / with -.  On macOS /tmp is a symlink to /private/tmp.
    """
    real = os.path.realpath(cwd)
    return real.lstrip("/").replace("/", "-")


def _find_jsonl(config_dir: Path, cwd: str, session_id: str) -> Optional[Path]:
    encoded = _encoded_path(cwd)
    projects_dir = config_dir / "projects"
    # Prefer exact encoded directory; fall back to scanning for partial match.
    candidate = projects_dir / encoded / f"{session_id}.jsonl"
    if candidate.exists():
        return candidate
    # Try scanning all project dirs for the session_id file.
    if projects_dir.exists():
        for d in projects_dir.iterdir():
            p = d / f"{session_id}.jsonl"
            if p.exists():
                return p
    return None


def _has_btw_content(jsonl_path: Optional[Path], keywords: list[str]) -> bool:
    """Return True if ANY of the keywords appear in the JSONL (case-insensitive)."""
    if jsonl_path is None or not jsonl_path.exists():
        return False
    try:
        text = jsonl_path.read_text(errors="replace").lower()
    except OSError:
        return False
    return any(kw.lower() in text for kw in keywords)


def _count_jsonl_entries(jsonl_path: Optional[Path]) -> dict:
    """Count user/assistant entries in the JSONL."""
    counts: dict[str, int] = {"user": 0, "assistant": 0, "other": 0}
    if jsonl_path is None or not jsonl_path.exists():
        return counts
    try:
        for line in jsonl_path.read_text(errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = d.get("type", "other")
            if t in counts:
                counts[t] += 1
            else:
                counts["other"] += 1
    except OSError:
        pass
    return counts


def _latest_assistant_has_stop(jsonl_path: Optional[Path]) -> bool:
    """True if the latest assistant entry in the JSONL has stop_reason set."""
    if jsonl_path is None or not jsonl_path.exists():
        return False
    try:
        lines = jsonl_path.read_text(errors="replace").splitlines()
    except OSError:
        return False
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        if d.get("type") == "assistant":
            msg = d.get("message", {})
            return bool(isinstance(msg, dict) and msg.get("stop_reason"))
    return False


# ---------------------------------------------------------------------------
# Escape sequence detectors
# ---------------------------------------------------------------------------


def _find_escape_markers(raw: bytes) -> dict:
    """Scan raw bytes for known escape sequences relevant to /btw.

    Returns a dict mapping sequence name → list of byte offsets.
    """
    patterns = {
        "alt_screen_enter":   b"\x1b[?1049h",
        "alt_screen_exit":    b"\x1b[?1049l",
        "cursor_save_decsc":  b"\x1b7",
        "cursor_restore_decrc": b"\x1b8",
        "cursor_save_sco":    b"\x1b[s",
        "cursor_restore_sco": b"\x1b[u",
        "clear_screen":       b"\x1b[2J",
        "erase_display":      b"\x1b[J",
        "bracketed_paste_on": b"\x1b[?2004h",
        "bracketed_paste_off": b"\x1b[?2004l",
        "cursor_hide":        b"\x1b[?25l",
        "cursor_show":        b"\x1b[?25h",
        "set_title":          b"\x1b]0;",
        "csi_private_mode":   None,  # handled separately
    }
    results: dict[str, list[int]] = {}
    for name, seq in patterns.items():
        if seq is None:
            continue
        offsets = []
        start = 0
        while True:
            idx = raw.find(seq, start)
            if idx == -1:
                break
            offsets.append(idx)
            start = idx + len(seq)
        if offsets:
            results[name] = offsets

    # Also scan for any CSI private mode sequences (ESC [ ? <digits> <letter>)
    priv_mode_re = re.compile(rb"\x1b\[\?(\d+)([hl])")
    priv_modes: dict[str, list[int]] = {}
    for m in priv_mode_re.finditer(raw):
        key = f"csi_?{m.group(1).decode()}{m.group(2).decode()}"
        priv_modes.setdefault(key, []).append(m.start())
    results.update(priv_modes)

    return results


# ---------------------------------------------------------------------------
# Main spike coroutine
# ---------------------------------------------------------------------------


async def run_spike(scratch_cwd: str, bin_raw: str) -> dict:
    """Run the full /btw spike. Returns a results dict."""
    bin_path = str(Path(bin_raw).expanduser())
    session_id = str(uuid.uuid4())
    raw_bytes = bytearray()
    chunks_log: list[tuple[float, int]] = []  # (timestamp, byte_count)

    print(f"[spike] session_id: {session_id}")
    print(f"[spike] cwd: {scratch_cwd}")
    print(f"[spike] bin: {bin_path}")

    # --- Trust pre-flight -----------------------------------------------
    trusted = _ensure_trust(ZAI_CONFIG_DIR, scratch_cwd)
    print(f"[spike] trust pre-flight: {'wrote' if trusted else 'already trusted'}")

    # --- Build env -------------------------------------------------------
    # _pty_env calls _bin_auth_method which probes via 'auth status'.
    # For zai the probe reports 'claude.ai' (because it sees no token),
    # so we must manually inject the API key and base URL that zai needs.
    env = await _pty_env(DEFAULT_ROWS, DEFAULT_COLS, bin_path)
    # Override CLAUDE_CONFIG_DIR to zai's config dir.
    env["CLAUDE_CONFIG_DIR"] = str(ZAI_CONFIG_DIR)
    # Inject zai-specific env vars from its settings.
    zai_settings_path = ZAI_CONFIG_DIR / "settings.json"
    if zai_settings_path.exists():
        with zai_settings_path.open() as f:
            zai_settings = json.load(f)
        for k, v in zai_settings.get("env", {}).items():
            env[k] = v
    # CC_MIRROR_UNSET_AUTH_TOKEN tells the cc-mirror shim to unset the token;
    # for our purposes we need the raw API key to stay in env.
    env.pop("CC_MIRROR_UNSET_AUTH_TOKEN", None)
    # ANTHROPIC_API_KEY must be present (injected by clau-decode-launch).
    if "ANTHROPIC_API_KEY" in os.environ:
        env["ANTHROPIC_API_KEY"] = os.environ["ANTHROPIC_API_KEY"]

    print(f"[spike] ANTHROPIC_BASE_URL: {env.get('ANTHROPIC_BASE_URL', '(not set)')}")
    print(f"[spike] CLAUDE_CONFIG_DIR:  {env.get('CLAUDE_CONFIG_DIR', '(not set)')}")
    print(f"[spike] ANTHROPIC_API_KEY:  {'(set)' if env.get('ANTHROPIC_API_KEY') else '(MISSING)'}")

    # --- Build argv ------------------------------------------------------
    argv = [
        bin_path,
        "--session-id", session_id,
        "--permission-mode", "dontAsk",
    ]

    # --- on_chunk hook ---------------------------------------------------
    def on_chunk(channel: PtyChannel, chunk: bytes) -> None:
        raw_bytes.extend(chunk)
        chunks_log.append((time.monotonic(), len(chunk)))

    # --- Spawn -----------------------------------------------------------
    channel = PtyChannel(
        session_id=session_id,
        argv=argv,
        cwd=scratch_cwd,
        env=env,
        rows=DEFAULT_ROWS,
        cols=DEFAULT_COLS,
        on_chunk=on_chunk,
        jsonl_path=None,  # skip ownership sidecar for spike
    )

    results: dict = {
        "session_id": session_id,
        "scratch_cwd": scratch_cwd,
        "bin": bin_path,
        "channel_started": False,
        "await_ready_result": False,
        "first_msg_sent": False,
        "first_msg_jsonl_ok": False,
        "btw_sent": False,
        "btw_bytes_received": 0,
        "btw_drained_ok": False,
        "btw_content_in_jsonl": False,
        "btw_text_extracted": None,
        "modal_open_offset": -1,
        "modal_close_offset": -1,
        "esc_effect": "unknown",
        "post_btw_msg_ok": False,
        "jsonl_path": None,
        "jsonl_counts_pre_btw": {},
        "jsonl_counts_post_btw": {},
        "escape_markers": {},
        "verdict": "UNKNOWN",
        "error": None,
    }

    raw_bin_path = Path(scratch_cwd) / "btw_raw.bin"

    try:
        await channel.start()
        results["channel_started"] = True
        print("[spike] channel started")

        ready = await channel.await_ready(timeout_s=5.0)
        results["await_ready_result"] = ready
        print(f"[spike] await_ready: {ready}")

        # Post-ready settle (Phase 8 finding: input dropped during bootstrap)
        print("[spike] settling 3s post-ready ...")
        await asyncio.sleep(3.0)

        # ----------------------------------------------------------------
        # 1. First regular message — prove the channel works
        # ----------------------------------------------------------------
        print("[spike] sending first message: 'hello'")
        first_msg = b"hello"
        for byte in first_msg:
            channel.write(bytes([byte]))
            await asyncio.sleep(0.005)
        channel.write(b"\r")
        results["first_msg_sent"] = True

        # Wait for JSONL to appear with an assistant entry (stop_reason set)
        print("[spike] waiting for JSONL assistant entry (up to 180s) ...")
        jsonl_path: Optional[Path] = None
        deadline = asyncio.get_event_loop().time() + 180.0
        while asyncio.get_event_loop().time() < deadline:
            if jsonl_path is None:
                jsonl_path = _find_jsonl(ZAI_CONFIG_DIR, scratch_cwd, session_id)
                if jsonl_path:
                    results["jsonl_path"] = str(jsonl_path)
                    print(f"[spike] JSONL found: {jsonl_path}")
            if jsonl_path and _latest_assistant_has_stop(jsonl_path):
                results["first_msg_jsonl_ok"] = True
                print("[spike] first message: assistant turn complete in JSONL")
                break
            await asyncio.sleep(1.0)
        else:
            print("[spike] TIMEOUT waiting for first message assistant entry")

        results["jsonl_counts_pre_btw"] = _count_jsonl_entries(jsonl_path)
        print(f"[spike] JSONL counts pre-/btw: {results['jsonl_counts_pre_btw']}")

        # Checkpoint: save raw bytes so far
        raw_bin_path.write_bytes(bytes(raw_bytes))
        pre_btw_byte_count = len(raw_bytes)
        print(f"[spike] raw bytes before /btw: {pre_btw_byte_count}")

        if not results["first_msg_jsonl_ok"]:
            results["verdict"] = "DEAD"
            results["error"] = "first message never completed — channel may be broken"
            return results

        # ----------------------------------------------------------------
        # 2. The /btw test
        # ----------------------------------------------------------------
        print("[spike] sending /btw command ...")
        btw_msg = b"/btw what's 2 plus 2?"
        btw_send_time = time.monotonic()
        for byte in btw_msg:
            channel.write(bytes([byte]))
            await asyncio.sleep(0.005)
        channel.write(b"\r")
        results["btw_sent"] = True

        # Drain for up to 180s: stop when quiet for 4s AND at least 200 new bytes
        print("[spike] draining /btw output (up to 180s) ...")
        drain_start = asyncio.get_event_loop().time()
        drain_end = drain_start + 180.0
        last_chunk_time = time.monotonic()
        while asyncio.get_event_loop().time() < drain_end:
            await asyncio.sleep(0.2)
            new_bytes = len(raw_bytes) - pre_btw_byte_count
            idle_s = time.monotonic() - last_chunk_time
            # Update last_chunk_time if we got more bytes
            if new_bytes > results["btw_bytes_received"]:
                results["btw_bytes_received"] = new_bytes
                last_chunk_time = time.monotonic()
            # Stop if quiet for 4s AND we've got at least 200 bytes
            if idle_s >= 4.0 and new_bytes >= 200:
                results["btw_drained_ok"] = True
                print(f"[spike] /btw drain complete: {new_bytes} new bytes, idle {idle_s:.1f}s")
                break
        else:
            new_bytes = len(raw_bytes) - pre_btw_byte_count
            print(f"[spike] /btw drain ceiling hit: {new_bytes} new bytes")
            if new_bytes > 0:
                results["btw_drained_ok"] = True

        # Save checkpoint
        raw_bin_path.write_bytes(bytes(raw_bytes))
        print(f"[spike] total raw bytes after /btw: {len(raw_bytes)}")

        # ----------------------------------------------------------------
        # 3. JSONL pollution check
        # ----------------------------------------------------------------
        btw_keywords = ["2 plus 2", "plus 2", "what's 2", "four", "4"]
        btw_in_jsonl = _has_btw_content(jsonl_path, btw_keywords)
        results["btw_content_in_jsonl"] = btw_in_jsonl
        print(f"[spike] /btw content in JSONL: {btw_in_jsonl}")

        # ----------------------------------------------------------------
        # 4. Escape sequence analysis
        # ----------------------------------------------------------------
        btw_region = bytes(raw_bytes[pre_btw_byte_count:])
        markers = _find_escape_markers(btw_region)
        results["escape_markers"] = {k: v[:5] for k, v in markers.items()}  # first 5 offsets each
        print(f"[spike] escape markers in /btw region: {list(markers.keys())}")

        # Find modal open: look for cursor_hide or alt-screen or clear-screen
        modal_open_candidates = []
        for key in ("alt_screen_enter", "clear_screen", "cursor_hide"):
            if key in markers:
                modal_open_candidates.extend(
                    (pre_btw_byte_count + off, key) for off in markers[key]
                )
        modal_open_candidates.sort()
        if modal_open_candidates:
            results["modal_open_offset"] = modal_open_candidates[0][0]
            print(f"[spike] modal open candidate: offset {results['modal_open_offset']} ({modal_open_candidates[0][1]})")

        # Find modal close: alt-screen exit, cursor-show after content
        modal_close_candidates = []
        for key in ("alt_screen_exit", "cursor_show"):
            if key in markers and len(markers[key]) > 1:
                # Use the LAST occurrence (when returning to main screen)
                modal_close_candidates.append(
                    (pre_btw_byte_count + markers[key][-1], key)
                )
        modal_close_candidates.sort()
        if modal_close_candidates:
            results["modal_close_offset"] = modal_close_candidates[-1][0]
            print(f"[spike] modal close candidate: offset {results['modal_close_offset']} ({modal_close_candidates[-1][1]})")

        # Try text extraction
        if results["modal_open_offset"] >= 0:
            extracted = extract_btw_response(
                bytes(raw_bytes),
                results["modal_open_offset"],
            )
        else:
            # Fall back: try from start of /btw region
            extracted = extract_btw_response(bytes(raw_bytes), pre_btw_byte_count)
        results["btw_text_extracted"] = extracted
        print(f"[spike] extracted text (first 200 chars): {repr(extracted[:200]) if extracted else None}")

        # ----------------------------------------------------------------
        # 5. Dismiss the modal: try ESC first
        # ----------------------------------------------------------------
        print("[spike] sending ESC to dismiss modal ...")
        bytes_before_esc = len(raw_bytes)
        channel.write(b"\x1b")
        await asyncio.sleep(2.0)
        bytes_after_esc = len(raw_bytes)
        esc_produced_output = bytes_after_esc > bytes_before_esc

        if esc_produced_output:
            results["esc_effect"] = "produced_output"
            print("[spike] ESC: produced output")
        else:
            print("[spike] ESC: no output — trying Ctrl-C ...")
            bytes_before_ctrlc = len(raw_bytes)
            channel.write(b"\x03")
            await asyncio.sleep(2.0)
            bytes_after_ctrlc = len(raw_bytes)
            if bytes_after_ctrlc > bytes_before_ctrlc:
                results["esc_effect"] = "ctrlc_needed"
                print("[spike] Ctrl-C: produced output")
            else:
                results["esc_effect"] = "neither_esc_nor_ctrlc"
                print("[spike] neither ESC nor Ctrl-C produced output")

        # Settle after dismiss attempt
        await asyncio.sleep(2.0)
        raw_bin_path.write_bytes(bytes(raw_bytes))

        # ----------------------------------------------------------------
        # 6. Post-/btw verification: send 'still here' and check JSONL
        # ----------------------------------------------------------------
        print("[spike] sending post-/btw message: 'still here' ...")
        still_here = b"still here"
        pre_post_jsonl_count = _count_jsonl_entries(jsonl_path)
        for byte in still_here:
            channel.write(bytes([byte]))
            await asyncio.sleep(0.005)
        channel.write(b"\r")

        # Wait for new assistant entry
        print("[spike] waiting for 'still here' JSONL entry (up to 180s) ...")
        pre_assistant_count = pre_post_jsonl_count.get("assistant", 0)
        deadline2 = asyncio.get_event_loop().time() + 180.0
        while asyncio.get_event_loop().time() < deadline2:
            counts = _count_jsonl_entries(jsonl_path)
            if counts.get("assistant", 0) > pre_assistant_count and _latest_assistant_has_stop(jsonl_path):
                results["post_btw_msg_ok"] = True
                print("[spike] post-/btw message: assistant turn complete")
                break
            await asyncio.sleep(1.0)
        else:
            print("[spike] TIMEOUT waiting for post-/btw assistant entry")

        results["jsonl_counts_post_btw"] = _count_jsonl_entries(jsonl_path)
        print(f"[spike] JSONL counts post-/btw: {results['jsonl_counts_post_btw']}")

        # Final raw bytes save
        raw_bin_path.write_bytes(bytes(raw_bytes))
        print(f"[spike] final raw bytes: {len(raw_bytes)}")

        # ----------------------------------------------------------------
        # 7. Determine verdict
        # ----------------------------------------------------------------
        if results["btw_drained_ok"] and results["btw_bytes_received"] > 0:
            if results["post_btw_msg_ok"]:
                results["verdict"] = "VIABLE"
            else:
                results["verdict"] = "PARTIAL — /btw rendered but channel didn't recover"
        elif results["btw_sent"] and results["btw_bytes_received"] == 0:
            results["verdict"] = "DEAD — /btw produced no PTY output"
        else:
            results["verdict"] = "PARTIAL — inconclusive"

    except Exception as exc:  # noqa: BLE001
        results["verdict"] = "DEAD"
        results["error"] = f"{type(exc).__name__}: {exc}"
        print(f"[spike] ERROR: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
    finally:
        try:
            await channel.kill()
            print("[spike] channel killed")
        except Exception as exc:
            print(f"[spike] kill raised: {exc}")
        # Final save
        try:
            raw_bin_path.write_bytes(bytes(raw_bytes))
            print(f"[spike] raw bytes saved to: {raw_bin_path}")
        except Exception as exc:
            print(f"[spike] raw bytes save failed: {exc}")

    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    _run_inline_assertions()

    scratch_cwd = os.environ.get("SPIKE_CWD", "/tmp/btw-spike-1779993625")
    bin_path = os.environ.get("SPIKE_BIN", str(ZAI_BIN))

    print(f"[main] scratch cwd: {scratch_cwd}")
    print(f"[main] bin: {bin_path}")

    results = asyncio.run(run_spike(scratch_cwd, bin_path))

    print("\n" + "=" * 60)
    print("SPIKE RESULTS")
    print("=" * 60)
    print(json.dumps(
        {k: v for k, v in results.items() if k != "escape_markers"},
        indent=2, default=str
    ))
    print("\nEscape markers (keys only):", list(results.get("escape_markers", {}).keys()))

    # Write results JSON to scratch dir for the findings doc
    results_path = Path(scratch_cwd) / "spike_results.json"
    try:
        results_path.write_text(json.dumps(results, indent=2, default=str))
        print(f"\n[main] results saved to: {results_path}")
    except Exception as exc:
        print(f"[main] results save failed: {exc}")

    print(f"\n[main] VERDICT: {results['verdict']}")


if __name__ == "__main__":
    main()
