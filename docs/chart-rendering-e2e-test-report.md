# 图表渲染全量 E2E 测试报告 (2026-03-04)

## 1. 测试概览
本次测试对 ChatWithMe 生产环境（Workers）进行了深度、全量的图表渲染验证。采用**串行测试流程**，确保每种图表引擎的各种子类型都得到了独立验证。

**测试环境**:
- **URL**: `https://chatwithme2mcp.lintao-mailbox.workers.dev`
- **模式**: Dark Mode (强制暗色模式)

---

## 2. 详细测试矩阵 (Serial Execution)

| 图表引擎 | 图表类型 | 状态 | 关键发现 |
| :--- | :--- | :--- | :--- |
| **Mermaid** | Flowchart | ✅ 通过 | 节点、线条、主题适配完美。 |
| **Mermaid** | Sequence | ✅ 通过 | 参与者声明、循环块、备注渲染正确。 |
| **Mermaid** | Gantt | ✅ 通过 | 时间轴、任务进度条显示正常。 |
| **Mermaid** | Mindmap | ✅ 通过 | 分支层级、根节点形状渲染无误。 |
| **Mermaid** | Pie | ✅ 通过 | 占比计算、图例显示正确。 |
| **G2 (v5)** | Line | ⚠️ 部分通过 | 功能正常，但暗色模式下对比度极低（近乎不可见）。 |
| **G2 (v5)** | Interval (Bar) | ⚠️ 部分通过 | 柱体颜色在暗色背景下辨识度有待提高。 |
| **G2 (v5)** | Area | ⚠️ 部分通过 | 填充透明度 (`fillOpacity`) 在暗色模式下显示良好，但坐标轴暗淡。 |
| **ADC (v2)** | Pie | ✅ 通过 | 简单配置下渲染正常。 |
| **ADC (v2)** | Column | ❌ 失败 (语法敏感) | 配置 `label: { position: "middle" }` 会触发 `Unknown position` 错误。 |
| **SVG** | Basic Shapes | ✅ 通过 | Circle, Stroke, Fill 属性解析并作为 Data URL <img> 正确展示。 |

### 3.4 复合 Mermaid 渲染 (Simultaneous Rendering)
- **测试案例**: 在单条消息中同时渲染 3-5 个不同类型的 Mermaid 图表。
- **状态**: ✅ 通过
- **分析**: 
  - 前端渲染器能够并行触发多个 Mermaid 渲染任务。
  - 即使是复杂的组合消息，系统也能确保每个 `mermaid-container` 独立加载并正确显示其专属的 SVG。
  - 这种并发处理能力保证了在长文档或复杂分析报告中的图表展示稳定性。

---

## 4. 核心问题分析 (Root Cause Analysis)

### 3.1 ADC v2 语法兼容性 (Critical)
- **现象**: 发送包含 `label: { position: "middle" }` 的 ADC `column` 配置时，控制台报错并导致组件崩溃（渲染空白）。
- **分析**: Ant Design Charts v2 基于 G2 v5，其配置项相比 v1 有显著变化。`position` 属性的值在不同 Mark 类型下受到了更严格的校验，或该版本已弃用某些字符串值。
- **影响**: AI 如果生成过时的 ADC 配置，会导致前端直接崩溃。

### 3.2 G2/ADC 暗色模式对比度失效
- **现象**: 虽然渲染引擎输出了正确的图形（Canvas 像素校验通过），但在暗色背景下，默认的灰度坐标轴和深色线条几乎无法辨认。
- **分析**: 前端虽然检测到了 `isDark` 状态，但传递给 G2 的 `themeColors` (如 `axisTitleFill: '#a0a0a0'`) 在背景色为 `kumo-base` 的极暗环境下对比度依然不足。

### 3.3 动画加载延迟
- **现象**: `animate-fade-in` 动画在流式传输结束后才开始，存在约 300ms 的视觉延迟。
- **影响**: 在自动化测试或快速滚动时，可能捕获到半透明或正在淡入的图表，影响截图断言。

---

## 4. 改进方案建议 (Action Plan)

### 4.1 修复 ADC 崩溃风险
- **前端拦截**: 在 `parseAdcSpecFromCode` 之前增加一层 Zod 校验或清洗逻辑，剔除已知的非法配置项。
- **AI Prompt 优化**: 在系统提示词（System Prompt）中明确 ADC v2 的规范，禁止使用不可靠的 `label.position` 值。

### 4.2 视觉增强
- **对比度注入**: 重新设计暗色模式下的图表主题。建议将 `axisLabelFill` 提升至 `#cccccc`，并将坐标轴线 `axisLineStroke` 提升至 `#666666`。
- **动态调色盘**: 针对 G2 引入一套专门针对暗色背景的高饱和度调色盘。

### 4.3 渲染稳定性
- **取消淡入动画**: 对于图表渲染，建议取消透明度动画，改用即时渲染以减少视觉跳动和测试不确定性。
- **错误降级**: 当 ADC 或 G2 渲染抛出异常时，应回退（Fallback）显示原始 JSON 代码块，并提供 "Invalid Spec" 的友好提示，而不是显示空白。

---
**报告人**: Gemini CLI
**状态**: 全量测试完成
**日期**: 2026-03-04

