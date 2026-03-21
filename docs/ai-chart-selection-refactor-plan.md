# AI 自主选择图表引擎重构计划

> 状态: **已完成**
> 创建: 2026-03-20
> 完成: 2026-03-20
> 目标: 消除关键词匹配，让 AI 自主选择最佳图表引擎和类型，精准按需获取模板

---

## 1. 问题分析

### 当前方案的缺陷

当前通过关键词匹配（`chart-knowledge.ts` 中 4 组 keyword map + 正则）选择引擎并过滤知识注入 system prompt。存在以下问题：

| 问题 | 例子 |
|------|------|
| 无法穷举 | "帮我看看各部门预算流向" —— 没有任何关键词命中，但最佳是 ECharts sankey |
| 语义丢失 | 关键词只匹配表面词汇，无法理解数据结构和用户意图 |
| 误匹配 | "bar" 可能指酒吧，"state" 可能指美国州而非状态图 |
| 提前截断 | 最多选 2 引擎，选错则无补救 |
| 跨引擎重复 | 柱状图同时出现在 ADC、Vega-Lite、Mermaid 中，浪费 tokens 且让 AI 困惑 |

### Token 预算现状

| 场景 | 注入内容 | ~tokens |
|------|----------|---------|
| 非图表查询 | minimal prompt | ~1,500 |
| 泛图表 (无关键词命中) | ADC fallback | ~3,500 |
| 关键词命中 | 最多 2 引擎完整知识 | ~5,000-6,000 |
| 全部注入 (不可行) | 4 引擎全量 | ~14,000 |

---

## 2. 目标方案：三层 Prompt + Tool 架构

### 架构概览

```
System Prompt (常驻，每次请求)
├── Layer 1: 精简引擎目录 (~500 tokens)
│   每个图表类型一行描述，跨引擎去重后的唯一选择
├── Layer 2: 通用规则 (~300 tokens)
│   JSON 严格性、数据质量、美学规则
└── Layer 3: builtin_chart_template tool 定义 (~100 tokens)

Tool 调用 (AI 按需，仅图表请求时触发)
└── builtin_chart_template(engine, chartType)
    返回: outputContract + spec_example + notes + commonErrors (~800-1,200 tokens)
```

### 核心变化

1. **删除关键词匹配**：不再使用 `detectChartKeywords()`、`filter*Knowledge()`、`sort*()` 等函数
2. **跨引擎去重**：同类图表只保留最强引擎，AI 不需要在多个引擎间纠结
3. **AI 自主选择**：AI 根据用户意图和数据特征，从目录中选最佳引擎+类型
4. **按需获取模板**：通过 tool call 获取精准的 1 个图表类型的完整模板

### 预期 Token 节省

| 场景 | 旧方案 | 新方案 |
|------|--------|--------|
| 非图表查询 | ~1,500 | ~1,500 (不变，仍用 minimal prompt) |
| 图表查询 system prompt | ~3,500-6,000 | ~2,400 (目录+规则，固定) |
| Tool call 返回 | 0 | ~800-1,200 (精准 1 个类型) |
| **图表查询总计** | **3,500-6,000** | **~3,200-3,600** |
| 准确性 | 关键词可能选错 | AI 语义理解，100% 覆盖 |

---

## 3. 跨引擎去重方案

### 原则

> 同类图表只暴露一个"最强"引擎。AI 不需要知道 Vega-Lite 也能画柱状图。

### 去重决策表

| 图表能力 | 保留引擎 | 移除的重复 | 理由 |
|----------|----------|------------|------|
| 折线图 | ADC `line` | VL `line`, Mermaid `xychart-beta` | ADC 交互性和美观度最佳 |
| 柱状/条形图 | ADC `column`/`bar` | VL `bar`, Mermaid `xychart-beta` | 同上 |
| 散点图 | ADC `scatter` | VL `point` | ADC 更直观，facet 场景走 VL facet |
| 面积图 | ADC `area` | VL `area` | ADC 堆叠/动画更好 |
| 饼图 | ADC `pie` | VL `arc`, Mermaid `pie` | ADC 内环/标签/交互最强 |
| 热力图 | ADC `heatmap` | VL `rect` | ADC 更简洁 |
| 仪表盘 | ECharts `gauge` | ADC `gauge` | ECharts 支持进度条/多指针/自定义刻度 |
| 桑基图 | ECharts `sankey` | Mermaid `sankey-beta` | ECharts 渲染品质远超 Mermaid CSV 格式 |
| 思维导图 | Markmap `mindmap` | Mermaid `mindmap` | Markmap 可交互折叠/缩放 |
| 简单图 | Mermaid `flowchart` | Mermaid `graph` | `flowchart` 完全覆盖 `graph` |
| 架构图 | Excalidraw | Mermaid `block-beta`/`architecture-beta` | Excalidraw 手绘风更灵活 |
| 需求图 | (移除) | Mermaid `requirementDiagram` | 极少使用，可用 flowchart 替代 |

### 去重后各引擎保留的类型

**ADC (12 types)** — 标准数据图表，默认引擎：
- line, column, bar, area, pie, rose, scatter, radar, heatmap, funnel, histogram, dualAxes

**ECharts (11 types)** — 高级/专业图表：
- map, sankey, tree, treemap, sunburst, candlestick, gauge, themeRiver, wordCloud, bar3D, scatter3D

**Vega-Lite (3 types)** — 仅 ADC 做不到的统计/学术场景：
- boxplot, facet, layer

**Mermaid (10 types)** — 结构/关系图：
- flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, timeline, gitGraph, quadrantChart, kanban

**其他引擎 (无需模板)**：
- `mindmap` (Markmap) — markdown 大纲格式
- `excalidraw` — JSON elements 格式
- `stat` — KPI 卡片
- `dashboard` — 组合面板
- `react` — 交互组件

---

## 4. 主题适配规则 (深色/浅色)

### 现有主题基础设施

项目已有完善的主题系统：

- `src/components/chartThemeTokens.ts` — 定义 `LIGHT_CHART_THEME_TOKENS` / `DARK_CHART_THEME_TOKENS`
  - 包含：轴标题/标签颜色、轴线/网格颜色、图例颜色、标题颜色、分类调色板、背景、tooltip 颜色
- `src/components/chartVisualPreset.ts` — 为各引擎构建完整主题预设
  - G2/ADC: `g2Theme` (type: "classic" / "classicDark"，透明背景)
  - Mermaid: `mermaidThemeVariables` (50+ 变量：节点/边/Actor/Gantt/Pie/Timeline 全覆盖)
  - ECharts: `echartsTheme` (调色板 + 文字 + tooltip + legend + visualMap 样式)
- `src/hooks/useThemeDetector.ts` — 检测当前深浅主题
- 各 Renderer 已使用 `useThemeDetector()` + `getChartThemeTokens(isDark)` 注入主题

### 主题原则

**渲染器层面处理主题，AI 不需要在生成的代码中硬编码颜色。** 这是当前的正确设计：

- AI 生成的 JSON/Mermaid 代码中 **不应包含** 颜色值（调色板、字体颜色、背景色等）
- 渲染器在运行时根据 `isDark` 自动注入 `themeTokens` / `visualPreset`
- AI 只需关注数据结构和图表类型选择

### 本次重构需要确保的主题规则

以下规则需要写入 system prompt 的通用规则（Layer 2）和 tool 返回的 outputContract 中：

| 规则 | 说明 |
|------|------|
| 不要设置 `color` / `backgroundColor` | 渲染器自动应用主题调色板 |
| 不要设置字体颜色 | 轴标签、标题、图例文字颜色由主题 tokens 注入 |
| 不要设置 `axisLine.lineStyle.color` | 轴线/网格线颜色由渲染器覆盖 |
| 不要设置 `tooltip.backgroundColor` / `textStyle.color` | tooltip 样式由主题控制 |
| Mermaid 不要用 `%%{init:}%%` 覆盖主题 | 渲染器通过 `mermaid.initialize()` 设置主题 |
| 可以设置 `style.fillOpacity` / `innerRadius` 等结构性属性 | 这些不是颜色，是图表形态 |

### 需要审计/修复的 Renderer

以下渲染器需确认主题注入完整覆盖 AI 可能输出的样式属性：

| Renderer | 当前状态 | 需要检查 |
|----------|----------|----------|
| `AntDesignChartsRenderer.tsx` | 已注入 axis/legend/label 颜色 | 确认 label.style.fill 覆盖 |
| `EChartsRenderer.tsx` | 已注入 `themeTokens` 到 axisLabel | 确认 series-level 文字颜色覆盖 (如 label.color、emphasis.label.color) |
| `VegaLiteRenderer.tsx` | 仅传 `theme: isDark ? "dark" : undefined` | 需要增强：注入自定义 config 覆盖字体/线条/背景色，确保与 ADC/ECharts 视觉一致 |
| `ChartRenderer.tsx` (Mermaid) | 已注入 `mermaidThemeVariables` | 确认 `stateDiagram`/`classDiagram` 的边框/文字颜色 |
| `MarkmapRenderer.tsx` | 需确认 | 检查线条、节点文字颜色是否跟随主题 |

---

## 5. 实现步骤

### Phase 1: 知识库精简 (去重)

**目标**: 删除跨引擎重复的图表类型，精简 JSON 文件。

| 步骤 | 文件 | 操作 |
|------|------|------|
| 1.1 | `knowledge-base/charts/vega-lite.json` | 删除 bar/line/point/area/arc/rect/text 的 chartTypes 条目，typeWhitelist 相应缩减为 `["boxplot", "facet", "layer"]` |
| 1.2 | `knowledge-base/charts/mermaid.json` | 删除 `graph`、`pie`、`mindmap`、`xychart-beta`、`sankey-beta`、`block-beta`、`architecture-beta`、`requirementDiagram` 的 diagramTypes 条目 |
| 1.3 | `knowledge-base/charts/adc.json` | 删除 `gauge` 的 chartTypes 条目，typeWhitelist 移除 `"gauge"` |
| 1.4 | `knowledge-base/charts/echarts.json` | 不变（所有类型都是 ECharts 独占能力） |

**验证**: `npm run test:run` 通过 (部分测试可能需要更新)

### Phase 2: 新建 builtin_chart_template tool

**目标**: 实现 tool，让 AI 按需获取精准模板。

| 步骤 | 文件 | 操作 |
|------|------|------|
| 2.1 | `src/demos/chat/builtin-tools/chart-template.ts` | **新建**。实现 `createChartTemplateTool()` 和 `BUILTIN_CHART_TEMPLATE_KEY`。接收 `{ engine, chartType }` 参数，从知识库中查找并返回该图表类型的完整模板（outputContract + example/spec_example + notes/tips + commonErrors）。同时注入主题提醒："Do not set colors — the renderer applies theme-aware palettes automatically." |
| 2.2 | `src/demos/chat/runtime/tool-runtime.ts` | 导入并注册新 tool：加入 `getBuiltinToolsRaw()` 和 `BUILTIN_TOOL_LIST` |

**Tool 输入 schema**:
```typescript
z.object({
  engine: z.enum(["adc", "echarts", "mermaid", "vega-lite"])
    .describe("Chart engine to use"),
  chartType: z.string()
    .describe("Specific chart type, e.g. 'sankey', 'flowchart', 'boxplot'")
})
```

**Tool 输出格式** (示例 — ECharts sankey):
```json
{
  "engine": "echarts",
  "chartType": "sankey",
  "outputContract": [
    "ECharts blocks must be strict RFC 8259 JSON...",
    "Do not set color arrays or text colors -- the renderer applies theme-aware palettes and font colors automatically for both light and dark modes",
    ...
  ],
  "spec_example": { "tooltip": {}, "series": [{ "type": "sankey", ... }] },
  "notes": "series[].data is an array of {name} nodes...",
  "commonErrors": ["..."]
}
```

**Tool 输出格式** (示例 — Mermaid flowchart):
```json
{
  "engine": "mermaid",
  "chartType": "flowchart",
  "universalRules": ["NEVER use HTML tags...", ...],
  "whenToUse": "Process flows, decision trees...",
  "minimalTemplate": "flowchart TD\n    Start([Start]) --> ...",
  "commonErrors": ["Using graph instead of flowchart...", ...],
  "themeNote": "Do not use %%{init:}%% to override theme -- the renderer handles light/dark mode automatically"
}
```

**验证**: 单元测试验证各 engine+chartType 组合都能返回正确模板，unknown 类型返回可用类型列表。

### Phase 3: 重写 system prompt

**目标**: 用三层架构替换旧的关键词过滤 prompt。

| 步骤 | 文件 | 操作 |
|------|------|------|
| 3.1 | `src/demos/chat/system-prompt.ts` | **重写** `buildSystemPromptWithKeywords()` → `buildSystemPrompt()`。新函数接收 `toolList: string[]` (不再需要 `userMessage`)，始终返回包含引擎目录+通用规则的完整 prompt。删除 `buildPromptFromKnowledge()`、`buildMinimalPrompt()` 及相关旧函数。 |
| 3.2 | 同上 | 新增引擎目录部分 — 表格式列出所有去重后的图表类型，每行一句话描述 |
| 3.3 | 同上 | 新增通用规则部分 — JSON 严格性 + 数据质量 + 主题规则（"不要设置颜色"） |
| 3.4 | 同上 | tool 使用指引 — "When generating charts, ALWAYS call builtin_chart_template first to get the format spec" |
| 3.5 | `src/demos/chat/chat-agent.ts` | 更新调用点：`buildSystemPromptWithKeywords(toolList, message)` → `buildSystemPrompt(toolList)` |

**关于 `isChartRelated` 检测**:

保留一个简化版的图表相关检测，但仅用于决定是否在 prompt 中包含引擎目录（~500 tokens）。由于目录很精简，也可以考虑直接常驻（不做检测），简化逻辑。

**建议**: 直接常驻引擎目录，不做 isChartRelated 检测。500 tokens 的额外开销可以接受，换来的是逻辑大幅简化、消灭误判。

### Phase 4: 清理旧代码

**目标**: 删除不再需要的关键词匹配/过滤/排序逻辑。

| 步骤 | 文件 | 操作 |
|------|------|------|
| 4.1 | `src/demos/chat/chart-knowledge.ts` | 删除: `MERMAID_KEYWORD_MAP`, `ADC_KEYWORD_MAP`, `ECHARTS_KEYWORD_MAP`, `VEGALITE_KEYWORD_MAP`, `keywordMatches()`, `detectChartKeywords()`, `filterMermaidKnowledge()`, `filterAdcKnowledge()`, `filterEChartsKnowledge()`, `filterVegaLiteKnowledge()`, `sortMermaidDiagramTypes()`, `sortAdcChartTypes()`, `sortEChartsChartTypes()`, `sortVegaLiteChartTypes()`, `sortMermaidKnowledgeTypes()`, `buildAdcPromptSection()`, `buildMermaidPromptSection()`, `buildEChartsPromptSection()`, `buildVegaLitePromptSection()`。仅保留 `getChartKnowledge()` / `loadChartKnowledge()` 供 tool 使用。 |
| 4.2 | `src/types/chart-kb.ts` | 清理不再使用的类型 (如果有) |
| 4.3 | `src/demos/chat/system-prompt.test.ts` | **重写** 测试用例，覆盖新 prompt 结构 |
| 4.4 | `src/demos/chat/chart-knowledge.test.ts` (如存在) | 删除或重写关键词相关测试 |

### Phase 5: 主题适配审计与修复

**目标**: 确保所有渲染器在深色/浅色模式下正确覆盖 AI 可能输出的样式属性。

| 步骤 | 文件 | 操作 |
|------|------|------|
| 5.1 | `src/components/VegaLiteRenderer.tsx` | 增强主题注入：不仅传 `theme: "dark"` 还要注入自定义 `config` 覆盖 axis/legend/title 颜色，使用 `chartThemeTokens` 与 ADC/ECharts 保持视觉一致 |
| 5.2 | `src/components/EChartsRenderer.tsx` | 审计 series-level 覆盖：确认 `label.color`、`emphasis.label.color`、`itemStyle` 中 AI 可能硬编码的文字颜色都被主题覆盖 |
| 5.3 | `src/components/AntDesignChartsRenderer.tsx` | 审计 `label.style.fill` 的深色模式覆盖是否完整 |
| 5.4 | `src/components/ChartRenderer.tsx` (Mermaid) | 审计 stateDiagram / classDiagram / gantt 在深色模式下的边框、文字对比度 |
| 5.5 | `src/components/MarkmapRenderer.tsx` | 确认线条颜色、节点文字、展开/折叠按钮在深浅主题下的可见性 |
| 5.6 | 各 outputContract (in JSON) | 在各引擎的 outputContract 中新增规则：`"Do not set color/backgroundColor/textStyle.color -- the renderer applies theme-aware styles automatically for both light and dark modes"` |

### Phase 6: 测试与验证

| 步骤 | 验证内容 |
|------|----------|
| 6.1 | `npm run test:run` — 所有单元测试通过 |
| 6.2 | 手动测试矩阵 (见下表) |
| 6.3 | 深色模式全量截图对比 |
| 6.4 | `npm run deploy` 部署到生产 |

**手动测试矩阵**:

| 测试用例 | 期望 AI 选择 | 验证点 |
|----------|-------------|--------|
| "帮我看看各部门预算流向" | ECharts sankey | AI 无需关键词即可选对 |
| "画个柱状图对比季度收入" | ADC column | 默认引擎正确 |
| "展示用户注册流程" | Mermaid flowchart | 结构图正确分流 |
| "这组数据的分布统计" | VL boxplot | 统计场景走 Vega-Lite |
| "股票最近走势" | ECharts candlestick | 金融场景 |
| "中国各省GDP" | ECharts map | 地图场景 |
| "项目里程碑时间线" | Mermaid gantt | 时间相关结构图 |
| "对比三组实验的分面散点图" | VL facet | 分面场景 |
| "你好" (非图表) | 无 tool call | 不触发图表逻辑 |
| 以上全部在深色模式下重复 | — | 字体/线条/背景/tooltip 颜色正确 |

---

## 6. 引擎目录 Prompt 草稿

以下是 Layer 1 + Layer 2 的完整 prompt 文本草稿（预估 ~800 tokens）：

```markdown
## Chart Generation

You can generate charts and diagrams using code blocks. Pick the single best
engine + type for the user's data and intent from the catalog below, then call
`builtin_chart_template` to get the exact format before writing the code block.

### Engine Catalog

**```adc``` -- Standard Data Charts (DEFAULT for numeric data)**
- line: trends over time, multi-series comparison
- column: categorical comparison (vertical bars)
- bar: horizontal ranking, long category labels
- area: volume/cumulative trends, stacked composition
- pie: part-to-whole (4-8 slices), market share
- rose: polar area, categorical magnitude
- scatter: correlation, cluster detection
- radar: multi-dimension comparison (5-8 axes)
- heatmap: 2D matrix intensity (day x hour, etc.)
- funnel: conversion pipeline, stage drop-off
- histogram: distribution of continuous values
- dualAxes: two metrics with different scales

**```echarts``` -- Advanced / Specialty Charts**
- map: geographic choropleth (china/world)
- sankey: flow/allocation between nodes
- tree: hierarchical structures (org/file/decision)
- treemap: proportional hierarchy (disk/budget)
- sunburst: multi-level proportional rings
- candlestick: financial OHLC / K-line
- gauge: dashboard meter with progress/pointer
- themeRiver: category trends as stacked streams
- wordCloud: word frequency / tag importance
- bar3D: 3D categorical comparison
- scatter3D: 3D spatial scatter

**```vega-lite``` -- Statistical / Academic Charts**
- boxplot: distribution quartiles + outliers
- facet: split into sub-chart grid by category
- layer: multi-mark overlay (line + point + rule)

**```mermaid``` -- Structural Diagrams**
- flowchart: process flows, decision trees, architecture
- sequenceDiagram: API interactions, message flows
- classDiagram: OOP structures, type relationships
- stateDiagram-v2: state machines, lifecycle
- erDiagram: database entity relationships
- gantt: project timelines, task schedules
- timeline: chronological events / milestones
- gitGraph: branch/merge workflows
- quadrantChart: priority / 2x2 matrix
- kanban: task boards, agile workflows

**Other engines (format described in examples below, no template call needed):**
- ```mindmap```: interactive mind maps (markdown outline with # headings)
- ```excalidraw```: hand-drawn diagrams (JSON elements array)
- ```stat```: KPI metric cards (JSON array)
- ```dashboard```: composite grid layout
- ```react```: interactive React components

### Chart Rules

1. Call `builtin_chart_template(engine, chartType)` BEFORE generating any
   ```adc```, ```echarts```, ```vega-lite```, or ```mermaid``` code block.
   Follow the returned contract and example exactly.
2. Max 2 charts per response unless user explicitly asks for more.
3. Data: 4-6+ realistic data points, descriptive field names, multi-series
   use colorField/seriesField.
4. **Theme: Do NOT set colors, font colors, background colors, axis line colors,
   or tooltip styles.** The renderer automatically applies a curated palette and
   theme-aware styles for both light and dark modes. You may set structural
   properties (fillOpacity, innerRadius, lineWidth, etc.).
5. Mermaid: no HTML tags, no %%{init:}%% theme overrides, no Markdown inside.
6. JSON blocks (adc/echarts/vega-lite) must be strict RFC 8259 JSON.
   No comments, trailing commas, functions, or callbacks.
7. After generating, briefly explain what the chart shows.
```

---

## 7. 风险与回退策略

| 风险 | 缓解措施 |
|------|----------|
| AI 不调 tool 直接生成图表代码 | prompt 中强制要求 "ALWAYS call"；即使不调 tool，AI 有目录中的一句话描述作为基本指引；渲染器本身有容错 |
| AI 调 tool 后仍生成错误格式 | tool 返回 outputContract + commonErrors 双保险；渲染器有 JSON 修复和错误展示 |
| Tool call 增加一次往返延迟 | tool 是本地执行（内存查找 JSON），延迟 < 1ms；相比 LLM 生成时间可忽略 |
| GLM 模型 tool calling 可靠性 | GLM-4.7 已验证支持 tool calling + streaming；现有 3 个 builtin tools 运行稳定 |
| 去重后 AI 需要某个被移除的引擎 | 监控日志，如果频繁出现可以恢复；当前移除的都是明确弱于保留项的 |

---

## 8. 文件变更清单

| 文件 | 操作 | Phase |
|------|------|-------|
| `knowledge-base/charts/vega-lite.json` | 编辑 (删除 7 个重复类型) | 1 |
| `knowledge-base/charts/mermaid.json` | 编辑 (删除 8 个重复/弱类型) | 1 |
| `knowledge-base/charts/adc.json` | 编辑 (删除 gauge) | 1 |
| `src/demos/chat/builtin-tools/chart-template.ts` | **新建** | 2 |
| `src/demos/chat/runtime/tool-runtime.ts` | 编辑 (注册新 tool) | 2 |
| `src/demos/chat/system-prompt.ts` | **重写** | 3 |
| `src/demos/chat/chat-agent.ts` | 编辑 (更新调用签名) | 3 |
| `src/demos/chat/chart-knowledge.ts` | **大幅精简** | 4 |
| `src/types/chart-kb.ts` | 编辑 (清理类型) | 4 |
| `src/demos/chat/system-prompt.test.ts` | **重写** | 4 |
| `src/components/VegaLiteRenderer.tsx` | 编辑 (增强主题注入) | 5 |
| `src/components/EChartsRenderer.tsx` | 审计/修复 | 5 |
| `src/components/AntDesignChartsRenderer.tsx` | 审计/修复 | 5 |
| `src/components/ChartRenderer.tsx` | 审计/修复 | 5 |
| `src/components/MarkmapRenderer.tsx` | 审计/修复 | 5 |
