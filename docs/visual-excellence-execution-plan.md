# Visual Excellence Execution Plan

> 目标：将 ChatWithMe-2 打造为**图形化最美观、可视化内容最丰富**的 AI Agent 产品。

## 1. 现状审计

### 1.1 当前可视化能力

| 引擎 | 类型数 | 构建大小 (gzip) | 美观度 | 交互性 |
|------|--------|----------------|--------|--------|
| Ant Design Charts (ADC) | 12 | 158 KB | ★★★ 中等 | tooltip 仅悬浮 |
| @antv/g2 | 5 | 1.3 MB | ★★★ 中等 | tooltip + ResizeObserver |
| Mermaid | 19 种图类型 | 2.3 MB | ★★☆ 基础 | 无交互 |
| SVG Renderer | 通用 | 0 | ★★☆ 原始 | 无 |
| HTML Direct Renderer | 通用 | 0 | ★★★ 取决内容 | Shadow DOM 隔离 |
| Markdown 表格 | 基础 | 0 | ★★☆ 基础 | 无排序/筛选 |

### 1.2 已安装但未启用的能力

| 依赖 | 版本 | 状态 | 用途 |
|------|------|------|------|
| `html-to-image` | ^1.11.13 | ✅ 有 exporter 代码但未接入 UI | 图表导出 PNG/JPEG |
| `jspdf` | ^4.2.0 | ✅ 有 exporter 代码但未接入 UI | PDF 导出 |
| `html2canvas` | (jspdf peer) | ✅ 在 pdf.ts 中使用 | DOM→Canvas |

已存在文件：
- `src/utils/exporters/image.ts` — `exportToPng()`, `exportToJpeg()`, `exportSvgToPng()` — **未连接 UI**
- `src/utils/exporters/pdf.ts` — `exportToPdf()`, `exportPlainTextToPdf()` — **未连接 UI**

### 1.3 核心差距

| 维度 | 当前 | 业界标杆 (ChatGPT / Claude / v0) |
|------|------|----------------------------------|
| 图表覆盖 | 17 种数据图 + 19 种 Mermaid | 60+ 图表 (ECharts) + 地图 + 3D |
| 开箱美观 | 需手动主题调色 | 内置多套专业主题 |
| 图表交互 | 仅 tooltip | 缩放/筛选/刷选/导出/钻取 |
| 导出 | 代码已写但未连接 | 一键 PNG/SVG/PDF |
| 表格 | Markdown `<table>` | 可排序/筛选/分页交互式表格 |
| 非图表视觉 | 无 | KPI 卡片、Dashboard、信息图 |
| 编辑能力 | 无 | 点击图表可编辑 spec |
| 流式渲染 | 等完整输出 | 渐进式渲染 |

---

## 2. 引擎取舍决策

### 2.1 删除 @antv/g2 独立引擎

**理由：**
- G2 构建产物 **1.3 MB** (gzip ~400 KB) — 是最大的 vendor chunk
- 仅覆盖 5 种 mark 类型 (interval, line, area, point, cell)，全部被 ADC 和即将引入的 ECharts 完全覆盖
- ADC 本身基于 G2 底层 — 保留 ADC 即可保留 G2 的渲染能力
- 系统提示中 G2 独立 spec 格式增加了 AI 输出的不确定性（三选一 → 两选一更稳定）
- 删除后：减少 ~1.3 MB 构建体积，简化系统提示，减少前端代码

**删除清单：**
- [ ] `src/components/ChartRenderer.tsx` — 删除 `G2ChartRenderer` 组件及相关代码
- [ ] `src/components/LazyChartRenderer.tsx` — 删除 `LazyG2ChartRenderer` 及 `parseG2SpecFromCode` re-export
- [ ] `src/components/MarkdownRenderer.tsx` — 删除 `language === "g2"` 分支
- [ ] `src/utils/g2SpecParser.ts` — 整个文件删除
- [ ] `knowledge-base/charts/g2.json` — 整个文件删除
- [ ] `src/demos/chat/chart-knowledge.ts` — 删除 G2 相关 keyword map、filter、sort、prompt builder
- [ ] `src/demos/chat/system-prompt.ts` — 删除 G2 section 引用
- [ ] `src/types/chart-kb.ts` — 删除 `G2ChartRule`, `G2Knowledge` 类型
- [ ] `package.json` — 移除 `@antv/g2` 依赖
- [ ] 所有 G2 相关测试文件

**保留：** ADC（基于 G2 底层，无需独立 G2）+ Mermaid + 即将引入的 ECharts

### 2.2 保留 Mermaid（不可替代）

Mermaid 覆盖了 **结构性图表**（流程图、时序图、ER 图、状态图、类图、甘特图、思维导图等），这些是 ADC/ECharts 无法替代的。虽然 2.3 MB 体积较大，但已做 lazy loading，且无替代方案能覆盖相同广度。

### 2.3 保留 ADC（轻量高效）

ADC 仅 158 KB (gzip)，覆盖 12 种数据图表，且 React 组件化集成良好。继续作为**默认数据图表引擎**。

### 2.4 新增 ECharts（高级图表引擎）

ECharts 补充 ADC 不支持的高级图表：地图、3D、桑基图、树图、旭日图、词云、K 线图等。作为**高级可视化引擎**引入。

---

## 3. 执行阶段

### Phase 1：基础体验补全（第 1-2 周）

> 目标：补齐最基本的功能缺失，立即提升产品完成度。

#### 1.1 图表导出工具栏

**为什么最优先：** 导出代码已写好（`src/utils/exporters/image.ts`、`pdf.ts`），只需连接 UI。

**新增文件：**
- `src/components/ChartToolbar.tsx` — 悬浮工具栏组件

**工具栏功能：**
```
┌─────────────────────────────────┐
│ 📸 PNG  📐 SVG  📄 PDF  📋 JSON │  ← 悬浮在图表右上角
└─────────────────────────────────┘
```

| 按钮 | 实现 | 依赖 |
|------|------|------|
| PNG | `exportToPng(chartRef)` | html-to-image (已安装) |
| SVG | Mermaid: 直接序列化; ADC/ECharts: `toDataURL('svg')` | 无新依赖 |
| PDF | `exportToPdf(chartRef)` | jspdf (已安装) |
| JSON/CSV | 序列化 chart spec 或 data 数组 | 无新依赖 |

**修改文件：**
- `src/components/ChartRenderer.tsx` — MermaidRenderer 添加 `ref` + `<ChartToolbar>`
- `src/components/AntDesignChartsRenderer.tsx` — 同上
- 未来 EChartsRenderer 同样挂载

**实现要点：**
- 工具栏默认隐藏，鼠标悬浮图表区域时 fade-in 显示
- 导出时自动使用 light 主题背景（避免暗色模式下导出的图表背景透明）
- PNG 默认 2x 像素比（Retina 清晰度）
- 文件名格式：`chart-{type}-{timestamp}.png`

#### 1.2 交互式数据表格

**为什么优先：** AI 返回的数据经常包含表格，当前 Markdown 表格不能排序/筛选。

**新增依赖：**
```
@tanstack/react-table: ^8.x  (~15 KB gzip)
```

**新增文件：**
- `src/components/InteractiveTable.tsx` — 交互式表格组件

**功能：**
- 列排序（点击表头切换 asc/desc/none）
- 文本搜索（全局过滤）
- 数字列自动右对齐 + 千分位格式化
- 行高亮 + 斑马纹
- 分页（>20 行时自动启用）
- 暗色/亮色主题适配
- 一键「转为图表」按钮（将表格数据 → ADC spec → 图表渲染）

**集成方式：**
在 `MarkdownRenderer.tsx` 的 `table` 组件中，检测表格行数：
- ≤ 3 行：保持原 Markdown 表格（简洁）
- \> 3 行：升级为 `<InteractiveTable>` 组件

**修改文件：**
- `src/components/MarkdownRenderer.tsx` — `table/thead/tbody/tr/td` 组件替换逻辑

#### 1.3 KPI 统计卡片

**为什么优先：** AI 回答数据问题时只有文字，缺少视觉层级感。

**新增文件：**
- `src/components/StatCard.tsx` — KPI 卡片组件
- `src/utils/statCardParser.ts` — 解析 `stat` 代码块

**代码块格式：**
````
```stat
[
  {"title": "月活用户", "value": "12.5M", "change": "+23.5%", "trend": "up"},
  {"title": "日均收入", "value": "$156K", "change": "-2.1%", "trend": "down"},
  {"title": "转化率", "value": "3.8%", "change": "+0.5%", "trend": "up"}
]
```
````

**渲染效果：**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  月活用户     │ │  日均收入     │ │  转化率       │
│  12.5M  ↑23% │ │  $156K  ↓2%  │ │  3.8%   ↑0.5% │
│  ▁▂▃▄▅▆▇     │ │  ▇▆▅▄▃▂▁     │ │  ▁▂▃▄▅▆▇     │
└──────────────┘ └──────────────┘ └──────────────┘
```

**修改文件：**
- `src/components/MarkdownRenderer.tsx` — 添加 `language === "stat"` 分支
- `src/components/LazyChartRenderer.tsx` — 添加 LazyStatCardRenderer
- `knowledge-base/charts/adc.json` — 无变化
- `src/demos/chat/system-prompt.ts` — 添加 stat 代码块说明

#### 1.4 删除 G2 独立引擎

按 §2.1 的清单执行删除。

**验证：**
- `npm run typecheck` 通过
- `npm run test:run` 通过
- `npx vite build` — vendor-g2 chunk 消失，总构建减小 ~1.3 MB
- 生产环境验证 ADC 图表仍正常

---

### Phase 2：ECharts 引擎集成（第 3-4 周）

> 目标：引入高级图表引擎，覆盖地图、3D、桑基图等 ADC 不支持的类型。

#### 2.1 ECharts 基础集成

**新增依赖：**
```
echarts: ^6.0.x  (~300 KB gzip, lazy load)
```

**新增文件：**
- `src/components/EChartsRenderer.tsx` — 渲染器组件
- `src/utils/ecSpecParser.ts` — ECharts spec 解析器
- `knowledge-base/charts/echarts.json` — ECharts 知识库

**语言标签：** ` ```echarts `

**ECharts spec 格式（AI 生成）：**
```json
{
  "title": {"text": "Monthly Revenue", "subtext": "2024"},
  "tooltip": {"trigger": "axis"},
  "xAxis": {"type": "category", "data": ["Jan","Feb","Mar"]},
  "yAxis": {"type": "value"},
  "series": [{"name": "Revenue", "type": "bar", "data": [120,180,150]}]
}
```

**渲染器实现要点：**
- `echarts.init(container, theme)` — 使用内置 `dark` 主题
- `chart.setOption(spec)` — JSON spec 直接透传
- `ResizeObserver` 自动 `chart.resize()`
- 导出: `chart.getDataURL()` (原生 PNG/SVG)
- Lazy loading: `lazy(() => import("echarts"))` + Suspense

**主题策略：**
- 亮色模式: ECharts 内置 `"light"` 或自定义主题
- 暗色模式: ECharts 内置 `"dark"` — 开箱即用比 ADC 暗色好看很多
- 统一调色板: 与 `chartThemeTokens.ts` 的 `paletteCategorical` 保持一致

#### 2.2 ECharts 知识库

**覆盖图表类型（按优先级）：**

| 类型 | ECharts type | 为什么需要 |
|------|-------------|-----------|
| 地图 (中国/世界) | `map` + geo | 地理数据可视化，ADC 不支持 |
| 桑基图 | `sankey` | 流向可视化（比 Mermaid sankey-beta 美观 10x） |
| 树图 | `tree` | 组织架构、层级数据 |
| 矩形树图 | `treemap` | 磁盘占用、市值构成 |
| 旭日图 | `sunburst` | 多层占比（比饼图信息更丰富） |
| 词云 | `wordCloud` (扩展) | 文本分析 |
| K 线图 | `candlestick` | 金融数据 |
| 水球图 | `liquidFill` (扩展) | 进度/完成率 |
| 3D 柱状图 | `bar3D` (扩展) | 三维数据 |
| 3D 散点图 | `scatter3D` (扩展) | 三维数据 |
| 地球 | `globe` (扩展) | 全球数据可视化 |
| 仪表盘(高级) | `gauge` | 比 ADC gauge 更美观 |
| 河流图 | `themeRiver` | 趋势变化 |

**地图数据策略：**
- 中国地图: `echarts/map/json/china.json` (按需加载)
- 世界地图: `echarts/map/json/world.json` (按需加载)
- 不打包到主 bundle — 通过 `registerMap()` 动态加载

#### 2.3 系统提示更新

**图表引擎选择策略：**
```
用户请求 → 关键词检测 → 选择引擎：
  地图/桑基/树图/旭日/词云/K线/3D → ECharts
  折线/柱状/饼图/散点/雷达/双轴   → ADC (默认)
  流程图/时序/ER/状态/甘特/思维导图 → Mermaid
  KPI/指标卡                      → stat 代码块
```

**修改文件：**
- `src/demos/chat/chart-knowledge.ts` — 添加 ECharts keyword map + filter + prompt builder
- `src/demos/chat/system-prompt.ts` — 添加 ECharts section，更新引擎选择说明
- `src/types/chart-kb.ts` — 添加 `EChartsChartRule`, `EChartsKnowledge` 类型

#### 2.4 验证清单

- [ ] `npm run typecheck` 通过
- [ ] `npm run test:run` 通过
- [ ] 构建大小: ECharts chunk 应 ≤ 400 KB (gzip)，且为独立 lazy chunk
- [ ] 生产环境测试: 发送 "画一个中国地图展示各省GDP" → 返回 ` ```echarts` 代码块，渲染正确
- [ ] 生产环境测试: 发送 "画一个桑基图展示网站流量来源" → 渲染正确
- [ ] ADC 图表不受影响

---

### Phase 3：图表编辑与交互增强（第 5-6 周）

> 目标：从「只读图表」升级为「可编辑、可交互的图表」。

#### 3.1 图表编辑面板

**新增依赖：**
```
@codemirror/lang-json: ^6.x  (~40 KB gzip)
codemirror: ^6.x
@codemirror/view: ^6.x
@codemirror/state: ^6.x
```

**新增文件：**
- `src/components/ChartEditor.tsx` — 编辑面板组件

**交互流程：**
```
用户点击图表 "编辑" 按钮
  → 展开编辑抽屉 (右侧滑出)
  → 左侧: CodeMirror JSON 编辑器 (显示当前 spec)
  → 右侧: 实时预览 (每次编辑后 300ms debounce 重渲染)
  → 底部: "应用" / "重置" / "让 AI 优化" 按钮
```

**快捷操作面板（非代码编辑）：**
- 标题修改（文本输入）
- 调色板切换（预设 6 套配色方案）
- 图表类型切换（如 column ↔ bar ↔ line）
- 数据排序方向 (asc/desc)

**修改文件：**
- `src/components/ChartToolbar.tsx` — 添加 "编辑" 按钮
- `src/components/AntDesignChartsRenderer.tsx` — 传递 spec 到编辑器
- `src/components/EChartsRenderer.tsx` — 同上

#### 3.2 图表交互增强

**ADC 增强：**
- 添加 `interaction: { elementHighlight: true }` — 高亮悬浮元素
- 柱状图/折线图添加 brush 刷选交互

**ECharts 增强（原生支持）：**
- `toolbox`: 内置工具栏 (缩放、还原、保存、数据视图)
- `dataZoom`: 区域缩放（时间序列数据特别有用）
- `brush`: 框选/圈选
- `timeline`: 时间轴播放（动态数据演示）

**Mermaid 增强：**
- 缩放/平移 — SVG 容器添加 `transform` + 鼠标/触摸事件
- 节点点击高亮 — SVG 节点添加 hover/active 样式

**修改文件：**
- `src/components/ChartRenderer.tsx` — Mermaid 缩放/平移
- `src/components/AntDesignChartsRenderer.tsx` — interaction 配置增强
- `src/components/EChartsRenderer.tsx` — toolbox + dataZoom 默认启用

#### 3.3 图表动画升级

**ADC:**
- 入场动画: 逐项渐显（柱状图从底部生长、折线图从左到右绘制）
- 使用 ADC 2.x 的 `animate` 配置

**ECharts:**
- 内置 `animationDuration`, `animationEasing` — 默认启用
- `universalTransition: true` — 切换图表类型时数据 morph 动画

**Mermaid:**
- SVG 路径动画: 边线流动效果（CSS `stroke-dasharray` + `@keyframes`）
- 节点入场动画: `opacity` + `transform` 渐显

**通用:**
- `IntersectionObserver` — 图表进入视口时才播放入场动画（避免页面加载时所有图表同时动画）

---

### Phase 4：高级内容类型（第 7-9 周）

> 目标：超越图表，提供 Dashboard、信息图等复合视觉内容。

#### 4.1 Dashboard 布局

**代码块格式：** ` ```dashboard `

```json
{
  "title": "Sales Dashboard",
  "layout": "2x2",
  "items": [
    {"type": "stat", "data": {"title": "Revenue", "value": "$1.2M", "change": "+15%"}},
    {"type": "stat", "data": {"title": "Users", "value": "45.2K", "change": "+8%"}},
    {"type": "adc", "data": {"type": "line", "data": [...], "xField": "month", "yField": "value"}},
    {"type": "adc", "data": {"type": "pie", "data": [...], "angleField": "value", "colorField": "category"}}
  ]
}
```

**渲染效果：**
```
┌─────────────────┬─────────────────┐
│  Revenue $1.2M  │  Users 45.2K    │
│  ↑ +15%         │  ↑ +8%          │
├─────────────────┼─────────────────┤
│                 │                 │
│  [Line Chart]   │  [Pie Chart]    │
│                 │                 │
└─────────────────┴─────────────────┘
```

**新增文件：**
- `src/components/DashboardRenderer.tsx`
- `src/utils/dashboardParser.ts`

**响应式：**
- 桌面: 按 layout 字段排列 (2x2, 3x1, 1x3 等)
- 移动端: 自动堆叠为单列

#### 4.2 Excalidraw 手绘风图表

**新增依赖：**
```
@excalidraw/excalidraw: ^0.17.x  (~200 KB gzip, lazy load)
```

**语言标签：** ` ```excalidraw `

**优势：**
- 手绘风格是 2025 年最流行的图表审美
- 用户可编辑 — 拖拽节点、调整箭头、添加注释
- 适合: 架构草图、白板头脑风暴、非正式流程图

**新增文件：**
- `src/components/ExcalidrawRenderer.tsx`
- `src/utils/excalidrawParser.ts`

**AI 生成格式：** Excalidraw JSON elements（AI 生成节点 + 箭头的坐标和文字）

#### 4.3 交互式思维导图 (markmap)

**新增依赖：**
```
markmap-view: ^0.17.x  (~30 KB gzip)
markmap-lib: ^0.17.x
```

**方案：** 当检测到 Mermaid `mindmap` 类型时，优先使用 markmap 渲染（可折叠/展开/缩放），降级到 Mermaid 静态渲染。

**新增文件：**
- `src/components/MarkmapRenderer.tsx`

#### 4.4 流式图表渲染

**当前问题：** AI 输出长回复时，图表代码块必须等完整输出后才渲染。用户等待 5-15 秒看到空白。

**方案：**
1. 检测到 ` ```adc ` / ` ```echarts ` 起始标记 → 立即显示**类型感知骨架屏**
   - 折线图骨架: 波浪线 + 坐标轴
   - 饼图骨架: 圆形 + 扇区
   - 柱状图骨架: 矩形条 + 坐标轴
2. JSON 部分可用时: `JSON.parse` 尝试解析部分数据 → 先渲染坐标轴 + 图例 → 数据点逐步填充
3. 代码块关闭 ` ``` ` 时: 完整渲染

**修改文件：**
- `src/components/MarkdownRenderer.tsx` — streaming 状态下的图表代码块处理
- `src/components/skeletons/MessageSkeleton.tsx` — 类型感知骨架屏

---

### Phase 5：前沿能力（第 10-12 周）

> 目标：探索性功能，建立竞争壁垒。

#### 5.1 React 组件沙盒

**参考：** Claude Artifacts 的核心功能 — 允许 AI 生成任意 React 组件。

**语言标签：** ` ```react `

**实现架构：**
```
AI 输出 React 代码 → 安全沙盒 iframe 渲染
                     ├─ sandbox="allow-scripts" (无 allow-same-origin)
                     ├─ CSP: script-src 'unsafe-inline' 'unsafe-eval'
                     ├─ 预注入: React, Tailwind CSS, Recharts, Lucide Icons
                     └─ postMessage 通信 (高度自适应)
```

**新增依赖：**
```
@codesandbox/sandpack-react: ^2.x  (~50 KB gzip) — 或自建 iframe 沙盒
```

**新增文件：**
- `src/components/ReactSandbox.tsx`
- `src/components/SandboxPreview.tsx`

#### 5.2 多模态输入 → 自动图表

**功能：**
- 用户上传 CSV/Excel → AI 自动分析数据类型 → 推荐图表类型 → 生成
- 用户上传截图 → OCR 识别表格 → 重建为交互式图表

**新增 Tool：**
- `analyze_data` — 接收用户上传数据，返回数据概要 + 推荐图表类型

**修改文件：**
- `src/demos/chat/builtin-tools/` — 添加 data-analyzer tool
- 前端: 文件上传 UI 增强

#### 5.3 Vega-Lite 声明式图表

**新增依赖：**
```
vega-lite: ^5.x
vega-embed: ^6.x  (~120 KB gzip)
```

**语言标签：** ` ```vega-lite `

**为什么：** Vega-Lite 是学术界和 AI 领域最广泛使用的声明式可视化 spec。AI 生成 Vega-Lite 的准确率通常高于手动组装各库 config。

**新增文件：**
- `src/components/VegaLiteRenderer.tsx`
- `src/utils/vegaLiteParser.ts`
- `knowledge-base/charts/vega-lite.json`

---

## 4. 文件变更总览

### 删除文件

| 文件 | 阶段 | 理由 |
|------|------|------|
| `src/utils/g2SpecParser.ts` | Phase 1 | G2 引擎删除 |
| `src/utils/g2SpecParser.test.ts` (如存在) | Phase 1 | G2 引擎删除 |
| `knowledge-base/charts/g2.json` | Phase 1 | G2 引擎删除 |
| `src/components/ChartRenderer.test.ts` 中 G2 测试 | Phase 1 | G2 引擎删除 |

### 新增文件

| 文件 | 阶段 | 用途 |
|------|------|------|
| `src/components/ChartToolbar.tsx` | Phase 1 | 导出工具栏 |
| `src/components/InteractiveTable.tsx` | Phase 1 | 交互式表格 |
| `src/components/StatCard.tsx` | Phase 1 | KPI 卡片 |
| `src/utils/statCardParser.ts` | Phase 1 | stat 代码块解析 |
| `src/components/EChartsRenderer.tsx` | Phase 2 | ECharts 渲染器 |
| `src/utils/ecSpecParser.ts` | Phase 2 | ECharts spec 解析 |
| `knowledge-base/charts/echarts.json` | Phase 2 | ECharts 知识库 |
| `src/components/ChartEditor.tsx` | Phase 3 | 图表编辑面板 |
| `src/components/DashboardRenderer.tsx` | Phase 4 | Dashboard 布局 |
| `src/utils/dashboardParser.ts` | Phase 4 | Dashboard 解析 |
| `src/components/ExcalidrawRenderer.tsx` | Phase 4 | 手绘风图表 |
| `src/components/MarkmapRenderer.tsx` | Phase 4 | 交互式思维导图 |
| `src/components/ReactSandbox.tsx` | Phase 5 | React 沙盒 |
| `src/components/VegaLiteRenderer.tsx` | Phase 5 | Vega-Lite 渲染 |

### 修改文件

| 文件 | 阶段 | 变更内容 |
|------|------|---------|
| `src/components/MarkdownRenderer.tsx` | Phase 1-5 | 添加各种语言标签路由 |
| `src/components/LazyChartRenderer.tsx` | Phase 1-5 | 添加各 lazy 渲染器 |
| `src/components/ChartRenderer.tsx` | Phase 1,3 | 删除 G2; Mermaid 动画/缩放 |
| `src/components/AntDesignChartsRenderer.tsx` | Phase 1,3 | 工具栏 + 编辑 + 动画 |
| `src/components/chartThemeTokens.ts` | Phase 2 | ECharts 主题 token |
| `src/components/chartVisualPreset.ts` | Phase 2 | ECharts preset |
| `src/demos/chat/chart-knowledge.ts` | Phase 1,2 | 删 G2, 加 ECharts |
| `src/demos/chat/system-prompt.ts` | Phase 1,2,4 | 更新引擎说明 |
| `src/types/chart-kb.ts` | Phase 1,2 | 删 G2, 加 ECharts 类型 |
| `package.json` | Phase 1-5 | 依赖增删 |

---

## 5. 依赖变更汇总

### 删除

| 包名 | 当前大小 (node_modules) | 构建大小 (gzip) |
|------|----------------------|----------------|
| `@antv/g2` | 17 MB | ~400 KB |

### 新增

| 包名 | 版本 | 构建大小 (gzip) | 阶段 | 加载方式 |
|------|------|----------------|------|---------|
| `@tanstack/react-table` | ^8.x | ~15 KB | Phase 1 | 静态 |
| `echarts` | ^5.5.x | ~300 KB | Phase 2 | Lazy |
| `@codemirror/lang-json` | ^6.x | ~40 KB | Phase 3 | Lazy |
| `@excalidraw/excalidraw` | ^0.17.x | ~200 KB | Phase 4 | Lazy |
| `markmap-view` + `markmap-lib` | ^0.17.x | ~30 KB | Phase 4 | Lazy |
| `@codesandbox/sandpack-react` | ^2.x | ~50 KB | Phase 5 | Lazy |
| `vega-lite` + `vega-embed` | ^5.x / ^6.x | ~120 KB | Phase 5 | Lazy |

**净构建大小变化估算：**
- 删除 G2: -400 KB
- Phase 1 新增: +15 KB (TanStack Table)
- Phase 2 新增: +300 KB (ECharts, lazy)
- Phase 3 新增: +40 KB (CodeMirror, lazy)
- Phase 4 新增: +230 KB (Excalidraw + markmap, lazy)
- Phase 5 新增: +170 KB (Sandpack + Vega-Lite, lazy)

所有 Phase 2+ 的新增都使用 lazy loading，不影响首屏加载。

---

## 6. 最终引擎矩阵

### 阶段完成后的可视化能力

| 引擎 | 定位 | 覆盖范围 | 触发方式 |
|------|------|---------|---------|
| **ADC** | 默认数据图表 | 折线/柱状/条形/面积/饼图/散点/雷达/仪表盘/热力/漏斗/直方/双轴 | ` ```adc ` |
| **ECharts** | 高级可视化 | 地图/桑基/树图/旭日/词云/K线/3D/水球/地球/河流 | ` ```echarts ` |
| **Mermaid** | 结构性图表 | 流程图/时序/ER/状态/类图/甘特/思维导图/Git/看板/等 19 种 | ` ```mermaid ` |
| **Vega-Lite** | 声明式智能图表 | 自动推断类型, 内置交互 | ` ```vega-lite ` |
| **Excalidraw** | 手绘风/可编辑 | 架构草图/白板/非正式图 | ` ```excalidraw ` |
| **StatCard** | KPI 指标 | 数字指标 + 趋势 + 迷你图 | ` ```stat ` |
| **Dashboard** | 复合布局 | KPI + 图表 + 表格组合 | ` ```dashboard ` |
| **React Sandbox** | 任意组件 | 完整 React 渲染 | ` ```react ` |
| **InteractiveTable** | 数据表格 | 排序/筛选/分页 | Markdown 表格自动升级 |

### 引擎选择策略（系统提示）

```
用户请求分析：
  ┌─ 地图/桑基/树图/旭日/词云/K线/3D → ECharts
  ├─ 折线/柱状/饼图/散点/雷达/双轴     → ADC (默认)
  ├─ 流程图/时序/ER/状态/甘特          → Mermaid
  ├─ KPI/指标/数字概览                → stat 代码块
  ├─ 多图组合/仪表盘                  → dashboard 代码块
  ├─ 架构草图/白板                    → Excalidraw
  └─ 通用声明式图表                   → Vega-Lite
```

---

## 7. 验收标准

### Phase 1 完成标准
- [ ] 每个图表容器有导出工具栏，PNG/SVG/PDF 导出正常
- [ ] Markdown 表格 (>3行) 自动升级为可排序/筛选表格
- [ ] `stat` 代码块渲染为 KPI 卡片
- [ ] G2 引擎完全移除，构建大小减少 ~400 KB
- [ ] 全部现有测试通过 + 新增测试覆盖新组件
- [ ] 生产环境部署 + 验证

### Phase 2 完成标准
- [ ] `echarts` 代码块渲染正常（至少覆盖：柱状/折线/饼图/地图/桑基/树图）
- [ ] ECharts 暗色/亮色主题正确切换
- [ ] 中文关键词 "地图"/"桑基"/"树图" 等正确触发 ECharts
- [ ] 构建大小: ECharts lazy chunk ≤ 400 KB (gzip)
- [ ] 生产环境 10 种图表类型测试通过

### Phase 3 完成标准
- [ ] 每个图表可点击"编辑"打开编辑面板
- [ ] JSON 编辑 → 实时预览 (300ms debounce)
- [ ] ECharts 内置 toolbox (缩放/还原/导出) 可用
- [ ] Mermaid SVG 可缩放/平移
- [ ] 图表入场动画在视口内触发

### Phase 4 完成标准
- [ ] Dashboard 代码块渲染 2x2 网格布局
- [ ] Excalidraw 渲染 + 用户可编辑节点
- [ ] 思维导图可折叠/展开/缩放
- [ ] 流式渲染: 图表骨架屏在代码块开始时显示

### Phase 5 完成标准
- [ ] React 沙盒安全运行用户代码
- [ ] Vega-Lite spec 正确渲染
- [ ] CSV 上传 → 自动生成图表

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| ECharts 包体过大 | 首屏变慢 | 严格 lazy load + 按需 import (`echarts/core` + 按需注册) |
| AI 生成 ECharts spec 不稳定 | 图表渲染失败 | 容错解析器 + 详细知识库 + 回退到 ADC |
| Excalidraw 包体大 (200KB) | 总构建增大 | Lazy load, 仅手绘风请求时加载 |
| CodeMirror 编辑器在移动端体验差 | 移动端不可用 | 移动端隐藏编辑按钮, 仅展示查看 |
| 删除 G2 后某些现有对话引用 G2 | 旧 spec 失效 | MarkdownRenderer 中 `language === "g2"` 回退为代码块展示 |
| 地图 JSON 文件体积 | 加载慢 | CDN 托管 + 首次加载提示 |

---

## 9. 里程碑时间线

```
Week 1-2:  Phase 1 — 导出工具栏 + 交互表格 + KPI卡片 + 删除G2
Week 3-4:  Phase 2 — ECharts 集成 + 知识库 + 系统提示
Week 5-6:  Phase 3 — 图表编辑 + 交互增强 + 动画
Week 7-9:  Phase 4 — Dashboard + Excalidraw + markmap + 流式渲染
Week 10-12: Phase 5 — React 沙盒 + Vega-Lite + 多模态输入
```

每个 Phase 结束时进行生产环境部署 + 验证，确保增量交付。

---

## 10. 技术调研补充发现（2025-2026 最新）

以下信息来自 2026 年 3 月最新调研，可能影响技术选型：

### 10.1 @antv/gpt-vis — AI 原生图表库

**版本:** v0.6.0 (v1.0 预计 2026 年 3 月)
**GitHub:** 676 stars，活跃开发中
**意义:** 与本项目已有的 AntV 生态同源

**核心特性：**
- 专为 LLM 输出设计的 Markdown-like 图表语法
- **流式渲染** — token 级别的增量渲染，AI 输出过程中即可展示部分图表
- **容错解析** — 处理不完整/格式错误的数据（AI 生成的常见问题）
- 20+ 图表类型，含思维导图、网络图、表格
- 框架无关：原生 JS / React / Vue / Angular
- 知识库含 28+ 图表类型指南（200+ 场景评估，90%+ 准确率）

**评估建议:** 如果 v1.0 在 Phase 2 期间稳定发布，可考虑替代部分 ECharts 使用场景。特别是其流式渲染能力可以提前解决 Phase 4 的流式渲染需求。

### 10.2 @antv/mcp-server-chart — MCP 图表服务

**版本:** v0.9.10
**GitHub:** 3,842 stars
**意义:** 提供 26+ 图表工具的 MCP 服务器，可直接被 AI 助手调用

**覆盖图表类型（26+）：**
比较类（柱状、条形、双轴）、趋势类（折线、面积）、分布类（箱线图、直方图、小提琴图）、层级类（矩形树图、组织架构、思维导图）、地理类（区域地图、标记地图、路径地图）、网络图、桑基图、词云等。

**评估建议:** 本项目已有 MCP 基础设施。可在 Phase 2 期间评估是否通过 MCP 工具路径（而非代码块）来生成 ECharts 图表，从而获得更高的图表准确率。

### 10.3 ECharts v6.0.0（2025 年 7 月发布）

相比计划中引用的 v5.5，ECharts 6.0 新增：
- **全新默认主题** — 重新设计的图例位置和视觉风格
- **Chord 系列** — 关系可视化（弦图）
- **Matrix 坐标系** — 声明式网格布局
- **运行时动态主题切换** — 无需重建图表
- 散点图抖动（jittering）防重叠
- 坐标轴中断（axis break）

**建议:** Phase 2 直接使用 ECharts v6.0.0 而非 v5.5。

### 10.4 其他值得关注的库

| 库 | 版本 | 价值 |
|---|------|------|
| **Nivo** v0.99 | 13,996 stars | react-spring 物理动画，开箱即用最美观的 React 图表 |
| **React Flow** v12.10 | 35,717 stars, 3.24M 周下载 | 节点式流程图编辑器，Stripe/Zapier 在用 |
| **TLDraw** v4.5 | 45,943 stars | 无限画布 SDK，可作为 AI 白板 |
| **Excalidraw** v0.18 | **119,151 stars** | 手绘风，支持 mermaid-to-excalidraw 转换 |
| **D2 Language** | 23,247 stars | 现代文本→图表语言（但需 Go 后端） |
| **@excalidraw/mermaid-to-excalidraw** v2.1.1 | — | Mermaid 语法 → Excalidraw 手绘风转换 |

### 10.5 行业趋势总结

1. **AI 原生图表** 正在成为独立赛道（gpt-vis, mcp-server-chart, Plotly Studio）
2. **手绘风** 持续流行 — Excalidraw 119K stars 远超传统图表库
3. **声明式 JSON spec** 是 AI 生成图表的最可靠路径（Vega-Lite, ECharts option）
4. **流式渐进渲染** 是 AI 图表的关键差异化体验
5. **可编辑性** 成为标配 — 用户期望 AI 生成后可以微调（Artifacts 模式）
6. **MCP 协议** 正在成为 AI Agent 集成可视化工具的标准通道
