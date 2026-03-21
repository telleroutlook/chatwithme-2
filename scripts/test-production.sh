#!/bin/bash
# =============================================================================
# test-production.sh — ChatWithMe-2 生产环境集成测试脚本
#
# 用途：
#   对生产 Worker 进行全流程功能冒烟测试，覆盖：
#   - 基础对话 + 日期感知
#   - Web 搜索工具（Serper.dev）
#   - ADC 多系列折线图（长格式数据 + colorField）
#   - ECharts 仪表盘图（gauge）
#   - Mermaid 流程图
#   - 复合看板（stat KPI + adc 折线图，dashboard 格式）
#   - CSV 数据分析（builtin_data_analyzer + chart_template）
#   - React 交互组件
#   - fixChart REST API（破损 JSON 修复）
#   - Deep Research toggle（GET/POST REST API + 持久化验证）
#   - 消息删除 API（验证 delete 返回 deleted:true 且 history 减少）
#   - 精确数学计算（builtin_math_eval）
#   - 实时天气（builtin_weather）
#   - Wikipedia 百科查询（builtin_wikipedia）
#   - 汇率换算（builtin_currency）
#   - Debug API（session state + tool runs）
#
# 用法：
#   bash scripts/test-production.sh [SESSION_ID]
#
#   SESSION_ID 可选，默认使用 test-<timestamp>。
#   同一 SESSION_ID 可多次运行以复用会话（但消息会累积）。
#
# 依赖：
#   - curl
#   - python3
#   - 本机可访问 192.168.1.3:7890 代理（家庭 WiFi 需要）
#     若不需要代理，将所有 https_proxy=... 前缀去掉即可
#
# 输出说明：
#   每个测试步骤打印：
#     [PASS] / [FAIL] / [WARN]  步骤名称  |  响应摘要（前120字符）
#   最终打印汇总：通过/失败/警告数量及耗时
#
# 注意事项：
#   - 每步之间有 4s 等待，避免触发 GLM API 速率限制（~10 RPM 免费额度）
#   - 涉及工具调用的步骤（搜索、数据分析）最多等待 90s
#   - 纯文本生成步骤最多等待 60s
#   - 消息删除测试会在会话中留下 1 条未配对的 user 消息（正常现象）
# =============================================================================

set -euo pipefail

# --------------------------------------------------------------------------
# 配置
# --------------------------------------------------------------------------
BASE="https://chatwithme2mcp.lintao-mailbox.workers.dev"
DEBUG_TOKEN="claude-debug-a952d905222a512e"
PROXY="http://192.168.1.3:7890"
SESSION_ID="${1:-test-$(date +%s)}"
AUTH_HEADER="Authorization: Bearer anon-test-12345678"

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

# 计数器
PASS=0
FAIL=0
WARN=0
START_TIME=$(date +%s)

# --------------------------------------------------------------------------
# 工具函数
# --------------------------------------------------------------------------

# 带代理的 curl
proxy_curl() {
  https_proxy="$PROXY" curl "$@"
}

# 打印章节标题
section() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BLUE}  $1${RESET}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

# 发送聊天消息，返回完整 JSON 响应
send_message() {
  local msg="$1"
  local timeout="${2:-90}"
  proxy_curl -s -X POST "$BASE/api/chat" \
    -H "Origin: http://localhost:5173" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"message\": $(echo "$msg" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().rstrip()))"), \"sessionId\": \"$SESSION_ID\"}" \
    --max-time "$timeout" 2>/dev/null
}

# 断言：响应包含 success:true 且 response 非空
assert_response() {
  local label="$1"
  local raw="$2"
  local check_pattern="${3:-}"  # 可选：response 内容必须匹配此 grep 模式

  local success response
  success=$(echo "$raw" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success','false'))" 2>/dev/null || echo "false")
  response=$(echo "$raw" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('response',''))" 2>/dev/null || echo "")

  if [[ "$success" != "True" && "$success" != "true" ]]; then
    echo -e "${RED}[FAIL]${RESET} $label | success=false | $(echo "$raw" | head -c 200)"
    ((FAIL++))
    return 1
  fi

  if [[ -z "$response" || ${#response} -lt 5 ]]; then
    echo -e "${RED}[FAIL]${RESET} $label | empty response"
    ((FAIL++))
    return 1
  fi

  if [[ -n "$check_pattern" ]]; then
    if ! echo "$response" | grep -q "$check_pattern"; then
      echo -e "${YELLOW}[WARN]${RESET} $label | pattern '$check_pattern' not found | ${response:0:120}"
      ((WARN++))
      return 0
    fi
  fi

  echo -e "${GREEN}[PASS]${RESET} $label | ${response:0:120}"
  ((PASS++))
  return 0
}

# 获取 debug session 的 tool runs
# 查询两个可能的 agentName（anonymous: 和 user-anon-tes: 前缀）
get_tool_runs() {
  local runs1 runs2
  runs1=$(proxy_curl -s \
    "$BASE/api/debug/session/anonymous:$SESSION_ID/state?token=$DEBUG_TOKEN" \
    --max-time 10 2>/dev/null | \
    python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    runs=d.get('snapshot',{}).get('toolRuns',[])
    print(json.dumps([{'tool':r['toolName'],'status':r['status'],'args':r.get('argsSnippet','')} for r in runs]))
except: print('[]')
" 2>/dev/null || echo "[]")

  runs2=$(proxy_curl -s \
    "$BASE/api/debug/session/user-anon-tes:$SESSION_ID/state?token=$DEBUG_TOKEN" \
    --max-time 10 2>/dev/null | \
    python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    runs=d.get('snapshot',{}).get('toolRuns',[])
    print(json.dumps([{'tool':r['toolName'],'status':r['status'],'args':r.get('argsSnippet','')} for r in runs]))
except: print('[]')
" 2>/dev/null || echo "[]")

  # Merge both lists
  python3 -c "
import json,sys
r1=json.loads(sys.argv[1])
r2=json.loads(sys.argv[2])
print(json.dumps(r1+r2))
" "$runs1" "$runs2" 2>/dev/null || echo "[]"
}

# 断言最后 N 个 tool runs 中包含指定工具名
assert_tool_called() {
  local label="$1"
  local tool_name="$2"
  local runs
  runs=$(get_tool_runs)
  if echo "$runs" | python3 -c "import json,sys; runs=json.load(sys.stdin); exit(0 if any(r['tool']==sys.argv[1] for r in runs) else 1)" "$tool_name" 2>/dev/null; then
    echo -e "${GREEN}[PASS]${RESET} $label | tool '$tool_name' was called"
    ((PASS++))
  else
    echo -e "${YELLOW}[WARN]${RESET} $label | tool '$tool_name' NOT found in tool runs"
    ((WARN++))
  fi
}

# --------------------------------------------------------------------------
# 主测试流程
# --------------------------------------------------------------------------

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BLUE}║     ChatWithMe-2 Production Integration Test         ║${RESET}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo "  Base URL   : $BASE"
echo "  Session ID : $SESSION_ID"
echo "  Started at : $(date '+%Y-%m-%d %H:%M:%S')"

# --------------------------------------------------------------------------
# Step 0: Debug API 连通性
# --------------------------------------------------------------------------
section "Step 0 — Debug API 连通性"

PING=$(proxy_curl -s "$BASE/api/debug/ping?token=$DEBUG_TOKEN" --max-time 10 2>/dev/null)
PING_OK=$(echo "$PING" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('pong','false'))" 2>/dev/null || echo "false")
if [[ "$PING_OK" == "True" || "$PING_OK" == "true" ]]; then
  MODEL=$(echo "$PING" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('env',{}).get('model','?'))" 2>/dev/null)
  echo -e "${GREEN}[PASS]${RESET} Debug API 可达 | model=$MODEL"
  ((PASS++))
else
  echo -e "${RED}[FAIL]${RESET} Debug API 不可达 | $PING"
  ((FAIL++))
fi

# --------------------------------------------------------------------------
# Step 1: 基础对话 + 日期感知
# --------------------------------------------------------------------------
section "Step 1 — 基础对话 + 日期感知"

echo "发送: 你好，今天是几号？你能做什么？"
RAW=$(send_message "你好，今天是几号？你能做什么？" 60)
assert_response "基础对话" "$RAW"
sleep 4

# --------------------------------------------------------------------------
# Step 2: Web 搜索（工具调用）
# --------------------------------------------------------------------------
section "Step 2 — Web 搜索工具（builtin_web_search）"

echo "发送: 搜索今日最重要的一条科技新闻，用一句话总结"
RAW=$(send_message "搜索今日最重要的一条科技新闻，用一句话总结" 90)
assert_response "Web搜索:有结果" "$RAW"
assert_tool_called "Web搜索:工具被调用" "builtin_web_search"
sleep 4

# --------------------------------------------------------------------------
# Step 3: ADC 多系列折线图
# --------------------------------------------------------------------------
section "Step 3 — ADC 多系列折线图（长格式 + colorField）"

echo "发送: 画折线图 A/B 产品 2021-2025 年销售额"
RAW=$(send_message "画一个折线图，显示A产品2021-2025年销售额分别为50/80/120/100/140万，B产品为40/60/90/110/130万（单位：万元）" 90)
assert_response "ADC折线图:生成成功" "$RAW" '```adc'
assert_tool_called "ADC折线图:chart_template被调用" "builtin_chart_template"

# 额外验证：必须包含 colorField（多系列必须用长格式）
if echo "$RAW" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if 'colorField' in d.get('response','') else 1)" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${RESET} ADC折线图:使用长格式数据(colorField 存在)"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} ADC折线图:未检测到 colorField（可能使用了宽格式）"
  ((WARN++))
fi

# 验证有 title 字段
if echo "$RAW" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('response',''); exit(0 if '\"title\"' in r else 1)" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${RESET} ADC折线图:title 字段存在"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} ADC折线图:title 字段缺失"
  ((WARN++))
fi
sleep 4

# --------------------------------------------------------------------------
# Step 4: ECharts 仪表盘图
# --------------------------------------------------------------------------
section "Step 4 — ECharts 仪表盘图（gauge）"

echo "发送: 用仪表盘图显示 CPU 使用率 72%"
RAW=$(send_message "用仪表盘图（gauge）显示当前服务器CPU使用率72%" 90)
assert_response "ECharts gauge:生成成功" "$RAW" '```echarts'
assert_tool_called "ECharts gauge:chart_template被调用" "builtin_chart_template"
sleep 4

# --------------------------------------------------------------------------
# Step 5: Mermaid 流程图
# --------------------------------------------------------------------------
section "Step 5 — Mermaid 流程图（flowchart）"

echo "发送: 用 mermaid 画登录流程图"
RAW=$(send_message "用mermaid画一个用户登录流程图：输入账号密码→验证→成功则跳转主页，失败则提示错误" 60)
assert_response "Mermaid flowchart:生成成功" "$RAW" '```mermaid'
assert_tool_called "Mermaid flowchart:chart_template被调用" "builtin_chart_template"

# 验证无 HTML 标签
if echo "$RAW" | python3 -c "
import json,sys,re
d=json.load(sys.stdin)
r=d.get('response','')
has_html=bool(re.search(r'<[a-z]+>', r, re.I))
exit(1 if has_html else 0)
" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${RESET} Mermaid flowchart:无 HTML 标签"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} Mermaid flowchart:检测到 HTML 标签（可能导致渲染失败）"
  ((WARN++))
fi
sleep 4

# --------------------------------------------------------------------------
# Step 6: 复合 Dashboard（stat + adc）
# --------------------------------------------------------------------------
section "Step 6 — 复合看板（dashboard = stat KPI + adc 折线图）"

echo "发送: 创建包含 KPI 卡片 + 折线图的 dashboard"
RAW=$(send_message "展示以下指标并配上折线图，用dashboard格式：日活用户5.2万(+8%)，订单量1830(+3.2%)，收入42万(-1.5%)；另外用折线图显示过去6天日活：3.8/4.1/4.5/4.9/5.0/5.2万" 90)
assert_response "Dashboard:生成成功" "$RAW" '```dashboard'
sleep 4

# --------------------------------------------------------------------------
# Step 7: 数据分析（builtin_data_analyzer → 图表）
# --------------------------------------------------------------------------
section "Step 7 — 数据分析工具（builtin_data_analyzer）"

echo "发送: 分析 CSV 数据并推荐图表"
RAW=$(send_message "分析这份数据并生成最合适的图表：
月份,访问量,转化率
1月,12000,3.2
2月,15000,3.5
3月,18000,3.8
4月,14000,3.1
5月,20000,4.2
6月,22000,4.5" 90)
assert_response "数据分析:生成成功" "$RAW"
assert_tool_called "数据分析:builtin_data_analyzer被调用" "builtin_data_analyzer"
sleep 4

# --------------------------------------------------------------------------
# Step 8: React 交互组件
# --------------------------------------------------------------------------
section "Step 8 — React 交互组件"

echo "发送: 创建 BMI 计算器"
RAW=$(send_message "创建一个BMI计算器React组件：输入身高(cm)和体重(kg)，点击计算后显示BMI值和评级（偏瘦/正常/超重/肥胖）" 60)
assert_response "React组件:生成成功" "$RAW" '```react'

# 验证无 import React
if echo "$RAW" | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d.get('response','')
exit(1 if 'import React' in r else 0)
" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${RESET} React组件:无 'import React'（符合规范）"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} React组件:包含 'import React'（沙箱环境无需导入）"
  ((WARN++))
fi
sleep 2

# --------------------------------------------------------------------------
# Step 9: fixChart REST API
# --------------------------------------------------------------------------
section "Step 9 — fixChart REST API（破损 JSON 修复）"

echo "测试: 修复缺少右括号的 ECharts bar 图"
FIX_PAYLOAD_FILE=$(mktemp)
FIX_SESSION="$SESSION_ID"
python3 << PYEOF > "$FIX_PAYLOAD_FILE"
import json
broken = '{"title":{"text":"Sales"},"xAxis":{"data":["A","B"]},"yAxis":{},"series":[{"type":"bar","data":[120,200}]}'
payload = {
    "sessionId": "$FIX_SESSION",
    "messageId": "msg-fix-test",
    "engine": "echarts",
    "chartType": "bar",
    "brokenSpec": broken,
    "errorMessage": "Unexpected token }"
}
print(json.dumps(payload))
PYEOF

FIX_RAW=$(proxy_curl -s -X POST "$BASE/api/chat/fix-chart" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  --data-binary "@$FIX_PAYLOAD_FILE" \
  --max-time 60 2>/dev/null)
rm -f "$FIX_PAYLOAD_FILE"

# Parse response via tmpfile to handle multi-line JSON correctly
FIX_TMPFILE=$(mktemp)
printf '%s' "$FIX_RAW" > "$FIX_TMPFILE"
FIX_SUCCESS=$(python3 - "$FIX_TMPFILE" <<'PYEOF'
import json, sys
try:
    with open(sys.argv[1]) as f:
        d = json.load(f)
    print(d.get('success', 'false'))
except:
    print('false')
PYEOF
)
FIX_SPEC=$(python3 - "$FIX_TMPFILE" <<'PYEOF'
import json, sys
try:
    with open(sys.argv[1]) as f:
        d = json.load(f)
    print(d.get('fixedSpec', '')[:80])
except:
    print('')
PYEOF
)

if [[ "$FIX_SUCCESS" == "True" || "$FIX_SUCCESS" == "true" ]] && [[ -n "$FIX_SPEC" ]]; then
  # 验证修复后的 spec 是合法 JSON（用 python3 -c 避免 set -e 与嵌套 heredoc 的兼容问题）
  SPEC_VALID=$(python3 -c "
import json,sys
with open(sys.argv[1]) as f: d=json.load(f)
spec=d.get('fixedSpec','')
try: json.loads(spec); print('true')
except: print('false')
" "$FIX_TMPFILE" 2>/dev/null || echo "false")
  if [[ "$SPEC_VALID" == "true" ]]; then
    echo -e "${GREEN}[PASS]${RESET} fixChart:修复成功且结果是合法 JSON | ${FIX_SPEC}"
    ((PASS++))
  else
    echo -e "${YELLOW}[WARN]${RESET} fixChart:返回了 fixedSpec 但不是合法 JSON | ${FIX_SPEC}"
    ((WARN++))
  fi
else
  echo -e "${RED}[FAIL]${RESET} fixChart:修复失败 | $(head -c 200 "$FIX_TMPFILE")"
  ((FAIL++))
fi
rm -f "$FIX_TMPFILE"
sleep 2

# --------------------------------------------------------------------------
# Step 10: Deep Research Toggle REST API
# --------------------------------------------------------------------------
section "Step 10 — Deep Research Toggle（GET/POST REST API）"

DR_SESSION="dr-test-$SESSION_ID"

# 10a: 初始状态应为 false
DR_INIT=$(proxy_curl -s \
  "$BASE/api/chat/deep-research?sessionId=$DR_SESSION" \
  -H "$AUTH_HEADER" \
  --max-time 10 2>/dev/null)
DR_INIT_VAL=$(echo "$DR_INIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('deepResearch'))" 2>/dev/null || echo "error")

if [[ "$DR_INIT_VAL" == "False" || "$DR_INIT_VAL" == "false" ]]; then
  echo -e "${GREEN}[PASS]${RESET} DeepResearch:初始值=false（符合预期）"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} DeepResearch:初始值=$DR_INIT_VAL（期望 false）"
  ((WARN++))
fi

# 10b: Toggle ON
DR_ON=$(proxy_curl -s -X POST "$BASE/api/chat/deep-research/toggle" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{\"sessionId\": \"$DR_SESSION\"}" \
  --max-time 10 2>/dev/null)
DR_ON_VAL=$(echo "$DR_ON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('deepResearch'))" 2>/dev/null || echo "error")

if [[ "$DR_ON_VAL" == "True" || "$DR_ON_VAL" == "true" ]]; then
  echo -e "${GREEN}[PASS]${RESET} DeepResearch:Toggle ON 成功 → deepResearch=true"
  ((PASS++))
else
  echo -e "${RED}[FAIL]${RESET} DeepResearch:Toggle ON 失败 → deepResearch=$DR_ON_VAL"
  ((FAIL++))
fi

# 10c: 持久化验证（GET 确认仍为 true）
DR_PERSIST=$(proxy_curl -s \
  "$BASE/api/chat/deep-research?sessionId=$DR_SESSION" \
  -H "$AUTH_HEADER" \
  --max-time 10 2>/dev/null)
DR_PERSIST_VAL=$(echo "$DR_PERSIST" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('deepResearch'))" 2>/dev/null || echo "error")

if [[ "$DR_PERSIST_VAL" == "True" || "$DR_PERSIST_VAL" == "true" ]]; then
  echo -e "${GREEN}[PASS]${RESET} DeepResearch:持久化验证通过（GET 返回 true）"
  ((PASS++))
else
  echo -e "${RED}[FAIL]${RESET} DeepResearch:持久化失败（GET 返回 $DR_PERSIST_VAL，期望 true）"
  ((FAIL++))
fi

# 10d: Toggle OFF
DR_OFF=$(proxy_curl -s -X POST "$BASE/api/chat/deep-research/toggle" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{\"sessionId\": \"$DR_SESSION\"}" \
  --max-time 10 2>/dev/null)
DR_OFF_VAL=$(echo "$DR_OFF" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('deepResearch'))" 2>/dev/null || echo "error")

if [[ "$DR_OFF_VAL" == "False" || "$DR_OFF_VAL" == "false" ]]; then
  echo -e "${GREEN}[PASS]${RESET} DeepResearch:Toggle OFF 成功 → deepResearch=false"
  ((PASS++))
else
  echo -e "${RED}[FAIL]${RESET} DeepResearch:Toggle OFF 失败 → deepResearch=$DR_OFF_VAL"
  ((FAIL++))
fi

# --------------------------------------------------------------------------
# Step 11: 消息删除 API
# --------------------------------------------------------------------------
section "Step 11 — 消息删除 API"

# 先创建一条独立消息用于删除测试
echo "创建测试消息用于删除..."
send_message "这条消息将被删除，请回复：收到" 60 > /dev/null
sleep 2

# 获取最新的 assistant 消息 ID
HISTORY=$(proxy_curl -s \
  "$BASE/api/chat/history?sessionId=$SESSION_ID" \
  -H "Origin: http://localhost:5173" \
  --max-time 10 2>/dev/null)

MSG_COUNT_BEFORE=$(echo "$HISTORY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(len(d.get('history',[])))
" 2>/dev/null || echo "0")

LAST_ASST_ID=$(echo "$HISTORY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
msgs=[m for m in d.get('history',[]) if m.get('role')=='assistant']
print(msgs[-1]['id'] if msgs else '')
" 2>/dev/null || echo "")

echo "删除前消息数: $MSG_COUNT_BEFORE  |  目标 ID: $LAST_ASST_ID"

if [[ -z "$LAST_ASST_ID" ]]; then
  echo -e "${YELLOW}[WARN]${RESET} 消息删除:无法获取 assistant 消息 ID，跳过"
  ((WARN++))
else
  DEL_RAW=$(proxy_curl -s -X DELETE \
    "$BASE/api/chat/message?messageId=$LAST_ASST_ID&sessionId=$SESSION_ID" \
    -H "Origin: http://localhost:5173" \
    --max-time 10 2>/dev/null)

  DEL_OK=$(echo "$DEL_RAW" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('deleted','false'))
" 2>/dev/null || echo "false")

  if [[ "$DEL_OK" == "True" || "$DEL_OK" == "true" ]]; then
    echo -e "${GREEN}[PASS]${RESET} 消息删除:deleted=true"
    ((PASS++))
  else
    echo -e "${RED}[FAIL]${RESET} 消息删除:deleted=false | $DEL_RAW"
    ((FAIL++))
  fi

  # 验证历史条数减少
  sleep 1
  MSG_COUNT_AFTER=$(proxy_curl -s \
    "$BASE/api/chat/history?sessionId=$SESSION_ID" \
    -H "Origin: http://localhost:5173" \
    --max-time 10 2>/dev/null | \
    python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('history',[])))" 2>/dev/null || echo "$MSG_COUNT_BEFORE")

  if [[ "$MSG_COUNT_AFTER" -lt "$MSG_COUNT_BEFORE" ]]; then
    echo -e "${GREEN}[PASS]${RESET} 消息删除:history 减少 ($MSG_COUNT_BEFORE → $MSG_COUNT_AFTER)"
    ((PASS++))
  else
    echo -e "${RED}[FAIL]${RESET} 消息删除:history 未减少 ($MSG_COUNT_BEFORE → $MSG_COUNT_AFTER)"
    ((FAIL++))
  fi
fi

# --------------------------------------------------------------------------
# Step 12: 精确数学计算（builtin_math_eval）
# --------------------------------------------------------------------------
section "Step 12 — 精确数学计算工具（builtin_math_eval）"

echo "发送: 精确计算大数和单位换算"
RAW=$(send_message "请精确计算：1. 2的53次方 + 1 等于多少？2. 身高175cm换算成英尺是多少？" 60)
assert_response "数学计算:有结果" "$RAW"
assert_tool_called "数学计算:builtin_math_eval被调用" "builtin_math_eval"

# 验证结果包含正确的大数（2^53+1 = 9007199254740993）
if echo "$RAW" | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d.get('response','')
# Strip commas/spaces from number formatting before comparison
r_stripped = r.replace(',', '').replace(' ', '')
exit(0 if '9007199254740993' in r_stripped else 1)
" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${RESET} 数学计算:2^53+1 计算结果正确（9007199254740993）"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} 数学计算:结果中未找到预期值 9007199254740993"
  ((WARN++))
fi
sleep 4

# --------------------------------------------------------------------------
# Step 13: 实时天气（builtin_weather）
# --------------------------------------------------------------------------
section "Step 13 — 实时天气工具（builtin_weather）"

echo "发送: 查询北京当前天气"
RAW=$(send_message "北京今天天气怎么样？给我当前气温和未来几天的预报。" 60)
assert_response "天气查询:有结果" "$RAW"
assert_tool_called "天气查询:builtin_weather被调用" "builtin_weather"

# 验证回复包含温度数字（°C）
if echo "$RAW" | python3 -c "
import json,sys,re
d=json.load(sys.stdin)
r=d.get('response','')
exit(0 if re.search(r'-?\d+(\.\d+)?°C', r) or re.search(r'-?\d+(\.\d+)? *[°℃]', r) or '摄氏' in r or 'temperature' in r.lower() else 1)
" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${RESET} 天气查询:回复包含温度数据"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} 天气查询:未检测到温度数据"
  ((WARN++))
fi
sleep 4

# --------------------------------------------------------------------------
# Step 14: Wikipedia 百科查询（builtin_wikipedia）
# --------------------------------------------------------------------------
section "Step 14 — Wikipedia 百科工具（builtin_wikipedia）"

echo "发送: 查询量子计算简介"
RAW=$(send_message "用Wikipedia查一下「量子计算」（quantum computing）的简介。" 60)
assert_response "Wikipedia查询:有结果" "$RAW"
assert_tool_called "Wikipedia查询:builtin_wikipedia被调用" "builtin_wikipedia"

# 验证回复包含量子相关内容
if echo "$RAW" | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d.get('response','').lower()
exit(0 if any(kw in r for kw in ['quantum','qubit','量子','superposition','叠加']) else 1)
" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${RESET} Wikipedia查询:回复包含量子计算相关内容"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} Wikipedia查询:未检测到量子计算相关关键词"
  ((WARN++))
fi
sleep 4

# --------------------------------------------------------------------------
# Step 15: 汇率换算（builtin_currency）
# 使用独立 session 避免长对话导致工具调用不稳定
# --------------------------------------------------------------------------
section "Step 15 — 汇率换算工具（builtin_currency）"

CURRENCY_SESSION="currency-test-$SESSION_ID"
echo "发送: 查询美元兑人民币汇率并换算（独立 session: $CURRENCY_SESSION）"
RAW=$(proxy_curl -s -X POST "$BASE/api/chat" \
  -H "Origin: http://localhost:5173" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{\"message\": $(echo "100美元等于多少人民币？顺便告诉我今天的USD/CNY汇率。" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().rstrip()))"), \"sessionId\": \"$CURRENCY_SESSION\"}" \
  --max-time 60 2>/dev/null)
assert_response "汇率换算:有结果" "$RAW"

# 验证工具被调用（独立 session）
sleep 2
CURRENCY_RUNS=$(proxy_curl -s \
  "$BASE/api/debug/session/anonymous:$CURRENCY_SESSION/state?token=$DEBUG_TOKEN" \
  --max-time 10 2>/dev/null | \
  python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    runs=d.get('snapshot',{}).get('toolRuns',[])
    print(json.dumps([r['tool'] if 'tool' in r else r['toolName'] for r in runs]))
except: print('[]')
" 2>/dev/null || echo "[]")
if echo "$CURRENCY_RUNS" | python3 -c "import json,sys; runs=json.load(sys.stdin); exit(0 if 'builtin_currency' in runs else 1)" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${RESET} 汇率换算:builtin_currency被调用 | tool 'builtin_currency' was called"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} 汇率换算:builtin_currency未在toolRuns中（模型可能用训练知识回答）"
  ((WARN++))
fi

# 验证回复包含人民币数字（100 USD 大约 700-800 CNY）
if echo "$RAW" | python3 -c "
import json,sys,re
d=json.load(sys.stdin)
r=d.get('response','')
# 匹配 6xx 到 8xx 范围的换算结果
nums = [float(n) for n in re.findall(r'\d+\.?\d*', r) if 600 <= float(n) <= 850]
exit(0 if nums else 1)
" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${RESET} 汇率换算:结果在合理范围内（600-850 CNY per 100 USD）"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} 汇率换算:未检测到合理范围的换算结果"
  ((WARN++))
fi
sleep 2

# --------------------------------------------------------------------------
# Step 16: Debug Session 状态验收
# --------------------------------------------------------------------------
section "Step 16 — Debug Session 状态验收"

STATE=$(proxy_curl -s \
  "$BASE/api/debug/session/anonymous:$SESSION_ID/state?token=$DEBUG_TOKEN" \
  --max-time 10 2>/dev/null)

# 验证无 lastError
LAST_ERROR=$(echo "$STATE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('snapshot',{}).get('lastError','null'))
" 2>/dev/null || echo "parse_failed")

if [[ "$LAST_ERROR" == "null" || "$LAST_ERROR" == "None" ]]; then
  echo -e "${GREEN}[PASS]${RESET} Session:无 lastError"
  ((PASS++))
else
  echo -e "${YELLOW}[WARN]${RESET} Session:lastError = $LAST_ERROR"
  ((WARN++))
fi

# 打印所有 tool runs 汇总
echo ""
echo "Tool runs in this session:"
echo "$STATE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
runs=d.get('snapshot',{}).get('toolRuns',[])
if not runs:
    print('  (none)')
else:
    for r in runs:
        status='✓' if r['status']=='success' else '✗'
        print(f'  {status} {r[\"toolName\"]:35s} {r.get(\"argsSnippet\",\"\")[:60]}')
" 2>/dev/null

# --------------------------------------------------------------------------
# 汇总
# --------------------------------------------------------------------------
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BLUE}║                    测试汇总                         ║${RESET}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${GREEN}PASS${RESET}  $PASS"
echo -e "  ${YELLOW}WARN${RESET}  $WARN"
echo -e "  ${RED}FAIL${RESET}  $FAIL"
echo ""
echo "  Session ID : $SESSION_ID"
echo "  Elapsed    : ${ELAPSED}s"
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}所有关键测试通过。WARN 项为模型行为差异，不影响功能。${RESET}"
  exit 0
else
  echo -e "${RED}存在 $FAIL 个失败项，请检查以上 [FAIL] 输出。${RESET}"
  exit 1
fi

