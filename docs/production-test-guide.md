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

### Step 9 — 消息删除 API

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

### Step 10 — Debug Session 状态验收

**目的**: 检查整个测试 session 中无未处理错误，所有工具调用均成功。

**请求**:
```bash
curl "https://chatwithme2mcp.lintao-mailbox.workers.dev/api/debug/session/anonymous:SESSION_ID/state?token=claude-debug-a952d905222a512e" | python3 -m json.tool
```

**预期结果**:
- `snapshot.lastError == null`
- `snapshot.toolRuns` 中所有调用的 `status == "success"`

**解读 toolRuns**:
```json
{
  "snapshot": {
    "toolRuns": [
      { "toolName": "builtin_web_search", "status": "success", "argsSnippet": "query=..." },
      { "toolName": "builtin_chart_template", "status": "success", "argsSnippet": "engine=adc..." },
      { "toolName": "builtin_data_analyzer", "status": "success", "argsSnippet": "..." }
    ],
    "lastError": null
  }
}
```

---

## Debug API 参考

### 端点列表

| 端点 | 说明 |
|---|---|
| `GET /api/debug/ping?token=TOKEN` | 连通性检查 + 环境信息 |
| `GET /api/debug/session/:agentName/state?token=TOKEN` | DO 运行时状态（toolRuns、events、retryStats、lastError） |
| `GET /api/debug/session/:agentName/info?token=TOKEN` | 综合信息（messageCount、last snippets、MCP 状态） |
| `GET /api/debug/session/:agentName/history?limit=N&token=TOKEN` | 聊天历史（默认 20 条，最多 200 条） |
| `GET /api/debug/session/:agentName/stream?token=TOKEN` | SSE 实时事件流 |

### agentName 格式

- 带 Bearer Token 认证用户：`user-{userId}:sessionId`
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

---

## 参考文档

- [Developer Pitfalls](developer-pitfalls.md) — 完整的已知问题和修复方案
- [Architecture Refactor Plan](official-architecture-refactor-execution-plan.md) — 架构决策记录
- [AI Chart Selection Refactor](ai-chart-selection-refactor-plan.md) — 图表引擎选择逻辑
