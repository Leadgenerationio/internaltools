#!/bin/bash
# ============================================================
# Git Auto-Push Agent
# Watches for file changes and auto-commits + pushes to GitHub.
# Railway then auto-deploys from the push.
#
# Usage:
#   npm run git-agent        (recommended)
#   bash scripts/git-agent.sh
#
# To stop: press Ctrl+C
# ============================================================

set -e

# --- Config ---
WATCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="main"
DEBOUNCE_SECONDS=10  # Wait this long after last change before pushing
REMOTE="origin"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No color

log() { echo -e "${BLUE}[git-agent]${NC} $1"; }
success() { echo -e "${GREEN}[git-agent]${NC} $1"; }
warn() { echo -e "${YELLOW}[git-agent]${NC} $1"; }
error() { echo -e "${RED}[git-agent]${NC} $1"; }

# --- Preflight checks ---
if ! command -v fswatch &> /dev/null; then
    error "fswatch is not installed. Run: brew install fswatch"
    exit 1
fi

if ! git -C "$WATCH_DIR" rev-parse --is-inside-work-tree &> /dev/null; then
    error "$WATCH_DIR is not a git repository"
    exit 1
fi

cd "$WATCH_DIR"

# --- Initial push (catch anything not yet pushed) ---
do_push() {
    cd "$WATCH_DIR"

    # Check if there are any changes
    if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
        return 0  # Nothing to push
    fi

    # Stage all changes
    git add -A

    # Build a commit message from changed files
    CHANGED=$(git diff --cached --name-only | head -10)
    FILE_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')

    if [ "$FILE_COUNT" -eq 0 ]; then
        return 0
    fi

    # Create a descriptive commit message
    FIRST_FILES=$(echo "$CHANGED" | head -3 | tr '\n' ', ' | sed 's/,$//')
    if [ "$FILE_COUNT" -gt 3 ]; then
        MSG="Auto-update: ${FIRST_FILES} and $((FILE_COUNT - 3)) more files"
    else
        MSG="Auto-update: ${FIRST_FILES}"
    fi

    log "Committing $FILE_COUNT file(s)..."
    git commit -m "$MSG" --quiet

    log "Pushing to $REMOTE/$BRANCH..."
    if git push "$REMOTE" "$BRANCH" --quiet 2>&1; then
        success "Pushed! Railway will auto-deploy in ~2 min."
    else
        error "Push failed. Check your network or GitHub auth."
        return 1
    fi
}

# --- Do an initial push for any pending changes ---
log "Checking for pending changes..."
do_push

# --- Watch loop ---
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Git Agent is running                      ${NC}"
echo -e "${GREEN}  Watching: ${WATCH_DIR}${NC}"
echo -e "${GREEN}  Branch:   ${BRANCH}${NC}"
echo -e "${GREEN}  Remote:   ${REMOTE}${NC}"
echo -e "${GREEN}                                            ${NC}"
echo -e "${GREEN}  Every change auto-pushes to GitHub.${NC}"
echo -e "${GREEN}  Railway auto-deploys from each push.${NC}"
echo -e "${GREEN}                                            ${NC}"
echo -e "${GREEN}  Press Ctrl+C to stop.${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Use fswatch to monitor changes, debounced
# Excludes: node_modules, .next, .git, uploads, outputs, logs
fswatch -r -l "$DEBOUNCE_SECONDS" \
    --exclude='node_modules' \
    --exclude='\.next' \
    --exclude='\.git' \
    --exclude='public/uploads' \
    --exclude='public/outputs' \
    --exclude='public/music' \
    --exclude='logs' \
    --exclude='\.DS_Store' \
    "$WATCH_DIR" | while read -r event; do

    # Absorb rapid-fire events (fswatch batches, but let's be safe)
    sleep 2
    # Drain any queued events
    while read -r -t 1 extra; do :; done

    TIMESTAMP=$(date '+%H:%M:%S')
    log "[$TIMESTAMP] Changes detected..."
    do_push
done
