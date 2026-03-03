#!/bin/bash
# Chart Dark Theme Contrast Test - Validate dark mode chart token injection
# Usage: ./chart-dark-theme-contrast-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"

echo "🌙 Running Chart Dark Theme Contrast Test against: $BASE_URL"

playwright-cli open "$BASE_URL"
playwright-cli resize 1440 900
sleep 3

playwright-cli snapshot --filename=chart-theme-initial.yaml >/dev/null
MODE_OUTPUT=$(playwright-cli eval "(() => document.documentElement.getAttribute('data-mode') || 'light')")
CURRENT_MODE=$(echo "$MODE_OUTPUT" | grep -Eo '(dark|light)' | head -1)
if [ "$CURRENT_MODE" != "dark" ]; then
  THEME_REF=$(grep 'button "Toggle theme"' chart-theme-initial.yaml | grep -oP 'ref=\K[^]]+' | head -1)
  if [ -n "$THEME_REF" ]; then
    playwright-cli click "$THEME_REF"
    sleep 1
  fi
fi

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
  textarea_ref=$(find_textarea_ref "chart-theme-${step_name}-snapshot.yaml")
  if [ -z "$textarea_ref" ]; then
    echo "❌ Cannot find textarea for step: $step_name"
    return 1
  fi

  playwright-cli fill "$textarea_ref" "$prompt"
  sleep 1
  playwright-cli snapshot --filename="chart-theme-${step_name}-before-send.yaml" >/dev/null
  local send_ref
  send_ref=$(grep 'button "Send"' "chart-theme-${step_name}-before-send.yaml" | grep -oP 'ref=\K[^]]+' | head -1)
  if [ -z "$send_ref" ]; then
    echo "❌ Cannot find Send button for step: $step_name"
    return 1
  fi
  playwright-cli click "$send_ref"
  sleep 18
}

G2_PROMPT=$(cat <<'EOF'
请严格原样返回以下代码块，不要添加任何解释：
```g2
{"type":"line","data":[{"year":"2023","value":12},{"year":"2024","value":18},{"year":"2025","value":27}],"encode":{"x":"year","y":"value"}}
```
EOF
)
send_and_wait "$G2_PROMPT" "g2"

ADC_PROMPT=$(cat <<'EOF'
请严格原样返回以下代码块，不要添加任何解释：
```adc
{"type":"column","data":[{"category":"A","value":10},{"category":"B","value":20}],"xField":"category","yField":"value"}
```
EOF
)
send_and_wait "$ADC_PROMPT" "adc"

TOKENS=$(playwright-cli eval "
(() => {
  const g2 = document.querySelector('.g2-chart-container');
  const adc = document.querySelector('.adc-chart-container');
  if (!g2 || !adc) return { error: 'missing_chart_container' };
  return {
    g2AxisLabel: g2.getAttribute('data-chart-theme-axis-label-fill'),
    g2AxisLine: g2.getAttribute('data-chart-theme-axis-line-stroke'),
    g2Grid: g2.getAttribute('data-chart-theme-grid-stroke'),
    adcAxisLabel: adc.getAttribute('data-chart-theme-axis-label-fill'),
    adcAxisLine: adc.getAttribute('data-chart-theme-axis-line-stroke'),
    adcGrid: adc.getAttribute('data-chart-theme-grid-stroke'),
    g2HasFadeInClass: g2.classList.contains('animate-fade-in'),
    adcHasFadeInClass: adc.classList.contains('animate-fade-in'),
  };
})
")

echo "Theme tokens: $TOKENS"

echo "$TOKENS" | grep -q '#e5e7eb' || (echo "❌ axisLabelFill is not dark token #e5e7eb" && exit 1)
echo "$TOKENS" | grep -q '#6b7280' || (echo "❌ axisLineStroke is not dark token #6b7280" && exit 1)
echo "$TOKENS" | grep -q '#374151' || (echo "❌ axisGridStroke is not dark token #374151" && exit 1)
echo "$TOKENS" | grep -q '"g2HasFadeInClass": false' || (echo "❌ g2 container still has animate-fade-in" && exit 1)
echo "$TOKENS" | grep -q '"adcHasFadeInClass": false' || (echo "❌ adc container still has animate-fade-in" && exit 1)

playwright-cli screenshot --filename=chart-dark-theme-contrast-check.png
playwright-cli close

echo "✅ Chart dark theme contrast test passed"
