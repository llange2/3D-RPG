#!/usr/bin/env bash
# Stop hook of this project (`.claude/settings.json`): after every answer, commit what changed and push the branch.
# Never touches main/master or a detached HEAD, never force-pushes, never skips git's own hooks.
# Prints one JSON line (`systemMessage`) so the result shows in the session; always exits 0 (a failed push must not stop Claude).

say() { printf '{"systemMessage": "auto-commit: %s"}\n' "$1"; }

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$top" || exit 0

branch=$(git branch --show-current)
case "$branch" in
  "" | main | master) say "skipped on '${branch:-detached HEAD}' (work on a branch of its own)"; exit 0 ;;
esac

# the worktrees of other jobs and local settings are not ours to commit; docs/RPG_0.1.xlsx etc. are ignored or stay untracked in the main checkout
git add -A -- . ':(exclude).claude/worktrees' ':(exclude).claude/settings.local.json' 2>/dev/null

if ! git diff --cached --quiet; then
  files=$(git diff --cached --name-only | wc -l | tr -d ' ')
  first=$(git diff --cached --name-only | head -3 | paste -sd, -)
  if ! out=$(git commit -q -m "Auto-commit: ${files} file(s) (${first})

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" 2>&1); then
    say "commit failed: $(printf '%s' "$out" | tail -1 | tr -d '"\\' | cut -c1-200)"
    exit 0
  fi
  committed=" committed ${files} file(s);"
fi

# push when there is a commit the remote lacks (a new branch has no upstream yet)
if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  ahead=$(git rev-list --count '@{u}..HEAD')
else
  ahead=1
fi
[ "$ahead" -gt 0 ] || exit 0

if out=$(git push -u origin HEAD 2>&1); then
  say "${committed} pushed ${branch}"
else
  say "${committed} push failed: $(printf '%s' "$out" | tail -1 | tr -d '"\\' | cut -c1-200)"
fi
exit 0
