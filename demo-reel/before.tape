# before.tape — "Claude Code is great, until you have many sessions."
#
# Narrative:
#   1. Open with Claude Code solving a hydration bug (mock `claude` function
#      in fake-home/.zshrc — no real CLI is invoked, no real data leaks).
#   2. Pivot: "great, now where was that other chat from Monday?"
#   3. Descend into ~/.claude/projects/ — mangled dirs, walls of JSONL,
#      unreadable greps.
#   4. End on the punchline: data is on disk but unusable.
#
# Privacy: $HOME points at ./fake-home (substituted by setup.sh). All file
# operations use relative paths after a single `cd` so the real user's home
# path never appears in glob output.

Output output/before.mp4

Set Shell    "zsh"
Set FontSize 18
Set Width    1280
Set Height   720
Set Padding  40
Set TypingSpeed 30ms
Set Theme    "Catppuccin Mocha"

Env HOME    "__FAKE_HOME__"
Env USER    "taby-mctabson"
Env LANG    "en_US.UTF-8"

# Silent setup. VHS launches zsh without sourcing ~/.zshrc automatically, so
# we source it explicitly here — that defines the mock `claude` function and
# the persona prompt. Then we re-export PROMPT in case VHS's own override
# clobbered it after sourcing.
Hide
Type "source ~/.zshrc; export PROMPT='%F{green}taby-mctabson@laptop%f %F{cyan}%~%f $ '; mkdir -p ~/code/nextjs-app && cd ~/code/nextjs-app && clear"
Enter
Sleep 400ms
Show

Sleep 500ms

# --- Act 1: Claude Code in flow ---
Type "claude"
Enter
Sleep 900ms

Type "Fix the hydration error on /dashboard"
Sleep 100ms
Enter
Sleep 3200ms

# --- Act 2: the pivot ---
Type "# nice. now where was that chat from monday?"
Sleep 200ms
Enter
Sleep 700ms

Type "ls ~/.claude/projects/"
Enter
Sleep 1800ms

Type "# ...uhh"
Sleep 200ms
Enter
Sleep 700ms

# cd once. Every subsequent command uses relative paths so absolute paths
# (which would contain the real user's home) never appear on screen.
Type "cd ~/.claude/projects/-Users-alex-code-nextjs--app"
Enter
Sleep 400ms

Type "ls | head -5"
Enter
Sleep 1800ms

Type "head -3 *.jsonl | head -15"
Enter
Sleep 2800ms

Type "# my chat is in there somewhere. unreadable."
Sleep 300ms
Enter
Sleep 1500ms
