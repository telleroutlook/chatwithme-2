# ChatWithMe-2 生产环境测试指南

## 概述

本文档描述 ChatWithMe-2 生产系统的完整功能测试方案，包括手动测试 Prompt、自动化脚本说明、预期结果和调试方法。

- **生产 URL**: `https://chatwithme2mcp.lintao-mailbox.workers.dev`
- **测试脚本**: `scripts/test-production.sh`
- **Debug Token**: 存储在 Cloudflare Worker 的 `DEBUG_TOKEN` secret 中

---

## 快速开始

### 运行自动化测试脚本

```bash
# 使用随机 session（每次生成新 session）
bash scripts/test-production.sh

# 指定 session ID（复用已有会话）
bash scripts/test-production.sh my-test-session-01
```

脚本依赖：
- `curl`
- `python3`
- 代理（家庭 WiFi）：`192.168.1.3:7890` —— 不需要代理时，将所有 `https_proxy=...` 前缀去掉

### 手动测试

使用以下 Prompt 逐步发送到 `/api/chat`，或通过前端界面发送。

---

## 测试步骤详解

### Step 0 — Debug API 连通性

**目的**: 验证 Debug API 可达、模型配置正确。

**请求**:
```bash
curl "https://chatwithme2mcp.lintao-mailbox.workers.dev/api/debug/ping?token=claude-debug-a952d905222a512e"
```

**预期响应**:
```json
{
  "pong": true,
  "env": {
    "model": "GLM-4.7",
    "hasSerperKey": true,
    "debugEnabled": true
  }
}
```

**验证**: `pong == true`，`model` 字段非空。

---

### Step 1 — 基础对话 + 日期感知

**目的**: 验证模型可正常回复，且系统 Prompt 注入的当前日期生效。

**测试 Prompt**:
```
你好，今天是几号？你能做什么？
```

**预期结果**:
- 回复包含正确日期（与服务器实际日期一致）
- 介绍自己的能力（搜索、图表、数据分析等）

**注意**: 日期由系统 Prompt 注入 (`Current date: YYYY-MM-DD`)，模型无需工具调用即可回答。

---

### Step 2 — Web 搜索工具（builtin_web_search）

**目的**: 验证 Serper.dev 搜索后端正常工作，模型在被要求时可靠调用工具。

**测试 Prompt**:
```
搜索今日最重要的一条科技新闻，用一句话总结
```

**预期结果**:
- 回复包含真实、时效性强的新闻内容
- Debug API 的 toolRuns 中出现 `builtin_web_search`，状态为 `success`

**验证工具调用**:
```bash
curl "https://chatwithme2mcp.lintao-mailbox.workers.dev/api/debug/session/anonymous:SESSION_ID/state?token=claude-debug-a952d905222a512e" | python3 -m json.tool
```

**常见问题**:
- 若回复称"无法访问互联网"，查看 pitfall #5（Serper 后端失败 → 工具调用静默失败 → 模型回退训练知识）
- 系统 Prompt 必须使用 **MANDATORY** 强度而非 PREFERRED，否则 GLM-4.7 可能跳过工具调用

**注意**: 此步骤使用 `@callable chat()` 路径（REST API），有 55s 超时。多步工具链（搜索 + GLM 生成）可能在极慢时超时；WebSocket 流式路径无此限制。

---

### Step 3 — ADC 多系列折线图

**目的**: 验证 ADC（Ant Design Charts）折线图生成正确，且多系列使用长格式数据（`colorField`）。

**测试 Prompt**:
```
画一个折线图，显示A产品2021-2025年销售额分别为50/80/120/100/140万，B产品为40/60/90/110/130万（单位：万元）
```

**预期结果**:
- 回复包含 `` ```adc `` 代码块
- JSON 中包含 `"colorField"` 字段（多系列长格式标志）
- JSON 中包含 `"title"` 字段

**验证 colorField**（多系列必须使用长格式，宽格式无法正确着色）:
```python
import json
data = json.loads(adc_json_string)
assert "colorField" in str(data), "多系列折线图缺少 colorField"
```

**常见问题**:
- 若无 `colorField`，模型使用了宽格式数据（旧格式），可能导致多系列颜色错误
- 若无 `title`，检查 `knowledge-base/charts/adc.json` 的 example 字段

---

### Step 4 — ECharts 仪表盘图（gauge）

**目的**: 验证 ECharts gauge 类型图表生成正确。

**测试 Prompt**:
```
用仪表盘图（gauge）显示当前服务器CPU使用率72%
```

**预期结果**:
- 回复包含 `` ```echarts `` 代码块
- JSON 包含 `series[0].type: "gauge"` 和 `series[0].data[0].value: 72`
- JSON 包含 `"title"` 对象（如 `{"text": "CPU使用率"}`）

**注意**: gauge 类型分配给 ECharts（不是 ADC），AI 通过 `builtin_chart_template` 工具获取格式规范后生成。

---

### Step 5 — Mermaid 流程图

**目的**: 验证 Mermaid flowchart 生成正确，无多余 HTML 标签。

**测试 Prompt**:
```
用mermaid画一个用户登录流程图：输入账号密码→验证→成功则跳转主页，失败则提示错误
```

**预期结果**:
- 回复包含 `` ```mermaid `` 代码块
- Mermaid 代码以 `flowchart TD` 或 `flowchart LR` 开头
- 代码中无 `<div>`、`<span>` 等 HTML 标签（会导致渲染失败）

**验证无 HTML 标签**:
```python
import re, json
response = json.loads(raw)["response"]
assert not re.search(r'<[a-z]+>', response, re.I), "Mermaid 代码含 HTML 标签"
```

---

### Step 6 — 复合看板（Dashboard）

**目的**: 验证 Dashboard 格式（stat KPI 卡片 + 折线图混合布局）生成正确。

**测试 Prompt**:
```
展示以下指标并配上折线图，用dashboard格式：日活用户5.2万(+8%)，订单量1830(+3.2%)，收入42万(-1.5%)；另外用折线图显示过去6天日活：3.8/4.1/4.5/4.9/5.0/5.2万
```

**预期结果**:
- 回复包含 `` ```dashboard `` 代码块
- JSON 包含 `panels` 数组，含 `stat` 类型和 `adc`/`echarts` 类型的面板

**Dashboard 格式说明**:
```json
{
  "panels": [
    { "type": "stat", "title": "日活用户", "value": "5.2万", "trend": "+8%" },
    { "type": "adc", "title": "日活趋势", "spec": { ... } }
  ]
}
```

---

### Step 7 — 数据分析工具（builtin_data_analyzer）

**目的**: 验证 CSV 数据分析工具正常工作，能推荐并生成图表。

**测试 Prompt**:
```
分析这份数据并生成最合适的图表：
月份,访问量,转化率
1月,12000,3.2
2月,15000,3.5
3月,18000,3.8
4月,14000,3.1
5月,20000,4.2
6月,22000,4.5
```

**预期结果**:
- 回复包含数据分析摘要（统计指标、趋势描述）
- 生成一个或多个图表代码块（adc/echarts）
- Debug API 的 toolRuns 中出现 `builtin_data_analyzer`，状态为 `success`

---

### Step 8 — React 交互组件

**目的**: 验证 React 沙箱组件生成正确，无需 `import React`。

**测试 Prompt**:
```
创建一个BMI计算器React组件：输入身高(cm)和体重(kg)，点击计算后显示BMI值和评级（偏瘦/正常/超重/肥胖）
```

**预期结果**:
- 回复包含 `` ```react `` 代码块
- 代码**不含** `import React`（沙箱已全局注入，导入会报错）
- 组件使用 `useState` hook 管理输入状态
- 包含 BMI 分级逻辑（< 18.5 偏瘦，18.5-24 正常，24-28 超重，> 28 肥胖）

---

### Step 9 — fixChart REST API

**目的**: 验证 `/api/chat/fix-chart` 能正确修复破损的图表 JSON，并注入 knowledge base 中对应的格式规范辅助修复。

**请求**:
```bash
curl -X POST "https://chatwithme2mcp.lintao-mailbox.workers.dev/api/chat/fix-chart" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer anon-test-12345678" \
  -d '{
    "sessionId": "test-session",
    "messageId": "msg-001",
    "engine": "echarts",
    "chartType": "bar",
    "brokenSpec": "{\"title\":{\"text\":\"Sales\"},\"xAxis\":{\"data\":[\"A\",\"B\"]},\"yAxis\":{},\"series\":[{\"type\":\"bar\",\"data\":[120,200}]}",
    "errorMessage": "Unexpected token }"
  }'
```

**预期响应**:
```json
{
  "fixedSpec": "{ \"title\": ... \"series\": [...] }",
  "success": true
}
```

**验证**:
- `success == true`
- `fixedSpec` 是合法的 JSON（`json.loads()` 不抛异常）
- 修复后的 spec 包含原始的有效字段（`title`、`xAxis`、`series`）

**实现说明**:
- `fixChart` callable 从 `buildLookup()` 中查找 `echarts:bar` 的格式规范（outputContract、example、commonErrors），注入到修复 prompt 中（最多 3000 字符）
- 以 `temperature: 0.1` 调用模型，只提取 JSON 内容，不使用工具
- 响应只传递必要信息（engine、chartType、brokenSpec、errorMessage），不携带完整历史，节省 token

---

### Step 10 — Deep Research Toggle REST API

**目的**: 验证 Deep Research 模式开关的 REST API 正常工作，包括初始状态、toggle 切换、持久化验证。

**端点**:
- `GET /api/chat/deep-research?sessionId=SESSION_ID` — 查询当前状态
- `POST /api/chat/deep-research/toggle` — 切换开关（body: `{ "sessionId": "..." }`）

**测试流程**:
```bash
SESSION="dr-test-001"
AUTH="-H 'Authorization: Bearer anon-test-12345678'"

# 1. 查询初始状态（应为 false）
curl "$BASE/api/chat/deep-research?sessionId=$SESSION" $AUTH

# 2. Toggle ON
curl -X POST "$BASE/api/chat/deep-research/toggle" \
  -H "Content-Type: application/json" $AUTH \
  -d "{\"sessionId\": \"$SESSION\"}"

# 3. GET 确认持久化（应返回 true）
curl "$BASE/api/chat/deep-research?sessionId=$SESSION" $AUTH

# 4. Toggle OFF
curl -X POST "$BASE/api/chat/deep-research/toggle" \
  -H "Content-Type: application/json" $AUTH \
  -d "{\"sessionId\": \"$SESSION\"}"
```

**预期结果**:
- 初始 GET → `{ "deepResearch": false }`
- Toggle POST → `{ "deepResearch": true }`
- 持久化 GET → `{ "deepResearch": true }`（DO state 已持久化）
- Toggle OFF → `{ "deepResearch": false }`

**行为说明**:
- Toggle 通过 `@callable toggleDeepResearch()` → `this.setState({ deepResearch: !current })` 更新 DO 持久化状态
- 生效：下一次 `chat()` 调用时 `getMaxToolSteps(env, state.deepResearch)` 返回 8（开启）或 4（关闭）
- 前端 UI：输入框底部显示 "Deep research" pill 按钮，点击即 toggle，状态实时同步

**注意**: Debug `/state` endpoint 里的 `deepResearch` 字段可能显示为 false，这是 partyserver `getAgentByName` 的 set-name 机制干扰导致的（每次 `getAgentByName` 都发一个内部请求来初始化 name），但不影响实际功能。使用 REST `/api/chat/deep-research` GET 接口验证才是可靠方式。

---

### Step 11 — 消息删除 API

**目的**: 验证 `DELETE /api/chat/message` 正确删除消息，且历史记录条数相应减少。

**流程**:
1. 发送一条测试消息（用于删除）
2. 调用 `GET /api/chat/history` 获取当前消息列表，记录 count_before 和最后一条 assistant 消息的 ID
3. 调用 `DELETE /api/chat/message?messageId={id}&sessionId={sid}` 删除该消息
4. 再次调用 `GET /api/chat/history`，验证 count_after < count_before

**示例**:
```bash
# 步骤 2：获取历史
curl "https://chatwithme2mcp.lintao-mailbox.workers.dev/api/chat/history?sessionId=MY_SESSION" \
  -H "Origin: http://localhost:5173"

# 步骤 3：删除
curl -X DELETE \
  "https://chatwithme2mcp.lintao-mailbox.workers.dev/api/chat/message?messageId=MSG_ID&sessionId=MY_SESSION" \
  -H "Origin: http://localhost:5173"
```

**预期响应**:
```json
{ "deleted": true }
```

**实现说明**: `deleteMessage` 使用双步骤——先通过 `this.sql` 直接删除 DO SQLite 行，再调用 `persistMessages` 同步内存状态并广播给 WebSocket 客户端。仅 `persistMessages` 不够，因为它只做 UPSERT，不删除行（见 developer-pitfalls.md #12）。

---

### Step 12 — 精确数学计算（builtin_math_eval）

**目的**: 验证 `builtin_math_eval` 工具使用 mathjs 做精确计算，模型不用心算。

**测试 Prompt**:
```
请精确计算：1. 2的53次方 + 1 等于多少？2. 身高175cm换算成英尺是多少？
```

**预期结果**:
- 回复包含 `9007199254740993`（2^53+1 的精确值，LLM 心算通常会出错）
- 回复包含英尺换算结果（约 5.74 feet）
- Debug API 的 toolRuns 中出现 `builtin_math_eval`，状态为 `success`

**验证精确值**:
```python
import json
response = json.loads(raw)["response"]
assert "9007199254740993" in response, "大数计算精度不足"
```

**说明**: `mathjs` 内联运行，无外部 HTTP 请求，响应时间 < 5ms。支持：算术、代数、三角函数、统计（`mean/std`）、单位换算（`5 kg to lbs`）、矩阵运算。

---

### Step 13 — 实时天气（builtin_weather）

**目的**: 验证 `builtin_weather` 工具调用 Open-Meteo API（无 Key）获取实时天气数据。

**测试 Prompt**:
```
北京今天天气怎么样？给我当前气温和未来几天的预报。
```

**预期结果**:
- 回复包含当前气温（°C）
- 回复包含未来几天的天气预报（日期 + 温度范围 + 天气描述）
- Debug API 的 toolRuns 中出现 `builtin_weather`，状态为 `success`

**说明**: 两步实现 — Nominatim 地理编码（城市名→坐标）→ Open-Meteo 天气数据。均完全免费，无 API Key。`timezone` 参数默认 `auto`（从坐标自动检测）。

**常见问题**:
- 若城市名有歧义（如"中山"），可在 prompt 中提供更完整的名称（"广东中山市"）

---

### Step 14 — Wikipedia 百科查询（builtin_wikipedia）

**目的**: 验证 `builtin_wikipedia` 工具调用 Wikipedia REST API（无 Key），支持多语言。

**测试 Prompt**:
```
用Wikipedia查一下「量子计算」（quantum computing）的简介。
```

**预期结果**:
- 回复包含量子计算的定义/描述（qubit、叠加态等关键词）
- 包含 Wikipedia 原文链接
- Debug API 的 toolRuns 中出现 `builtin_wikipedia`，状态为 `success`

**多语言测试**（可选）:
```
用中文 Wikipedia 查一下「机器学习」的简介（lang=zh）
```

**说明**: 工具优先直接匹配文章标题，失败时回退到 OpenSearch 模糊搜索。`lang` 参数支持 en/zh/ja/de/fr/es 等主流语言。

---

### Step 15 — 汇率换算（builtin_currency）

**目的**: 验证 `builtin_currency` 工具调用 open.er-api.com 实时汇率数据（无 Key）。

**测试 Prompt**:
```
100美元等于多少人民币？顺便告诉我今天的USD/CNY汇率。
```

**预期结果**:
- 回复包含合理的换算结果（100 USD ≈ 700–800 CNY，具体取决于实时汇率）
- 包含汇率更新时间
- Debug API 的 toolRuns 中出现 `builtin_currency`，状态为 `success`

**验证汇率合理性**:
```python
import re, json
response = json.loads(raw)["response"]
nums = [float(n) for n in re.findall(r'\d+\.?\d*', response) if 600 <= float(n) <= 850]
assert nums, "换算结果不在合理范围内"
```

**说明**: 工具级缓存（1小时 TTL），同一基准货币在 1 小时内不重复请求，避免消耗免费额度（~1500次/月）。支持 166 种 ISO 4217 货币。

---

### Step 16 — 英语词典（builtin_dictionary）

**目的**: 验证 `builtin_dictionary` 工具调用 Free Dictionary API（无 Key），返回词义、音标、词性和例句。

**测试 Prompt**:
```
What does the word 'ephemeral' mean? Give me its definition, part of speech, and an example sentence.
```

**预期结果**:
- 回复包含词义（lasting a short time / 短暂的）
- 包含词性（adjective）
- 包含例句
- Debug API 的 toolRuns 中出现 `builtin_dictionary`，状态为 `success`

**说明**: 使用 `https://api.dictionaryapi.dev/api/v2/entries/en/{word}`，完全免费无需 Key，仅支持英文单词。返回最多 3 个词性、每词性 2 条定义 + 同义词。

---

### Step 17 — 时区/日期计算（builtin_datetime）

**目的**: 验证 `builtin_datetime` 工具（纯 JS，零网络请求）的时区转换和日期差计算能力。

**测试 Prompt**:
```
北京时间2025年3月15日下午3点，对应纽约是几点？另外计算2025-01-01到2026-01-01之间有多少天。
```

**预期结果**:
- 时区转换：北京 15:00 → 纽约 02:00（UTC-5）或 03:00（夏令时 UTC-4），即凌晨 2-3 点
- 日期差：365 天（2025 年不是闰年）
- Debug API 的 toolRuns 中出现 `builtin_datetime`，状态为 `success`

**操作列表**:

| operation | 用途 | 必填参数 |
|-----------|------|----------|
| `now` | 查当前各时区时间 | 可选 `to_timezone` |
| `convert` | 某时间转换到目标时区 | `datetime`, `from_timezone`, `to_timezone` |
| `add` | 日期加减 | `datetime`, `amount`, `unit` |
| `diff` | 两日期之差 | `datetime`, `datetime2` |

**说明**: 使用 `Intl.DateTimeFormat` + 标准 JS Date，Cloudflare Workers 原生支持。延迟 < 1ms，不消耗任何外部 API 额度。

---

### Step 18 — GitHub 仓库查询（builtin_github）

**目的**: 验证 `builtin_github` 工具调用 GitHub REST API（公开接口，无 Key），获取仓库信息和最新 Release。

**测试 Prompt**:
```
查一下 facebook/react 这个 GitHub 仓库的基本信息，包括 star 数、最新版本和主要语言。
```

**预期结果**:
- 回复包含 star 数（react 有 240k+）
- 包含最新 Release 版本号（v19.x）
- 包含主要语言（JavaScript）
- Debug API 的 toolRuns 中出现 `builtin_github`，状态为 `success`

**两种查询模式**:
- **精确查询**：`query` 填 `owner/repo` 格式（如 `facebook/react`）→ 并行获取仓库元数据 + 最新 Release
- **搜索模式**：`query` 填关键词（如 `typescript http client`）→ 返回前 5 个结果

**说明**: 无 Key 限额 60 次/小时，对于聊天场景完全够用。Rate limit 触发时返回友好错误提示。精确查询时两个 HTTP 请求并行发送，延迟约 200ms。

---

### Step 19 — Debug Session 状态验收（原 Step 16）

**目的**: 检查整个测试 session 中无未处理错误，所有工具调用均成功。

**请求**:
```bash
curl "https://chatwithme2mcp.lintao-mailbox.workers.dev/api/debug/session/anonymous:SESSION_ID/state?token=claude-debug-a952d905222a512e" | python3 -m json.tool
```

**预期结果**:
- `snapshot.lastError == null`
- `snapshot.toolRuns` 中所有调用的 `status == "success"`
- `deepResearch` 字段存在（值为 false 或 true）

**解读 toolRuns**（完整工具集）:
```json
{
  "snapshot": {
    "toolRuns": [
      { "toolName": "builtin_web_search",    "status": "success", "argsSnippet": "query=..." },
      { "toolName": "builtin_data_analyzer", "status": "success", "argsSnippet": "..." },
      { "toolName": "builtin_chart_template","status": "success", "argsSnippet": "engine=adc..." },
      { "toolName": "builtin_math_eval",     "status": "success", "argsSnippet": "expression=..." },
      { "toolName": "builtin_weather",       "status": "success", "argsSnippet": "location=..." },
      { "toolName": "builtin_wikipedia",     "status": "success", "argsSnippet": "query=..." },
      { "toolName": "builtin_currency",      "status": "success", "argsSnippet": "from=USD..." },
      { "toolName": "builtin_dictionary",    "status": "success", "argsSnippet": "word=..." },
      { "toolName": "builtin_datetime",      "status": "success", "argsSnippet": "operation=convert..." },
      { "toolName": "builtin_github",        "status": "success", "argsSnippet": "query=facebook/react" }
    ],
    "lastError": null
  },
  "deepResearch": false
}
```

---

## Debug API 参考

### 端点列表

| 端点 | 说明 |
|---|---|
| `GET /api/debug/ping?token=TOKEN` | 连通性检查 + 环境信息 |
| `GET /api/debug/session/:agentName/state?token=TOKEN` | DO 运行时状态（toolRuns、events、retryStats、lastError、**deepResearch**） |
| `GET /api/debug/session/:agentName/info?token=TOKEN` | 综合信息（messageCount、last snippets、MCP 状态） |
| `GET /api/debug/session/:agentName/history?limit=N&token=TOKEN` | 聊天历史（默认 20 条，最多 200 条） |
| `GET /api/debug/session/:agentName/stream?token=TOKEN` | SSE 实时事件流 |
| `GET /api/chat/deep-research?sessionId=SID` | 查询 deep research 当前状态 |
| `POST /api/chat/deep-research/toggle` | 切换 deep research 开关 |
| `POST /api/chat/fix-chart` | 修复破损图表 JSON |

### agentName 格式

- 带 Bearer Token 认证用户：`user-{token前8字符}:sessionId`（如 `user-anon-tes:my-session`）
- Guest（无 token）：`anonymous:sessionId`

### 查找 agentName

```bash
wrangler tail --format=json 2>&1 | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line.startswith('{'): continue
    try:
        obj = json.loads(line)
        for log in obj.get('logs', []):
            for msg in log.get('message', []):
                if '\"agentName\"' in str(msg):
                    d = json.loads(msg) if isinstance(msg, str) else msg
                    print(d.get('agentName',''))
    except: pass
" | sort -u
```

---

## 常见问题排查

### 模型返回"无法访问互联网"

原因：`builtin_web_search` 工具调用失败（Serper 后端问题），模型回退至训练知识。

排查步骤：
1. 检查 toolRuns：`status == "error"` 还是工具根本未被调用？
2. 若工具未被调用：检查系统 Prompt 中 web_search 的触发强度（必须是 MANDATORY）
3. 若工具报错：直接测试 Serper API：
   ```bash
   curl -X POST https://google.serper.dev/search \
     -H "X-API-KEY: $SERPER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"q":"test","num":3}'
   ```

### 图表无 title 字段

原因：模型生成 chart spec 时未包含 title，或 knowledge base 示例中缺少 title。

排查：检查 `knowledge-base/charts/{engine}.json` 对应类型的 example/spec_example 是否含 title 字段。

### deleteMessage 返回 `deleted: false`

原因：消息 ID 不存在于服务器端 `this.messages`（客户端/服务端 ID 不一致，见 pitfall #8）。

解决：页面刷新后重试（触发 `_reconcileAssistantIdsWithServerState`），或等下一次 sendMessage 后再删除。

### fixChart 返回 success:false

原因可能：
1. `engine:chartType` 组合不在 knowledge base 中（会 fallback 到无 template 的修复）
2. 模型修复后输出非 JSON（如 markdown 代码块包裹）
3. 模型 timeout（55s 限制）

排查：检查 `errorMessage` 是否足够详细，engine/chartType 是否拼写正确。

### Deep Research toggle 不持久化

原因：DO 实例被垃圾回收后重新初始化（idle timeout）。

排查：用 `GET /api/chat/deep-research` 验证（而非 debug `/state`），后者可能受 partyserver 内部 set-name 机制影响。

### GLM 速率限制

症状：多个不同"bug"同时出现（乱码、`</think>` 泄漏、超时）。

排查：
```bash
wrangler tail --format=json 2>&1 | grep -o '速率限制'
```

处理：等待 60s 后重试。测试时每步之间保持 ≥5s 间隔（脚本中为 4s，可适当增加）。

### callable 路径超时（HTTP 500，无响应）

原因：`@callable chat()` 有 55s AbortController 超时，多步工具链（工具调用 + GLM 生成）可能超时。

解决：
- 调试时使用 WebSocket 路径（前端界面）而非 REST API
- 或增大 `CHAT_MODEL_TIMEOUT_MS` env var（默认 55000）

### builtin_math_eval 未被调用

原因：模型认为问题"很简单"，直接心算回答了。

解决：在 prompt 中明确要求精确计算或使用工具：
> "请用计算工具精确计算：2^53 + 1 = ?"

系统 Prompt 中已注明"Do NOT do multi-digit arithmetic mentally"，但 GLM 有时仍会跳过。

### builtin_weather 返回位置未找到

原因：Nominatim 地理编码 API 无法解析城市名（罕见地名或拼写错误）。

排查：
```bash
curl -s "https://nominatim.openstreetmap.org/search?q=CITY_NAME&format=json&limit=1"
```

解决：提供更具体的位置名称（如 "上海市" 而非 "上海"，"New York City" 而非 "NY"）。

### builtin_wikipedia 返回"找不到文章"

原因：标题与 Wikipedia 页面名称不完全匹配。工具会先直接匹配，失败时回退到 OpenSearch 模糊搜索。

解决：使用更接近 Wikipedia 页面标题的名称（如 "爱因斯坦" → "阿尔伯特·爱因斯坦"）。若仍失败，切换语言（`lang=en`）。

### builtin_currency 汇率数据过时

说明：open.er-api.com 免费版每日更新，缓存 TTL 1 小时。汇率不是实时的（通常延迟 6-12 小时）。

若需要最新汇率：使用 `builtin_web_search` 搜索当前汇率，或升级到有 API Key 的付费计划。

### builtin_dictionary 返回"No dictionary entry found"

原因：单词拼写错误，或查询的是非英语单词（该工具仅支持英语）。

解决：确认单词拼写正确，使用单词原形（不加 -ing/-ed 等变形效果可能更好）。非英语单词请用 `builtin_wikipedia` 替代。

### builtin_datetime 时区转换结果偏差

原因：夏令时（DST）导致同一时区在不同季节有不同 UTC 偏移（如 `America/New_York` 冬季 UTC-5、夏季 UTC-4）。

说明：工具使用 IANA 时区名和系统 DST 数据，会自动计算正确偏移——测试时需注意日期对应的季节。

### builtin_github 返回 rate limit 错误

原因：GitHub 匿名 API 限额 60 次/小时（按 IP），密集测试可能触发。

解决：等待约 1 小时后重试，或为 Worker 配置 GitHub Personal Access Token（添加到 `Authorization` 请求头可提升至 5000 次/小时）。

---

## Bug 修复记录

本次测试发现并修复了以下问题：

### 1. deleteMessage 返回 deleted: false（严重）

- **根本原因**: 原始代码用 `result.meta?.changes ?? 0` 判断 DO SQLite DELETE 是否成功，但 `this.sql` 返回 `T[]`（行数组），无 `meta` 属性（那是 D1 Binding API 的概念）
- **修复**: 改用 `memIndex >= 0` 作为成功判断（先找到消息在内存中的位置），执行 SQL DELETE，再调用 `persistMessages(filtered)` 同步内存状态
- **文件**: `src/demos/chat/runtime/chat-methods.ts`

### 2. 图表生成缺少 title 字段（高）

- **根本原因**: `knowledge-base/charts/{adc,echarts,vega-lite}.json` 的示例中所有图表类型均无 title 字段，模型照搬示例导致生成的 chart spec 缺少 title
- **修复**: 为 ADC（12 种）、ECharts（11 种）、Vega-Lite（3 种）所有类型示例追加 title，并在 outputContract 中添加强制规则
- **文件**: `knowledge-base/charts/adc.json`, `echarts.json`, `vega-lite.json`

### 3. ADC dualAxes 使用已废弃 API（中）

- **根本原因**: knowledge base 中 dualAxes 的 commonErrors 描述过于简短，模型仍使用 v1 的 `geometryOptions` 和 `color`（在 ADC v2 中已移除）
- **修复**: 扩展 commonErrors 和 tips，明确禁止 `geometryOptions` 和 `color` 字段
- **文件**: `knowledge-base/charts/adc.json`

### 4. 前端图表渲染失败无修复入口（中）

- **新增**: `fixChart` @callable + REST endpoint，仅传递 engine/chartType/brokenSpec/errorMessage（不携带历史），注入 knowledge base 格式规范，以 temperature=0.1 修复
- **新增**: 前端 `InvalidChartSpec` 组件"修复图表"按钮，通过 `ChartFixCallbackContext` 深传回调
- **文件**: `chat-agent.ts`, `server/routes/chat.ts`, `components/MarkdownRenderer.tsx`, `features/chat/controllers/useMessageActions.ts`

### 5. Deep Research 仅 env var 控制，无前端开关（中）

- **新增**: `ChatAgentState.deepResearch?: boolean` 字段（DO 持久化），`getMaxToolSteps(env, stateDeepResearch)` 状态优先
- **新增**: `toggleDeepResearch()` / `getDeepResearch()` @callable
- **新增**: REST `POST /api/chat/deep-research/toggle` + `GET /api/chat/deep-research`
- **新增**: 前端输入框底部 "Deep research" pill 按钮（ChatPane bottomAddons）
- **文件**: `state-runtime.ts`, `runtime-config.ts`, `chat-agent.ts`, `server/routes/chat.ts`, `components/layout/ChatPane.tsx`

---

## 参考文档

- [Developer Pitfalls](developer-pitfalls.md) — 完整的已知问题和修复方案
- [Architecture Refactor Plan](official-architecture-refactor-execution-plan.md) — 架构决策记录
- [AI Chart Selection Refactor](ai-chart-selection-refactor-plan.md) — 图表引擎选择逻辑
