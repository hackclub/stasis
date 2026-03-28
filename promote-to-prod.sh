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
echo "⚠️  MAKE SURE YOU HAVE TESTED ALL YOUR CHANGES ON STAGING FIRST ⚠️"
echo ""
read -p "Are you sure you want to promote $MAIN to $PROD? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

echo "Fetching latest from origin..."
git fetch origin

# Ensure local main is up to date with origin/main
LOCAL_MAIN=$(git rev-parse "$MAIN")
REMOTE_MAIN=$(git rev-parse "origin/$MAIN")
if [[ "$LOCAL_MAIN" != "$REMOTE_MAIN" ]]; then
  echo "Local $MAIN is behind origin/$MAIN. Pulling latest..."
  git checkout "$MAIN"
  git pull origin "$MAIN" --ff-only
fi

echo "Checking out $PROD..."
git checkout "$PROD"

# Ensure local prod is up to date with origin/prod (if it exists remotely)
if git rev-parse "origin/$PROD" &>/dev/null; then
  LOCAL_PROD=$(git rev-parse "$PROD")
  REMOTE_PROD=$(git rev-parse "origin/$PROD")
  if [[ "$LOCAL_PROD" != "$REMOTE_PROD" ]]; then
    echo "Local $PROD is behind origin/$PROD. Pulling latest..."
    git pull origin "$PROD" --rebase
  fi
fi

echo "Rebasing $PROD onto $MAIN..."
git rebase "$MAIN"

echo "Pushing $PROD to origin..."
git push origin "$PROD" --force-with-lease

echo "Switching back to $MAIN..."
git checkout "$MAIN"

echo "Done! $PROD is now up to date with $MAIN."
