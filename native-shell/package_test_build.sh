#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NATIVE_DIR="$ROOT_DIR/native-shell"
DIST_DIR="$ROOT_DIR/dist"
BUILD_DIR="$NATIVE_DIR/build"
APP_NAME="Hagibis Dashboard.app"
EXECUTABLE_NAME="HagibisDashboard"
APP_DIR="$DIST_DIR/$APP_NAME"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
RUNTIME_DIR="$RESOURCES_DIR/node-runtime"
BIN_DIR="$RUNTIME_DIR/bin"
LIB_DIR="$RUNTIME_DIR/lib"
RUNTIME_CONFIG_PATH="$RESOURCES_DIR/runtime-config.plist"

mkdir -p "$DIST_DIR" "$BUILD_DIR"
rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$BIN_DIR" "$LIB_DIR"

COPIED_LIBS_FILE="$BUILD_DIR/copied-libs.txt"
: > "$COPIED_LIBS_FILE"

lib_already_copied() {
  local path="$1"
  grep -Fqx "$path" "$COPIED_LIBS_FILE" 2>/dev/null
}

mark_lib_copied() {
  local path="$1"
  printf '%s\n' "$path" >> "$COPIED_LIBS_FILE"
}

copy_runtime_binary() {
  local source_path="$1"
  local output_name="$2"
  cp -f "$(realpath "$source_path")" "$LIB_DIR/$output_name"
  chmod 755 "$LIB_DIR/$output_name"
}

collect_runtime_libs() {
  local target="$1"
  while IFS= read -r dep; do
    [[ -z "$dep" ]] && continue
    if [[ "$dep" == /opt/homebrew/* || "$dep" == /usr/local/* ]]; then
      if [[ "$dep" == *.dylib ]]; then
        local dep_real
        dep_real="$(realpath "$dep")"
        local dep_name
        dep_name="$(basename "$dep_real")"
        local dep_alias_name
        dep_alias_name="$(basename "$dep")"
        if ! lib_already_copied "$dep_real"; then
          copy_runtime_binary "$dep_real" "$dep_name"
          if [[ "$dep_alias_name" != "$dep_name" ]]; then
            copy_runtime_binary "$dep_real" "$dep_alias_name"
          fi
          mark_lib_copied "$dep_real"
          collect_runtime_libs "$LIB_DIR/$dep_name"
        fi
      fi
    fi
  done < <(otool -L "$target" | tail -n +2 | awk '{print $1}')
}

copy_required_runtime_libs() {
  local candidate
  for candidate in \
    /opt/homebrew/lib/libnode.141.dylib \
    /usr/local/lib/libnode.141.dylib
  do
    if [[ -f "$candidate" ]]; then
      copy_runtime_binary "$candidate" "$(basename "$candidate")"
      break
    fi
  done

  for candidate in \
    /opt/homebrew/opt/icu4c@78/lib/libicudata.78.dylib \
    /usr/local/opt/icu4c@78/lib/libicudata.78.dylib
  do
    if [[ -f "$candidate" ]]; then
      copy_runtime_binary "$candidate" "$(basename "$candidate")"
      break
    fi
  done

  for candidate in \
    /opt/homebrew/opt/brotli/lib/libbrotlicommon.1.dylib \
    /usr/local/opt/brotli/lib/libbrotlicommon.1.dylib
  do
    if [[ -f "$candidate" ]]; then
      copy_runtime_binary "$candidate" "$(basename "$candidate")"
      break
    fi
  done
}

rewrite_runtime_binary() {
  local binary_path="$1"
  install_name_tool -add_rpath "@executable_path/../lib" "$binary_path" 2>/dev/null || true
  while IFS= read -r dep; do
    [[ -z "$dep" ]] && continue
    local dep_name
    dep_name="$(basename "$dep")"
    if [[ -f "$LIB_DIR/$dep_name" ]]; then
      install_name_tool -change "$dep" "@executable_path/../lib/$dep_name" "$binary_path"
    fi
  done < <(otool -L "$binary_path" | tail -n +2 | awk '{print $1}')
}

rewrite_runtime_libs() {
  local lib_path
  for lib_path in "$LIB_DIR"/*.dylib; do
    [[ -e "$lib_path" ]] || continue
    local lib_name
    lib_name="$(basename "$lib_path")"
    install_name_tool -id "@loader_path/$lib_name" "$lib_path" 2>/dev/null || true
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      local dep_name
      dep_name="$(basename "$dep")"
      if [[ -f "$LIB_DIR/$dep_name" ]]; then
        install_name_tool -change "$dep" "@loader_path/$dep_name" "$lib_path"
      fi
    done < <(otool -L "$lib_path" | tail -n +2 | awk '{print $1}')
  done
}

sign_runtime_bundle() {
  local lib_path
  for lib_path in "$LIB_DIR"/*.dylib; do
    [[ -e "$lib_path" ]] || continue
    codesign --force --sign - "$lib_path"
  done
  codesign --force --sign - "$BIN_DIR/node"
  codesign --force --sign - "$MACOS_DIR/$EXECUTABLE_NAME"
}

NODE_BIN="$(command -v node)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js was not found in PATH." >&2
  exit 1
fi

clang -fobjc-arc -framework Cocoa -framework WebKit \
  -o "$BUILD_DIR/$EXECUTABLE_NAME" \
  "$NATIVE_DIR/main.m"

cp "$BUILD_DIR/$EXECUTABLE_NAME" "$MACOS_DIR/$EXECUTABLE_NAME"
cp "$NATIVE_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
cp "$ROOT_DIR/server.js" "$RESOURCES_DIR/server.js"
cp "$ROOT_DIR/index.html" "$RESOURCES_DIR/index.html"
cp "$ROOT_DIR/styles.css" "$RESOURCES_DIR/styles.css"
cp "$ROOT_DIR/main.js" "$RESOURCES_DIR/main.js"
cp "$ROOT_DIR/.env.example" "$RESOURCES_DIR/.env.example"

cp "$NODE_BIN" "$BIN_DIR/node"
chmod +x "$BIN_DIR/node" "$MACOS_DIR/$EXECUTABLE_NAME"

collect_runtime_libs "$BIN_DIR/node"
copy_required_runtime_libs
rewrite_runtime_binary "$BIN_DIR/node"
rewrite_runtime_libs
sign_runtime_bundle

cat > "$RUNTIME_CONFIG_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict/>
</plist>
EOF

codesign --force --deep --sign - "$APP_DIR"

echo "APP: $APP_DIR"
