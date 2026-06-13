# Phase 2.0 spike — /btw capture from live PTY

Date: 2026-05-28
Profile: zai
Scratch cwd: /tmp/btw-spike-1779993625 (real path: /private/tmp/btw-spike-1779993625)
claude version: 2.1.148 (Claude Code)
Spike script: `scripts/btw_spike.py`

---

## VERDICT

**VIABLE** — with caveats on response extraction complexity (see Section B and the
Open Questions).

`/btw` renders and completes inside a hidden PTY with no human-facing screen.
The response was captured. The modal is NOT ephemeral at the PTY level —
it streams bytes into the existing `_on_readable` drain — but it IS
ephemeral at the JSONL level (not recorded). ESC dismisses cleanly. The channel
survived `/btw` and processed a follow-up message correctly.

---

## A. Does /btw render in a hidden PTY?

**YES.** The TUI spawned in a hidden PTY (rows=40, cols=120, no real screen)
received `/btw what's 2 plus 2?`, rendered the full modal UI including the
splash/welcome box, showed "Answering…" while the API call was in flight, and
wrote the final response "4." into the modal's response region.

Evidence:
- `await_ready` returned `True` (bracketed-paste `\x1b[?2004h` appeared at
  offset 19 of the raw stream — identical to the main TUI ready signal).
- 7,000 new bytes arrived in the PTY drain after `/btw` was sent (versus
  zero if claude had refused or silently discarded it).
- The text `Ask a quick side question without interrupting the main conversation`
  appears in the byte stream at absolute offset 11,734, confirming the modal
  header rendered.
- `4.` appears at absolute offset 18,512 — the final response written
  via the cursor-relative update pattern (see Section B).
- The channel survived, accepted a follow-up message (`still here`), and that
  message produced a new JSONL assistant entry with `stop_reason="end_turn"`.

No `isatty` or PTY-detection guard was triggered. The TUI makes no distinction
between a real terminal and a hidden PTY.

**Operational note:** The spike must be run using the venv Python
(`/path/to/.venv/bin/python3`), NOT the system Python. `PtyChannel.start()`
spawns via `python -m clau_decode._pty_preexec`, which uses `sys.executable`.
If `sys.executable` is the system Python, it fails with:
`No module named 'clau_decode'`. The venv Python sets `sys.executable` to
itself, so the preexec wrapper finds the module correctly.

---

## B. Frame markers

The `/btw` modal does **NOT** use the alternate screen buffer. There is no
`\x1b[?1049h` / `\x1b[?1049l` anywhere in the 27,562-byte capture (including
startup, first message, /btw exchange, and post-btw message). There are no
`\x1b7` / `\x1b8` (DECSC/DECRC) or `\x1b[s` / `\x1b[u` (SCO save/restore)
pairs in the /btw region.

The modal draws inline over the main screen buffer using cursor-relative
positioning sequences (CSI A/B/C/D — move up/down/right/left by N rows/cols).
This means the byte stream can NOT be split at a clean screen boundary.
All 15,962 bytes of the /btw region are part of the same contiguous PTY drain.

### Exact byte offsets (absolute, from start of raw stream)

| Range (bytes) | Description |
|---------------|-------------|
| 0–19 | TUI startup: DECSC `\x1b7`, cursor hide/show `\x1b[?25h/l`, bracketed-paste `\x1b[?2004h` |
| 0–11,600 | First message (`hello`) + assistant response + splash screen redraw |
| 11,600 | `/btw` sent to PTY stdin (boundary recorded in spike) |
| 11,600–11,734 | TUI echo of `/btw` command, cursor movement (CSI 2D 4B etc.) |
| 11,734 | **Modal open marker** — text `Ask a quick side question without interrupting the main conversation` first appears. Absolute offset: 11,734 |
| 11,734–16,828 | Modal UI box drawn: splash screen, version footer, cwd, welcome tips |
| 16,828 | `Answering\xe2\x80\xa6` ("Answering…") — API call in flight |
| 16,828–18,512 | Loading animation + streaming response. The TUI writes single characters to a fixed cursor position using: `\x1b[4C\x1b[3A\x1b[38;2;255;193;7m<char>\x1b[39m` (animation frame) repeated in the pattern `oO0Oo.` ×7 cycles |
| 18,512 | **Final response write** — `\x1b[4C\x1b[3A4.\x1b[K` — the actual answer "4." written with `\x1b[K` (erase-to-EOL) after it, distinguishing it from animation frames |
| 18,568 | Footer: `↑/↓scroll · f to fork · Esc to close` |
| 18,580 | "Esc to close" text |
| 18,580–18,600 | **Modal close sequence** triggered by ESC: `\x1b[2K\x1b[1A\x1b[2K\x1b[G\x1b[1A` (erase line, up, erase line, column 1, up) — tears down the modal overlay line by line |
| 19,954 | `still here` echo — confirms channel returned to normal prompt state |
| 27,562 | End of capture |

### Modal open

There is no single unique escape sequence that unambiguously marks the modal
open. The reliable TEXT marker is:

```
b'Ask a quick side question without interrupting the main conversation'
```

This appears in the PTY output within the first ~200 bytes after the `/btw`
command bytes are echoed back. It is unique to the `/btw` modal header.

The bytes immediately preceding this text are cursor-movement sequences
(the TUI echoing the `/btw` input as typed) — not a dedicated "modal open"
escape.

### Response region

Bounded by:
- Start: `b'Answering\xe2\x80\xa6'` (b'Answering…')
- End: `b'\xe2\x86\x91/\xe2\x86\x93scroll'` (b'↑/↓scroll') — the footer

The response content is written using a cursor-relative in-place rendering
pattern. Each character goes through a loading animation cycle (`oO0Oo.`)
before being replaced with the actual content. The FINAL write at each
position is:

```
\x1b[4C \x1b[3A <response_text> \x1b[K
```

- `\x1b[4C` — move right 4 columns
- `\x1b[3A` — move up 3 rows
- `<response_text>` — one or more printable bytes (the actual answer)
- `\x1b[K` — erase to end of line

Animation frames use colour codes instead of `\x1b[K`:
```
\x1b[4C \x1b[3A \x1b[38;2;255;193;7m <char> \x1b[39m
```

The extractor `extract_btw_response()` in `scripts/btw_spike.py` (line ~100)
uses `re.compile(rb"\x1b\[4C\x1b\[3A([^\x1b]+)\x1b\[K")` to find the final
write and returns the last match (the complete response) before the
`↑/↓scroll` footer.

### Modal close

ESC (`\x1b`) triggers the TUI to tear down the modal overlay with:

```
\x1b[2K \x1b[1A \x1b[2K \x1b[G \x1b[1A
```

(erase current line, up 1, erase line, column 1, up 1 — repeated to clear the
overlay rows). This is followed by drawing the horizontal separator line
(─────) and restoring the status bar. There is no alt-screen exit sequence.

### Private mode sequences seen (entire capture)

| Sequence | Count | First offset | Meaning |
|----------|-------|--------------|---------|
| `\x1b[?2004h` | 1 | 19 | Bracketed-paste ON (TUI ready signal) |
| `\x1b[?1004h` | 1 | 27 | Focus events ON |
| `\x1b[?2031h` | 1 | 35 | Unknown private mode (TUI internal) |
| `\x1b[?25h` | 1 | 7 | Cursor show |
| `\x1b[?25l` | 1 | 13 | Cursor hide |
| `\x1b[?1049h/l` | **0** | — | Alt-screen: NOT used |
| `\x1b[?2004l` | **0** | — | Bracketed-paste OFF: NOT seen in capture |

All private-mode sequences appear in the first 36 bytes (TUI startup). The
`/btw` region contains none.

---

## C. JSONL pollution

- Parent JSONL path: `/Users/alan/.cc-mirror/zai/config/projects/-private-tmp-btw-spike-1779993625/865615ea-a0e6-4a1d-a132-59f05432a8ba.jsonl`
- `/btw` INPUT ("what's 2 plus 2?") in JSONL: **NO**
- `/btw` RESPONSE ("4.") in JSONL: **NO**

The JSONL contains exactly two `user` entries (`hello` and `still here`) and
two `assistant` entries. The `/btw` question and answer are completely absent.
The `btw` string DOES appear in an `attachment` entry (the skills listing
snapshot claude auto-attaches) — this is a false positive from the skill named
`using-git-worktrees` and related text. The actual `/btw` conversation is
confirmed ephemeral.

**Design implication:** Phase 2's `ephemeral_messages` capture is the ONLY
way to surface `/btw` content in the clau-decode UI. If we don't capture it
from the PTY stream, it is permanently lost.

---

## D. Dismiss sequence

- **ESC** (`\x1b`): Immediately produces PTY output (confirmed by
  `esc_effect: "produced_output"` in results). The TUI erases the modal lines
  and returns to the normal prompt. Recommended.
- **Ctrl-C** (`\x03`): Not tested in this spike (ESC worked on first try).
  Phase-1 findings show Ctrl-C is used for SIGINT in the kill path — sending
  it mid-/btw might cancel the in-flight request rather than just dismiss the
  modal. Use ESC only.
- **Recommended:** Send ESC after the response is complete (i.e., after the
  `↑/↓scroll · f to fork · Esc to close` footer appears in the PTY drain).
  The channel needs ~2s after ESC for the TUI to complete the redraw before
  accepting the next regular message.

---

## Extractor function

- Path in spike: `scripts/btw_spike.py:88` (`extract_btw_response`)
- Primary method: regex `re.compile(rb"\x1b\[4C\x1b\[3A([^\x1b]+)\x1b\[K")`
  — finds the final cursor-relative write before the `↑/↓scroll` footer.
- Fallback: broad ANSI-strip scan (for future TUI versions that may change
  the rendering pattern).
- Tested against captured bytes: **PASS** — extracts `"4."` from the real
  27,562-byte capture. See `scripts/btw_spike.py:_run_inline_assertions()`.
- 3 inline `assert` fixtures: all pass.

Edge cases noted:
1. The regex pattern `\x1b[4C\x1b[3A` is specific to the current TUI's
   response column layout. If the modal is resized (different `cols`) or the
   TUI version changes the column/row offsets, the pattern may not match.
   The `\x1b[K` suffix is more stable (it distinguishes final writes from
   animation frames regardless of position). A more robust regex:
   `re.compile(rb"\x1b\[\d+C\x1b\[\d+A([^\x1b]+)\x1b\[K")` matches any
   column/row offset combination.
2. Multi-line responses: if the /btw answer spans multiple lines (the model
   gives a paragraph rather than "4."), each line is written via a separate
   final-write sequence. Phase 2 must collect ALL final-write matches before
   the footer and join them.
3. The loading animation pattern `oO0Oo.` (7 chars × 7 cycles = 49 animation
   writes per position) is specific to the spinner implementation. The 
   distinguishing marker is `\x1b[K` at end of final write, not the absence
   of colour codes.

---

## Multi-line addendum (2026-05-28)

Second smoke test: prompt `b"/btw explain the Pythagorean theorem in 3 short lines"`.
Captured bytes: `tests/fixtures/btw_capture/multiline.bin` (28,602 bytes).
Script: `/tmp/btw-mline-spike/run.py`.

### What changed from the original spike

**Modal open marker** — The full text `Ask a quick side question without
interrupting the main conversation` is no longer a contiguous byte sequence in
the newer TUI. The words are separated by column-positioning escapes
(`\x1b[49G`, `\x1b[63G`). The tail fragment
`b"without interrupting the main conversation"` remains contiguous in both
versions and is now the stable `BTW_MODAL_OPEN_MARKER`.

**Response-complete marker** — `b"\xe2\x86\x91/\xe2\x86\x93scroll"` was never
actually contiguous in either capture (as noted in Section B, the footer uses
`\x1b[10Gscroll` in the old data and `\x1b[7Gto\x1b[10Gscroll` in the new
data). The stable marker is the leading `↑/↓` arrow bytes only:
`b"\xe2\x86\x91/\xe2\x86\x93"`. `BTW_RESPONSE_COMPLETE_MARKER` has been
updated accordingly.

**Response rendering: Variant B (multi-line)** — The `\x1b[4C\x1b[3A…\x1b[K`
Variant A pattern only appeared for the single-char "4." response. For the
multi-line Pythagorean answer, the TUI used a different strategy:

- The last `\x1b[4C\x1b[3A` sequence in the animation block is immediately
  followed by printable text (not a colour escape) — this starts the response.
- Individual words are placed at absolute column positions via `\x1b[NG`
  sequences rather than written sequentially.
- Lines are separated by `\r` (bare CR), `\r\r\n`, or `\r\n` followed by
  re-positioning sequences.
- There is NO trailing `\x1b[K` on the response text.

**Extraction result (multi-line):**
```
1. In a right triangle, the square of the hypotenuse (longest side) equals the sum of the squares of the other two
sides: a² + b² = c².
2. It lets you find any missing side length when you know the other two.
3. It only applies to right triangles (triangles with a 90° angle).
```
The column-aware reconstruction in `btw_capture.extract_btw_response()` (Variant B
path) correctly reassembles the text. Some word-join spacing is conservative
(one space per `\x1b[NG` gap regardless of gap size) but the content is
complete and human-readable.

---

## Open questions for Phase 2 implementation

1. **Multi-line responses. RESOLVED.** The `\x1b[\d+C\x1b[\d+A…\x1b[K`
   Variant A pattern does NOT generalise to multi-line responses. Variant B
   (last cursor-rel sequence not followed by colour → columnar reconstruction)
   is required. Both variants are implemented in `src/clau_decode/btw_capture.py`
   and tested against real captures. See the multi-line addendum above.

2. **Column offset stability.** The `4C` (move right 4) and `3A` (move up 3)
   values were measured at `cols=120`. A narrow terminal (cols < 40) may
   produce different offsets. Clau-decode spawns at `DEFAULT_COLS=120` so
   this is stable in production, but tests using a narrow PTY will need
   updating.

3. **Response-complete signal. UPDATED.** The footer marker
   `b'\xe2\x86\x91/\xe2\x86\x93'` (`↑/↓`) is stable across both TUI versions.
   `BTW_RESPONSE_COMPLETE_MARKER` in `btw_capture.py` uses this shorter form.
   The implementation should poll the drain buffer for this byte sequence.
   NOTE: The `↑/↓` bytes also appear in the normal (non-/btw) TUI status bar,
   so always search from `open_offset` forward to avoid false matches.

4. **"f to fork" keypress.** The footer offers `f to fork`. Pressing `f` during
   the /btw modal forks the session at that point. Phase 2 should NOT send
   `f` during capture (it would create a side-chain). Only ESC should be sent.

5. **Depth of nesting.** Unknown whether a `/btw` sent DURING a `/btw` is
   possible or silently rejected by the TUI. Probably rejected given the
   "without interrupting the main conversation" description, but not tested.

6. **Input capture timing.** Phase 2 needs to capture the `/btw` input text
   BEFORE writing it to the PTY (as the `# TODO Phase 2` comment in
   `PtyManager.submit()` notes). The PTY output does contain the echoed
   input (at absolute offset 16,783: `"/btw what's 2 plus 2?"`) but
   extracting it from the echo is more fragile than grabbing it from the
   `content` string before the PTY write. Keep the pre-write capture approach.

7. **The `isSidechain` field.** The JSONL parser already handles `isSidechain`
   entries. The `/btw` ephemeral capture should write to the new
   `ephemeral_messages` table with `is_btw=True` so the FE can distinguish
   it from regular sidechain entries if needed.

---

## Raw byte capture

- `/tmp/btw-spike-1779993625/btw_raw.bin` (27,562 bytes)
- `/tmp/btw-spike-1779993625/spike_results.json` (full structured results)

Annotated offsets table:

| Byte range | Description |
|------------|-------------|
| 0–19 | TUI startup escape sequence (ready signal at 19) |
| 0–11,600 | First message (`hello`) exchange + TUI redraws |
| 11,600 | /btw input written to PTY |
| 11,600–11,734 | /btw command echo + cursor movements |
| 11,734 | **Modal open** — "Ask a quick side question…" text |
| 11,734–16,828 | Modal UI box: splash, version, cwd, tips |
| 16,828 | "Answering…" — API call in flight |
| 16,828–18,512 | Loading animation (oO0Oo.×7) at response position |
| 18,512 | **Final response write** — `\x1b[4C\x1b[3A4.\x1b[K` |
| 18,568 | "↑/↓scroll · f to fork · Esc to close" footer |
| 18,580 | "Esc to close" — response complete signal |
| 18,580–18,600 | **Modal close** — erase-line + reposition: `\x1b[2K\x1b[1A\x1b[2K\x1b[G\x1b[1A` |
| 18,600–19,954 | TUI redraws prompt + status bar after ESC |
| 19,954 | `still here` echo — channel confirmed alive post-/btw |
| 19,954–27,562 | Second message exchange (GLM response ~5.7s) |
