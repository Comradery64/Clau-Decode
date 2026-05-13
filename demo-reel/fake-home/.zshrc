# Demo persona shell config for the clau-decode reel recording.
# Loaded because VHS launches zsh with HOME pointed at fake-home/.
# NOTE: VHS injects its own PROMPT after sourcing this file, so PROMPT is
# re-set inside before.tape's Hide block (post-VHS-override).

export PROMPT='%F{green}taby-mctabson@laptop%f %F{cyan}%~%f $ '
export RPROMPT=''
setopt interactive_comments
unsetopt nomatch

alias ls='ls -G'
alias ll='ls -lhG'
alias grep='grep --color=always'

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
unset HISTFILE
HISTSIZE=0
SAVEHIST=0

# ---------------------------------------------------------------------------
# Mocked `claude` command — emulates Claude Code's TUI just enough for the
# recording. NO real binary is invoked. Outputs are styled approximations.
# ---------------------------------------------------------------------------
claude() {
  print
  print -P "  %F{208}✻%f Welcome to %B%F{208}Claude Code%f%b"
  print -P "  %F{246}cwd: ~/code/nextjs-app · Sonnet 4.6 · ready%f"
  print
  printf '%s' "> "
  local prompt
  IFS= read -r prompt
  print
  sleep 0.5
  print -P "%F{cyan}⏺%f I'll look at the page component first."
  sleep 0.35
  print -P "  %F{246}⎿  Read page.tsx (12 lines)%f"
  sleep 0.55
  print -P "%F{cyan}⏺%f Found it — \`new Date()\` runs on both server and client."
  sleep 0.4
  print -P "  %F{246}⎿  Edited page.tsx (+3 −1)%f"
  sleep 0.5
  print -P "%F{cyan}⏺%f Hydration mismatch fixed. Timestamp now renders client-side only."
  print
}
