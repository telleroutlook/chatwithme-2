# ADC → ECharts 迁移计划

## 背景与动机

### 为什么迁移

ADC（Ant Design Charts / AntV G2）在项目中引发了两类系统性问题：

1. **`oklab` 崩溃**：ADC 内部颜色库（`@antv/color`）在初始化时调用 `getComputedStyle`，将拿到的 `color-mix(in oklab, ...)` 值（Tailwind v4 生成）自行解析，直接抛出 `Error: Attempting to parse an unsupported color function "oklab"`。这导致任何在非标准上下文（离屏容器、PDF 导出）中初始化 ADC 的操作都会崩溃，且无法通过 CSS 覆盖绕过（因为是 JS 层解析）。

2. **Canvas 渲染**：ADC 使用 `<canvas>` 渲染，`html2canvas` / `html-to-image` 无法读取 canvas 像素，导致 PDF 导出中图表内容空白。每次截图都需要特殊的像素读取逻辑。

### 为什么选择 ECharts

- 项目已有完整 ECharts 渲染器（`EChartsRenderer.tsx`），配置为 **SVG renderer**，截图天然可靠
- ECharts 提供 `chart.getDataURL()` 原生导出，PDF 导出路径简单、正确
- ECharts 覆盖 ADC 所有 12 种图表类型（见下方映射表），无功能损失
- 无 `oklab` 问题，无 Canvas 截图问题
- 移除 ADC 包后 vendor bundle 减小（`@ant-design/charts` ~2MB gzip 后约 400KB）

---

## ADC 图表类型 → ECharts 映射

| ADC type | ECharts 实现方式 | 复杂度 |
|---|---|---|
| `line` | `series: [{ type: 'line' }]` | 低 |
| `column` | `series: [{ type: 'bar' }]`（竖向，ECharts bar 默认竖向） | 低 |
| `bar` | `series: [{ type: 'bar' }]` + `yAxis` 为 category | 低 |
| `area` | `series: [{ type: 'line', areaStyle: {} }]` | 低 |
| `pie` | `series: [{ type: 'pie' }]` | 低 |
| `rose` | `series: [{ type: 'pie', roseType: 'area' }]` | 低 |
| `scatter` | `series: [{ type: 'scatter' }]` | 低 |
| `radar` | `series: [{ type: 'radar' }]` + `radar: { indicator: [] }` | 中 |
| `heatmap` | `series: [{ type: 'heatmap' }]` + `visualMap` | 中 |
| `funnel` | `series: [{ type: 'funnel' }]` | 低 |
| `histogram` | `series: [{ type: 'bar' }]` + 前端分箱 or `binField` → 分组数据 | 中 |
| `dualAxes` | `yAxis: [{}, {}]` + 两个 series 分别绑定 `yAxisIndex: 0/1` | 中 |

所有类型都有成熟的 ECharts 文档和示例，AI 知识库可直接覆盖。

---

## 涉及文件清单

### 删除

| 文件 | 说明 |
|---|---|
| `src/components/AntDesignChartsRenderer.tsx` | ADC 渲染器主文件（746 行） |
| `src/components/ChartEditorAdcPreview.tsx` | ADC 专用编辑器预览（124 行） |
| `src/utils/adcSpecParser.ts` | ADC spec 解析器（225 行） |
| `src/utils/adcSpecParser.test.ts` | 对应测试 |
| `knowledge-base/charts/adc.json` | ADC AI 知识库 |

### 修改

| 文件 | 修改内容 |
|---|---|
| `src/components/LazyChartRenderer.tsx` | 删除 ADC lazy import + 导出；删除 `parseAdcSpecFromCode`；删除 `LazyAntDesignChartsRenderer` |
| `src/components/MarkdownRenderer.tsx` | 删除 `adc`/`ant-design-charts`/`antd-charts` 分支，用 ECharts 分支解析新语言标记 `echarts`（ADC spec 迁移到 ECharts option 格式） |
| `src/components/DashboardRenderer.tsx` | 替换 ADC item 渲染为 ECharts；更新 `item.type` 从 `"adc"` 改为 `"echarts"` |
| `src/components/ChartToolbar.tsx` | 删除 `ChartEngine` 中的 `"adc"` 类型；删除 `CANVAS_ENGINES` set（ECharts 是 SVG） |
| `src/demos/chat/builtin-tools/data-analyzer.ts` | 所有 `engine: "adc"` 改为 `engine: "echarts"`；spec 格式从 ADC 改为 ECharts option |
| `src/demos/chat/builtin-tools/chart-template.ts` | 删除 `adc` engine 分支；将原 ADC 类型移入 ECharts 知识库条目 |
| `src/demos/chat/system-prompt.ts` | 删除 `adc` engine catalog 块；将 12 种图表类型并入 ECharts catalog；更新 data-to-chart workflow 说明 |
| `knowledge-base/charts/echarts.json` | 新增 12 种原 ADC 图表类型的 ECharts spec 示例（line/column/bar/area/pie/rose/scatter/radar/heatmap/funnel/histogram/dualAxes） |
| `package.json` | 移除 `@ant-design/charts` 依赖 |
| `src/utils/exporters/renderChatPdf.tsx` | 简化：删除 chart-stub/injectChartImages 机制；ECharts SVG 可被 html2canvas 直接捕获，无需特殊处理 |
| `src/components/MarkdownRenderer.tsx` | 删除 `exportMode` prop 和 `ExportModeContext`（不再需要）；删除 `chartExportKey` 函数；还原各图表 wrapper 的 `data-chart-export-key` 属性 |

---

## PDF 导出影响（迁移后）

这是迁移的核心收益之一。

**迁移前的问题链**：
```
ADC 初始化 → 读取 color-mix(oklab) computed style → 崩溃
html2canvas 捕获 → canvas 内容空白
→ 需要 exportMode + stub + injectChartImages 等复杂绕过机制
→ 截图时需临时切换 data-mode="light" → 用户可见闪烁
```

**迁移后的路径**：
```
ECharts SVG renderer → DOM 中是真实 SVG 节点
html2canvas 直接捕获 SVG → 内容完整
无需 exportMode / stub / injectChartImages
无需临时切换主题 → 零闪烁
PDF 导出整体可简化为单次 html2canvas 调用
```

**具体简化**：
- 删除 `ExportModeContext` 及相关 stub 逻辑
- 删除 `injectChartImages()` 函数
- 删除 `data-chart-export-key` 标记
- `renderChatPdf.tsx` 恢复为直接渲染 + 单次截图

唯一需要保留的：在 `onclone` 回调里注入 `LIGHT_OVERRIDE_CSS`（覆盖 CSS 变量为 hex），这确保 html2canvas 不会遇到 `color-mix` 解析问题（Tailwind 工具类的 CSS 仍然存在）。

---

## 新 ECharts 知识库结构

`knowledge-base/charts/echarts.json` 扩展后需覆盖 23 种类型（原 11 + 新增 12）：

**原有（特殊图表）**：sankey, tree, treemap, sunburst, candlestick, gauge, themeRiver, map, wordCloud, bar3D, scatter3D

**新增（原 ADC 通用图表）**：line, column（竖向 bar）, bar（横向 bar）, area, pie, rose, scatter, radar, heatmap, funnel, histogram, dualAxes

每个新增类型需提供：
- `type`: 类型名
- `use_when`: 使用场景（供 AI 选型）
- `spec`: 完整可运行的 ECharts option 示例（含 title/tooltip/legend/xAxis/yAxis/series）
- `outputContract`: 延用现有 ECharts outputContract

---

## 执行步骤

### Phase 1：知识库准备（不影响线上）

1. 编写 12 种新 ECharts spec 示例，扩展 `knowledge-base/charts/echarts.json`
2. 本地测试每种 spec 在 `EChartsRenderer` 中能正确渲染
3. 更新 `chart-template.ts`：将 ADC 类型移入 ECharts，删除 `adc` engine 处理

### Phase 2：渲染层替换

4. 修改 `MarkdownRenderer.tsx`：`adc` code block → 复用 ECharts 解析路径（code block 语言标记直接改为 `echarts`，AI 生成新格式）
5. 修改 `DashboardRenderer.tsx`：ADC item → ECharts item
6. 修改 `ChartToolbar.tsx`：删除 `"adc"` engine 类型
7. 删除 `AntDesignChartsRenderer.tsx`、`ChartEditorAdcPreview.tsx`、`adcSpecParser.ts`
8. 修改 `LazyChartRenderer.tsx`：删除 ADC 相关导出

### Phase 3：AI 引导层更新

9. 更新 `system-prompt.ts`：ECharts catalog 新增 12 种类型，删除 ADC block
10. 更新 `data-analyzer.ts`：所有推荐改为 ECharts spec 格式

### Phase 4：PDF 导出简化

11. 简化 `renderChatPdf.tsx`：删除 stub/inject 机制，恢复为直接渲染 + 单次 html2canvas
12. 简化 `MarkdownRenderer.tsx`：删除 `exportMode`/`ExportModeContext`/`chartExportKey`/`data-chart-export-key`

### Phase 5：清理

13. `package.json` 移除 `@ant-design/charts`
14. 运行 `npm run typecheck` + `npm run test:run`
15. 部署并回归验证所有图表类型

---

## 风险与注意事项

| 风险 | 措施 |
|---|---|
| 历史对话中已有 `adc` code block | 保留 `adc`/`ant-design-charts` 语言标记的解析，映射到 ECharts 渲染器（向后兼容层），但 spec 格式不同会导致渲染失败 → 显示为原始代码块，不崩溃 |
| `dashboard` 中已有 `type: "adc"` items | DashboardRenderer 保留 `"adc"` → ECharts 的 fallback 渲染，spec 字段映射失败时显示占位 |
| ECharts histogram 无原生分箱 | `data-analyzer.ts` 在输出 spec 前先做前端分箱（已有数据），直接输出分组后的 bar spec |
| ECharts dualAxes 需要 AI 理解双 yAxis | 知识库提供完整示例；在 spec 里明确注释 `yAxisIndex` 用法 |

---

## 迁移后架构图（图表引擎）

```
用户请求图表
    │
    ▼
AI 选型（system prompt catalog）
    │
    ├── echarts ──► EChartsRenderer (SVG)
    │                    │
    │                    ├── PDF: html2canvas 直接捕获 ✓
    │                    └── 截图: getDataURL() 原生支持 ✓
    │
    ├── mermaid ──► MermaidRenderer (SVG)
    ├── vega-lite ──► VegaLiteRenderer (SVG)
    ├── stat ──► StatCard
    ├── dashboard ──► DashboardRenderer (ECharts items)
    ├── markmap ──► MarkmapRenderer (SVG)
    └── excalidraw ──► ExcalidrawRenderer
```

所有主图表引擎均为 SVG，PDF 导出路径统一、无特殊处理。
