#!/usr/bin/env bash
# Flora installer for macOS and Linux.
#
# Install or update Flora in one of your Obsidian vaults:
#   curl -fsSL https://raw.githubusercontent.com/ParanoaiDev/obsidian-flora/main/install.sh | bash
#
# Pick the vault yourself:
#   curl -fsSL https://raw.githubusercontent.com/ParanoaiDev/obsidian-flora/main/install.sh | bash -s -- "/path/to/vault"
#
# The script downloads main.js, manifest.json and styles.css from the latest GitHub release
# into <vault>/.obsidian/plugins/flora and turns the plugin on. Your Flora settings are kept.

set -euo pipefail

REPO="ParanoaiDev/obsidian-flora"
PLUGIN_ID="flora"
VERSION="${FLORA_VERSION:-latest}"
VAULT="${1:-}"

if [ -t 1 ]; then C_ACC=$'\033[35m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else C_ACC=""; C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_OFF=""; fi
say()  { printf '  %s\n' "$*"; }
fail() { printf '\n  %s%s%s\n\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
ask()  { local answer=""; if ( : < /dev/tty ) 2>/dev/null; then read -r -p "  $1" answer < /dev/tty || true; fi; printf '%s' "$answer"; }

echo
say "${C_ACC}Flora installer${C_OFF}"
say "${C_DIM}A new look for Obsidian, and a graph of your notes that feels alive.${C_OFF}"
echo

# ---------- 1. choose the vault ----------
if [ -z "$VAULT" ]; then
  REGISTRY=""
  for f in \
    "$HOME/Library/Application Support/obsidian/obsidian.json" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/obsidian/obsidian.json" \
    "$HOME/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json" \
    "$HOME/snap/obsidian/current/.config/obsidian/obsidian.json"; do
    if [ -f "$f" ]; then REGISTRY="$f"; break; fi
  done

  VAULTS=()
  if [ -n "$REGISTRY" ]; then
    # obsidian.json: {"vaults":{"<id>":{"path":"...","ts":123,"open":true}, ...}}
    # one line per vault: <open 1/0> <tab> <ts> <tab> <path>, the open vault first, then the most recent
    LIST="$(tr -d '\n' < "$REGISTRY" | grep -o '{"path":"[^"]*"[^}]*}' | while IFS= read -r obj; do
      p="$(printf '%s' "$obj" | sed -e 's/^{"path":"\([^"]*\)".*/\1/' -e 's/\\\\/\\/g')"
      ts="$(printf '%s' "$obj" | sed -n 's/.*"ts":\([0-9]*\).*/\1/p')"
      case "$obj" in *'"open":true'*) open=1 ;; *) open=0 ;; esac
      printf '%s\t%s\t%s\n' "$open" "${ts:-0}" "$p"
    done | sort -t "$(printf '\t')" -k1,1nr -k2,2nr | cut -f3-)"
    while IFS= read -r p; do
      if [ -n "$p" ] && [ -d "$p" ]; then VAULTS+=("$p"); fi
    done <<< "$LIST"
  fi

  if [ "${#VAULTS[@]}" -eq 0 ]; then
    say "No Obsidian vaults found automatically."
    VAULT="$(ask "Path to your vault: ")"
  elif [ "${#VAULTS[@]}" -eq 1 ]; then
    VAULT="${VAULTS[0]}"
  else
    say "Your vaults:"
    for i in "${!VAULTS[@]}"; do say "  $((i + 1)). ${VAULTS[$i]}"; done
    echo
    N="$(ask "Install into vault number [1]: ")"
    N="${N:-1}"
    case "$N" in ''|*[!0-9]*) fail "There is no vault number $N." ;; esac
    if [ "$N" -lt 1 ] || [ "$N" -gt "${#VAULTS[@]}" ]; then fail "There is no vault number $N."; fi
    VAULT="${VAULTS[$((N - 1))]}"
  fi
fi

VAULT="${VAULT/#\~/$HOME}"
[ -n "$VAULT" ] || fail "No vault chosen."
[ -d "$VAULT" ] || fail "Folder not found: $VAULT"
CONFIG="$VAULT/.obsidian"
[ -d "$CONFIG" ] || fail "This folder is not an Obsidian vault yet (no .obsidian folder): $VAULT"
say "Vault: $VAULT"

# ---------- 2. download the release ----------
if [ "$VERSION" = "latest" ]; then BASE="https://github.com/$REPO/releases/latest/download"
else BASE="https://github.com/$REPO/releases/download/$VERSION"; fi

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -q "$1" -O "$2"
  else fail "Install curl or wget and try again."; fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for f in main.js manifest.json styles.css; do
  say "Downloading $f"
  fetch "$BASE/$f" "$TMP/$f" || fail "Could not download $f from GitHub. Check your internet connection and try again."
done
grep -q "\"id\": *\"$PLUGIN_ID\"" "$TMP/manifest.json" || fail "The downloaded files are not Flora."
NEW_VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$TMP/manifest.json" | head -n 1)"

# ---------- 3. install ----------
TARGET="$CONFIG/plugins/$PLUGIN_ID"
PREVIOUS=""
if [ -f "$TARGET/manifest.json" ]; then
  PREVIOUS="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$TARGET/manifest.json" | head -n 1)"
fi
mkdir -p "$TARGET"
cp "$TMP/main.js" "$TMP/manifest.json" "$TMP/styles.css" "$TARGET/"

# ---------- 4. turn the plugin on ----------
ENABLED="$CONFIG/community-plugins.json"
if [ ! -s "$ENABLED" ]; then
  printf '[\n  "%s"\n]' "$PLUGIN_ID" > "$ENABLED"
elif ! grep -q "\"$PLUGIN_ID\"" "$ENABLED"; then
  # the file is a JSON array of plugin ids: drop the closing bracket and append ours
  LISTED="$(cat "$ENABLED")"
  LISTED="${LISTED%]*}"
  LISTED="${LISTED%"${LISTED##*[![:space:]]}"}"
  case "$LISTED" in
    *'"'*) printf '%s,\n  "%s"\n]' "$LISTED" "$PLUGIN_ID" > "$ENABLED" ;;
    *)     printf '[\n  "%s"\n]' "$PLUGIN_ID" > "$ENABLED" ;;
  esac
fi

# ---------- 5. done ----------
echo
if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$NEW_VERSION" ]; then say "${C_OK}Flora updated from $PREVIOUS to $NEW_VERSION.${C_OFF}"
elif [ -n "$PREVIOUS" ]; then say "${C_OK}Flora $NEW_VERSION reinstalled.${C_OFF}"
else say "${C_OK}Flora $NEW_VERSION installed.${C_OFF}"; fi

if pgrep -x "Obsidian" >/dev/null 2>&1 || pgrep -x "obsidian" >/dev/null 2>&1; then
  say "${C_WARN}Obsidian is open: restart it, or turn Flora off and on in Settings > Community plugins.${C_OFF}"
else
  say "Open the vault in Obsidian and Flora starts right away."
fi
say "${C_DIM}If community plugins are off, turn them on in Settings > Community plugins.${C_OFF}"
echo
