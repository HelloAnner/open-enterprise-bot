#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ $(uname -s) == Linux && $(uname -m) == x86_64 && $EUID == 0 ]] || { echo 'Rootfs export requires a Linux x86_64 build host and root mount privileges.' >&2; exit 1; }
: "${CHROME_DEB_URL:?Provide an exact Chrome package URL}"
: "${CHROME_SHA256:?Provide the verified SHA256 of that package}"
out=${ROOTFS_OUTPUT:-$PWD/deploy/.artifacts/guest-v1.ext4}
[[ ! -e "$out" ]] || { echo 'Refusing to replace an existing rootfs. Use a new versioned output path.' >&2; exit 1; }
mkdir -p deploy/.artifacts deploy/guest/.build
# Auxiliary binaries are built from the standalone desktop-gateway project only.
docker buildx build --platform linux/amd64 --target binaries -f deploy/images/desktop-gateway.Dockerfile --output type=local,dest=deploy/.artifacts desktop-gateway
install -m 0755 deploy/.artifacts/compute-agent deploy/guest/.build/compute-agent
docker build --platform linux/amd64 --build-arg CHROME_DEB_URL --build-arg CHROME_SHA256 -t eob/guest-base:v1 deploy/guest
work=$(mktemp -d); container=$(docker create eob/guest-base:v1)
cleanup() { mountpoint -q "$work/root" && umount "$work/root"; docker rm "$container" >/dev/null; rm -rf "$work"; }
trap cleanup EXIT
docker export "$container" -o "$work/root.tar"
truncate -s 8000000000 "$work/rootfs.ext4"
mkfs.ext4 -F "$work/rootfs.ext4"
mkdir "$work/root"; mount -o loop "$work/rootfs.ext4" "$work/root"
tar -xpf "$work/root.tar" -C "$work/root"
sync -f "$work/root"; umount "$work/root"
mkdir -p "$(dirname "$out")"; mv "$work/rootfs.ext4" "$out"
echo "Rootfs exported: $out. Install alongside a pinned Firecracker-compatible vmlinux; this script does not certify a boot."
