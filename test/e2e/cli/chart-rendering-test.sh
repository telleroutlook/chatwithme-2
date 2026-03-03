#!/bin/bash
# Chart Rendering Test - Validate Mermaid/G2/ADC/SVG rendering paths
# Usage: ./chart-rendering-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"

echo "📊 Running Chart Rendering Test against: $BASE_URL"

playwright-cli open "$BASE_URL"
playwright-cli resize 1440 900
sleep 3

find_textarea_ref() {
  local snapshot_file="$1"
  playwright-cli snapshot --filename="$snapshot_file" >/dev/null
  local ref
  ref=$(grep -A1 'textbox.*Type a message' "$snapshot_file" | grep -oP 'ref=\K[^]]+' | head -1)
  if [ -n "$ref" ]; then
    echo "$ref"
    return 0
  fi
  grep 'textbox' "$snapshot_file" | grep -oP 'ref=\K[^]]+' | head -1
}

send_and_wait() {
  local prompt="$1"
  local step_name="$2"
  local textarea_ref
  textarea_ref=$(find_textarea_ref "chart-${step_name}-snapshot.yaml")
  if [ -z "$textarea_ref" ]; then
    echo "❌ Cannot find textarea for step: $step_name"
    return 1
  fi

  playwright-cli fill "$textarea_ref" "$prompt"
  sleep 1
  playwright-cli snapshot --filename="chart-${step_name}-before-send.yaml" >/dev/null
  local send_ref
  send_ref=$(grep 'button "Send"' "chart-${step_name}-before-send.yaml" | grep -oP 'ref=\K[^]]+' | head -1)
  if [ -z "$send_ref" ]; then
    echo "❌ Cannot find Send button for step: $step_name"
    return 1
  fi
  playwright-cli click "$send_ref"
  sleep 18
}

assert_selector_exists() {
  local selector="$1"
  local label="$2"
  local count
  count=$(playwright-cli eval "
(() => document.querySelectorAll('$selector').length)
" 2>/dev/null | grep -Eo '^[0-9]+$' | head -1)
  count=${count:-0}
  if [ "$count" = "0" ]; then
    echo "❌ $label not found (selector: $selector)"
    return 1
  fi
  echo "✅ $label found"
}

assert_any_selector_exists() {
  local label="$1"
  shift
  for selector in "$@"; do
    local count
    count=$(playwright-cli eval "
(() => document.querySelectorAll('$selector').length)
" 2>/dev/null | grep -Eo '^[0-9]+$' | head -1)
    count=${count:-0}
    if [ "$count" != "0" ]; then
      echo "✅ $label found via selector: $selector"
      return 0
    fi
  done
  echo "❌ $label not found"
  return 1
}

MERMAID_PROMPT=$(cat <<'EOF'
请严格原样返回以下代码块，不要添加任何解释：
```mermaid
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Done]
  B -->|No| D[Retry]
```
EOF
)
send_and_wait "$MERMAID_PROMPT" "mermaid"
assert_selector_exists ".mermaid-container svg" "Mermaid chart"

G2_PROMPT=$(cat <<'EOF'
请严格原样返回以下代码块，不要添加任何解释：
```g2
{"type":"interval","data":[{"month":"Jan","sales":100},{"month":"Feb","sales":150}],"encode":{"x":"month","y":"sales"}}
```
EOF
)
send_and_wait "$G2_PROMPT" "g2"
assert_selector_exists ".g2-chart-container canvas, .g2-chart-container svg" "G2 chart"

SVG_PROMPT=$(cat <<'EOF'
请严格原样返回以下代码块，不要添加任何解释：
```xml
<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="60" r="40" fill="#3b82f6" />
</svg>
```
EOF
)
send_and_wait "$SVG_PROMPT" "svg"
assert_selector_exists "img[alt=\"SVG Preview\"]" "SVG preview"

playwright-cli screenshot --filename=chart-rendering-check.png
playwright-cli close

echo "✅ Chart rendering test passed"
