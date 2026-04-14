#!/usr/bin/env bash
set -euo pipefail

# Promote main to prod by rebasing prod onto main.
# Usage: ./promote-to-prod.sh

MAIN="main"
PROD="prod"

# Ensure we're in a git repo
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "Error: not inside a git repository."
  exit 1
fi

ORIGINAL_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)

# Restore original branch on failure
cleanup() {
  echo ""
  echo "Error: promote failed. Aborting any in-progress rebase and returning to $ORIGINAL_BRANCH..."
  git rebase --abort &>/dev/null || true
  git checkout "$ORIGINAL_BRANCH" &>/dev/null || true
}
trap cleanup ERR

# Must be on main branch
if [[ "$ORIGINAL_BRANCH" != "$MAIN" ]]; then
  echo "Error: you must be on the $MAIN branch to run this script."
  echo "Current branch: $ORIGINAL_BRANCH"
  exit 1
fi

# Ensure working tree is clean (no uncommitted or staged changes)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: you have uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Ensure no untracked files
if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "Warning: you have untracked files. Proceeding anyway..."
fi

echo ""
echo "Fetching latest from origin..."
git fetch origin

# Ensure remote branches exist
if ! git rev-parse "origin/$MAIN" &>/dev/null; then
  echo "Error: remote branch origin/$MAIN does not exist."
  exit 1
fi

if ! git rev-parse "origin/$PROD" &>/dev/null; then
  echo "Error: remote branch origin/$PROD does not exist."
  exit 1
fi

# Ensure local main is in sync with origin/main
LOCAL_MAIN=$(git rev-parse "$MAIN")
REMOTE_MAIN=$(git rev-parse "origin/$MAIN")
if [[ "$LOCAL_MAIN" != "$REMOTE_MAIN" ]]; then
  AHEAD=$(git rev-list "origin/$MAIN".."$MAIN" --count)
  BEHIND=$(git rev-list "$MAIN".."origin/$MAIN" --count)
  if [[ "$AHEAD" -gt 0 && "$BEHIND" -gt 0 ]]; then
    echo "Error: local $MAIN has diverged from origin/$MAIN ($AHEAD ahead, $BEHIND behind)."
    echo "Please resolve this before promoting."
    exit 1
  fi
  if [[ "$AHEAD" -gt 0 ]]; then
    echo "Error: local $MAIN has $AHEAD unpushed commit(s). Push them first before promoting."
    exit 1
  fi
  # Local is behind — pull latest
  echo "Local $MAIN is behind origin/$MAIN. Pulling latest..."
  git pull origin "$MAIN" --ff-only
fi

# Ensure prod is an ancestor of main (no orphan commits on prod)
if ! git merge-base --is-ancestor "origin/$PROD" "origin/$MAIN"; then
  echo "Error: origin/$PROD has commits that are not on origin/$MAIN."
  echo "This is unexpected — someone may have committed directly to $PROD."
  echo "Please investigate before promoting."
  exit 1
fi

# Show pending commits that will be promoted
PENDING=$(git log "origin/$PROD".."origin/$MAIN" --oneline 2>/dev/null)
if [[ -z "$PENDING" ]]; then
  echo "No new commits to promote. $PROD is already up to date with $MAIN."
  exit 0
fi

echo ""
echo "Commits to promote:"
echo "--------------------"
git log "origin/$PROD".."origin/$MAIN" --format="  %C(yellow)%h%C(reset) %s %C(dim)(%cr by %an <%ae>)%C(reset)"
echo "--------------------"
echo ""

read -p "Confirm promote $MAIN → $PROD? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

echo "Checking out $PROD..."
git checkout "$PROD"

# Ensure local prod is up to date with origin/prod
LOCAL_PROD=$(git rev-parse "$PROD")
REMOTE_PROD=$(git rev-parse "origin/$PROD")
if [[ "$LOCAL_PROD" != "$REMOTE_PROD" ]]; then
  echo "Resetting local $PROD to match origin/$PROD..."
  git reset --hard "origin/$PROD"
fi

echo "Rebasing $PROD onto $MAIN..."
git rebase "$MAIN"

echo "Pushing $PROD to origin..."
git push origin "$PROD" --force-with-lease

echo "Switching back to $MAIN..."
git checkout "$MAIN"

echo "Done! $PROD is now up to date with $MAIN."
