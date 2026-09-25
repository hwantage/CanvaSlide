#!/usr/bin/env bash
# Signs the macOS app in a release directory with a Developer ID, notarizes and staples it, then
# replaces the directory's disk image and updater archive with ones around the signed app.
# Usage: notarize-macos-release.sh <directory>, with the Apple credentials of docs/RELEASE.md §6 in
# the environment. Without any of them the directory stays as built; with only some it fails.
set -euo pipefail

directory="${1:?usage: notarize-macos-release.sh <directory>}"
output="${GITHUB_OUTPUT:-/dev/null}"

credentials=(APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_ID
  APPLE_PASSWORD APPLE_TEAM_ID)
missing=()
for name in "${credentials[@]}"; do
  [ -n "${!name:-}" ] || missing+=("$name")
done
if [ "${#missing[@]}" -eq "${#credentials[@]}" ]; then
  echo "::warning::No Apple credentials in the release environment, so the macOS build is not signed"
  echo "notarized=false" >> "$output"
  exit 0
fi
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing Apple credentials: ${missing[*]}" >&2
  exit 1
fi

only_file() {
  local matches=("$directory"/*"$1")
  if [ "${#matches[@]}" -ne 1 ] || [ ! -f "${matches[0]}" ]; then
    echo "Expected one *$1 in $directory" >&2
    exit 1
  fi
  echo "${matches[0]}"
}
dmg="$(only_file .dmg)"
archive="$(only_file .app.tar.gz)"

# Why: the list prints one quoted, indented path per line, and paths may contain spaces.
listed_keychains="$(security list-keychains -d user)"
searched_keychains=()
while IFS= read -r line; do
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line#\"}"
  [ -z "$line" ] || searched_keychains+=("${line%\"}")
done <<< "$listed_keychains"
if [ "${#searched_keychains[@]}" -eq 0 ]; then
  echo "The user keychain search list is empty" >&2
  exit 1
fi

# Why: macOS mktemp ignores TMPDIR unless given a template.
work="$(mktemp -d "${TMPDIR:-/tmp}/notarize.XXXXXX")"
keychain="$work/signing.keychain-db"
volume="$work/volume"
cleanup() {
  if [ -d "$volume" ]; then
    hdiutil detach "$volume" -force -quiet || true
  fi
  # Why: codesign reads identities from the user search list, so it is restored to its old entries.
  security list-keychains -d user -s "${searched_keychains[@]}" || true
  security delete-keychain "$keychain" 2> /dev/null || true
  rm -rf "${work:?}"
}
trap cleanup EXIT

keychain_password="$(uuidgen)"
security create-keychain -p "$keychain_password" "$keychain"
# Why: the keychain must stay unlocked through two notarization waits of up to an hour each.
security set-keychain-settings -lut 10800 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$work/certificate.p12"
security import "$work/certificate.p12" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign
rm "$work/certificate.p12"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" \
  "$keychain" > /dev/null
security list-keychains -d user -s "$keychain" "${searched_keychains[@]}"

# Why: `notarytool submit --wait` can exit 0 for a rejected submission, so the status is checked.
notarize() {
  local result status id
  result="$(xcrun notarytool submit "$1" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" --wait --timeout 1h --output-format json)"
  status="$(plutil -extract status raw - <<< "$result")"
  if [ "$status" != Accepted ]; then
    id="$(plutil -extract id raw - <<< "$result")"
    echo "Notarization of $(basename "$1") finished with $status" >&2
    xcrun notarytool log "$id" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" >&2 || true
    exit 1
  fi
}

# Why: signing the app inside a writable copy of the built image keeps its layout and volume icon.
hdiutil convert "$dmg" -format UDRW -o "$work/writable.dmg" -quiet
mkdir "$volume"
hdiutil attach "$work/writable.dmg" -mountpoint "$volume" -nobrowse -noautoopen -noverify -quiet
apps=("$volume"/*.app)
app="${apps[0]}"
if [ "${#apps[@]}" -ne 1 ] || [ ! -d "$app" ]; then
  echo "Expected one app in $(basename "$dmg")" >&2
  exit 1
fi

codesign --force --options runtime --timestamp --keychain "$keychain" \
  --sign "$APPLE_SIGNING_IDENTITY" "$app"
codesign --verify --strict --deep "$app"
ditto -c -k --keepParent "$app" "$work/app.zip"
notarize "$work/app.zip"
xcrun stapler staple "$app"
spctl --assess --type execute "$app"

# Why: the updater unpacks the archive's first path component as the app, so it holds only the app,
# without the AppleDouble entries or extended attribute headers macOS tar adds by default.
(cd "$volume" &&
  COPYFILE_DISABLE=1 tar --no-xattrs --no-acls -czf "$work/app.tar.gz" -- "$(basename "$app")")
rm -rf "$volume/.fseventsd"
# Why: a just-written volume can report busy for a moment after its last file handle closes.
hdiutil detach "$volume" -quiet || { sleep 5 && hdiutil detach "$volume" -force -quiet; }
rmdir "$volume"
hdiutil convert "$work/writable.dmg" -format UDZO -imagekey zlib-level=9 -o "$work/signed.dmg" \
  -quiet

codesign --force --timestamp --keychain "$keychain" --sign "$APPLE_SIGNING_IDENTITY" \
  "$work/signed.dmg"
notarize "$work/signed.dmg"
xcrun stapler staple "$work/signed.dmg"
spctl --assess --type open --context context:primary-signature "$work/signed.dmg"

mv "$work/signed.dmg" "$dmg"
mv "$work/app.tar.gz" "$archive"
echo "notarized=true" >> "$output"
