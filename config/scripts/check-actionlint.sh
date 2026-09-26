#!/usr/bin/env bash
set -euo pipefail

# Official release archives are verified before execution; never execute a floating download script.
version=1.7.7
case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) platform=linux_amd64; checksum=023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757 ;;
  Darwin/arm64) platform=darwin_arm64; checksum=2693315b9093aeacb4ebd91a993fea54fc215057bf0da2659056b4bc033873db ;;
  Darwin/x86_64) platform=darwin_amd64; checksum=28e5de5a05fc558474f638323d736d822fff183d2d492f0aecb2b73cc44584f5 ;;
  *) echo 'Run actionlint on Linux x64 or macOS' >&2; exit 1 ;;
esac
scratch="$(mktemp -d)"
trap 'rm -f "${scratch:?}/archive.tar.gz" "${scratch:?}/actionlint"; rmdir "$scratch"' EXIT
curl --fail --silent --show-error --location \
  "https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_${platform}.tar.gz" \
  --output "$scratch/archive.tar.gz"
actual="$(shasum -a 256 "$scratch/archive.tar.gz")"
if [ "${actual%% *}" != "$checksum" ]; then
  echo 'actionlint archive checksum mismatch' >&2
  exit 1
fi
tar -xzf "$scratch/archive.tar.gz" -C "$scratch" actionlint
"$scratch/actionlint" -shellcheck= -pyflakes= "$@"
