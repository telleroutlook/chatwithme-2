#!/bin/bash
# Chart Theme Contrast Test - Validate light/dark axis readability tokens
# Usage: ./chart-dark-theme-contrast-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"

echo "🎨 Running Chart Theme Contrast Test against: $BASE_URL"

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

set_theme_mode() {
  local target_mode="$1"
  playwright-cli snapshot --filename=chart-theme-mode-snapshot.yaml >/dev/null
  local mode_output
  mode_output=$(playwright-cli eval "(() => document.documentElement.getAttribute('data-mode') || 'light')")
  local current_mode
  current_mode=$(echo "$mode_output" | grep -Eo '(dark|light)' | head -1)
  if [ "$current_mode" != "$target_mode" ]; then
    local theme_ref
    theme_ref=$(grep 'button "Toggle theme"' chart-theme-mode-snapshot.yaml | grep -oP 'ref=\K[^]]+' | head -1)
    if [ -z "$theme_ref" ]; then
      echo "❌ Cannot find Toggle theme button"
      exit 1
    fi
    playwright-cli click "$theme_ref"
    sleep 1
  fi
}

get_adc_count() {
  playwright-cli eval "(() => document.querySelectorAll('.adc-chart-container').length)" 2>/dev/null | grep -Eo '^[0-9]+' | head -1
}

wait_for_adc_count_increase() {
  local before_count="$1"
  local expected_increase="$2"
  local max_wait_seconds=60
  local waited=0

  while [ "$waited" -lt "$max_wait_seconds" ]; do
    local current_count
    current_count=$(get_adc_count)
    current_count=${current_count:-0}
    if [ $((current_count - before_count)) -ge "$expected_increase" ]; then
      echo "$current_count"
      return 0
    fi
    sleep 3
    waited=$((waited + 3))
  done

  local final_count
  final_count=$(get_adc_count)
  final_count=${final_count:-0}
  echo "$final_count"
  return 1
}

send_and_wait_for_three_adc() {
  local prompt="$1"
  local step_name="$2"
  local retries=2
  local attempt=1

  while [ "$attempt" -le "$retries" ]; do
    local before_count
    before_count=$(get_adc_count)
    before_count=${before_count:-0}

    local textarea_ref
    textarea_ref=$(find_textarea_ref "chart-theme-${step_name}-snapshot-${attempt}.yaml")
    if [ -z "$textarea_ref" ]; then
      echo "❌ Cannot find textarea for step: $step_name (attempt $attempt)"
      return 1
    fi

    playwright-cli fill "$textarea_ref" "$prompt"
    sleep 1
    playwright-cli snapshot --filename="chart-theme-${step_name}-before-send-${attempt}.yaml" >/dev/null
    local send_ref
    send_ref=$(grep 'button "Send"' "chart-theme-${step_name}-before-send-${attempt}.yaml" | grep -oP 'ref=\K[^]]+' | head -1)
    if [ -z "$send_ref" ]; then
      echo "❌ Cannot find Send button for step: $step_name (attempt $attempt)"
      return 1
    fi

    playwright-cli click "$send_ref"

    local after_count
    if after_count=$(wait_for_adc_count_increase "$before_count" 3); then
      echo "✅ $step_name produced 3 ADC charts (attempt $attempt, $before_count -> $after_count)"
      return 0
    fi

    echo "⚠️ $step_name attempt $attempt did not produce 3 ADC charts; retrying..."
    attempt=$((attempt + 1))
  done

  echo "❌ $step_name failed to produce 3 ADC charts after $retries attempts"
  return 1
}

assert_latest_three_adc_tokens() {
  local expected_label="$1"
  local expected_line="$2"
  local expected_grid="$3"
  local mode_label="$4"

  local tokens
  tokens=$(playwright-cli eval "
(() => {
  const containers = Array.from(document.querySelectorAll('.adc-chart-container'));
  const latest = containers.slice(-3);
  if (latest.length !== 3) return { error: 'missing_adc_containers', count: latest.length };
  return {
    count: latest.length,
    axisLabelValues: latest.map((el) => el.getAttribute('data-chart-theme-axis-label-fill')),
    axisLineValues: latest.map((el) => el.getAttribute('data-chart-theme-axis-line-stroke')),
    axisGridValues: latest.map((el) => el.getAttribute('data-chart-theme-grid-stroke')),
    hasCanvasOrSvg: latest.every((el) => !!el.querySelector('canvas,svg')),
    hasFadeInClass: latest.some((el) => el.classList.contains('animate-fade-in')),
  };
})
")

  echo "Theme tokens ($mode_label): $tokens"
  echo "$tokens" | grep -q '"error"' && (echo "❌ $mode_label missing adc containers" && exit 1)
  echo "$tokens" | grep -q "\"$expected_label\"" || (echo "❌ $mode_label axisLabelFill is not $expected_label" && exit 1)
  echo "$tokens" | grep -q "\"$expected_line\"" || (echo "❌ $mode_label axisLineStroke is not $expected_line" && exit 1)
  echo "$tokens" | grep -q "\"$expected_grid\"" || (echo "❌ $mode_label axisGridStroke is not $expected_grid" && exit 1)
  echo "$tokens" | grep -q '"hasCanvasOrSvg": true' || (echo "❌ $mode_label chart canvas/svg missing" && exit 1)
  echo "$tokens" | grep -q '"hasFadeInClass": false' || (echo "❌ $mode_label latest chart still has animate-fade-in" && exit 1)
}

ADC_TRIPLE_PROMPT=$(cat <<'PROMPT'
请严格原样返回以下 3 个代码块，不要添加任何解释或额外文本：
```adc
{"type":"line","data":[{"year":"2020","value":10},{"year":"2021","value":15},{"year":"2022","value":22}],"xField":"year","yField":"value"}
```
```adc
{"type":"radar","data":[{"name":"A","metrics":"技术","value":90},{"name":"A","metrics":"量产","value":80},{"name":"B","metrics":"技术","value":70},{"name":"B","metrics":"量产","value":85}],"xField":"metrics","yField":"value","seriesField":"name"}
```
```adc
{"type":"heatmap","data":[{"scenario":"汽车","robotType":"工业","value":95},{"scenario":"医疗","robotType":"服务","value":85},{"scenario":"物流","robotType":"工业","value":75}],"xField":"scenario","yField":"robotType","colorField":"value"}
```
PROMPT
)

set_theme_mode "light"
send_and_wait_for_three_adc "$ADC_TRIPLE_PROMPT" "adc-light"
assert_latest_three_adc_tokens "#374151" "#cbd5e1" "#e5e7eb" "light"
playwright-cli screenshot --filename=chart-theme-contrast-light-check.png

set_theme_mode "dark"
sleep 2
assert_latest_three_adc_tokens "#e5e7eb" "#6b7280" "#374151" "dark"
playwright-cli screenshot --filename=chart-theme-contrast-dark-check.png

playwright-cli close

echo "✅ Chart theme contrast test passed"
