#!/bin/sh
set -eu

dir=$HOME/.local/share/broadcom
bin=$HOME/.local/bin

case "$(uname -s)-$(uname -m)" in
Darwin-arm64) target=aarch64-apple-darwin ;;
Darwin-x86_64) target=x86_64-apple-darwin ;;
Linux-x86_64) target=x86_64-unknown-linux-gnu ;;
Linux-aarch64 | Linux-arm64) target=aarch64-unknown-linux-gnu ;;
*)
  echo "BROADCOM has no build for $(uname -s) $(uname -m) yet." >&2
  exit 1
  ;;
esac

url=https://github.com/AVGVSTVS96/broadcom/releases/latest/download/broadcom-$target.tar.gz
echo "Downloading $url"
rm -rf "$dir.new"
mkdir -p "$dir.new" "$bin"
curl -fL --progress-bar "$url" | tar -xz -C "$dir.new"
rm -rf "$dir"
mv "$dir.new" "$dir"
for name in broadcom broadcom-proxy broadcom-usage; do
  ln -sf "$dir/bin/$name" "$bin/$name"
done
echo "Installed broadcom, broadcom-proxy and broadcom-usage in $bin."
case ":$PATH:" in
*":$bin:"*) ;;
*) echo "Add it to your PATH: export PATH=\"$bin:\$PATH\"" ;;
esac

if (exec </dev/tty) 2>/dev/null; then
  exec "$dir/bin/broadcom" </dev/tty
fi
echo "Run broadcom to sign in and start."
