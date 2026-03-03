# 图表渲染收益型改造计划（稳定性 + 性能 + 可观测）

## Summary
目标是在不改变业务功能的前提下，解决图表链路的三类高价值问题：
1. 消除 D1 迁移脚本“必失败”风险。
2. 提升 ADC/G2 非标准输出的容错率并给出可诊断错误。
3. 降低图表资源加载成本，减少首图表渲染等待。
4. 建立图表渲染可观测性，确保优化可量化。

## 范围与优先级
1. P0：修复数据库迁移脚本路径与执行流程。
2. P1：改造 ADC 解析器为“两段式解析 + 结构化错误码”。
3. P1：图表事件埋点（解析失败/渲染失败/渲染成功耗时）。
4. P1：拆分 `vendor-chart` 为多 chunk，避免 Mermaid 场景加载整包 AntV。
5. P2：收敛重复逻辑（主题探测 hook）与清理未使用的旧图表入口代码。

## 具体实施方案

### 1) P0 迁移链路修复
1. 将 `db:migrate:local` 与 `db:migrate:prod` 从硬编码 `./drizzle/meta/*.sql` 改为“可检测路径 + 失败提示”脚本封装。
2. 新增 `scripts/check-migration-files.mjs`：启动前检查迁移目录存在性与文件数量。
3. 在 README/开发文档中明确：当前后端有 `ensureAuthSchema` 自动建表（见 `/home/dev/github/chatwithme-2/src/server/auth-db.ts`），迁移脚本用于生产可控变更，不应与本地快速启动耦合。

收益：
1. 消除 CI/CD 与本地迁移“确定性失败”。
2. 降低发布阻断风险。

### 2) P1 ADC 解析器增强（高ROI）
1. 保留 strict 模式为第一优先（安全默认）。
2. strict 失败后进入 tolerant 模式，仅做受限清洗：
1. 移除注释与尾逗号。
2. 删除已知函数型字段（如 `formatter`、`label.text` function），仅允许白名单字段清洗。
3. 再次 `JSON.parse` 并执行 schema 校验（type whitelist + config object）。
3. `parseAdcSpecFromCode` 返回结构升级为：
1. `ok: true, spec`
2. `ok: false, code: "ADC_PARSE_INVALID_JSON" | "ADC_PARSE_UNSUPPORTED_CALLBACK" | "ADC_PARSE_INVALID_TYPE" | "ADC_PARSE_EMPTY"`
4. `MarkdownRenderer` 对错误码显示明确提示，而非统一 `Invalid ADC spec`。

收益：
1. 减少因 LLM 轻微非标输出导致的“可修复失败”。
2. 提高问题定位效率，减少用户重试成本。

### 3) P1 图表可观测性闭环
1. 在 `trackChatEvent` 增加图表事件：
1. `chart_parse_success`
2. `chart_parse_failure`
3. `chart_render_success`
4. `chart_render_failure`
2. 统一 payload：`engine`, `errorCode`, `inputSize`, `durationMs`, `sessionId`.
3. 将 Mermaid/G2/ADC 渲染耗时打点，形成基线报表（至少输出到现有 event bus）。

收益：
1. 可量化“改造前后成功率/耗时变化”。
2. 后续优化不再凭体感决策。

### 4) P1 图表包体与加载优化
1. 调整 `vite.config.ts` 的 `manualChunks`：
1. `vendor-mermaid`
2. `vendor-g2`
3. `vendor-adc`
4. 保持 `vendor-chart` 作为兜底（逐步迁移）。
2. 避免 Mermaid 场景下载 AntV 全家桶。
3. 针对 ADC renderer，评估按图类型动态加载组件（line/column/pie 等），至少先验证能否将首个 ADC chunk 再降一档。
4. 建立优化验收阈值：
1. `vendor-chart` 不再出现单一 3MB+ 大块。
2. Mermaid-only 场景下载体积明显下降（目标下降 30%+）。

收益：
1. 首次图表展示更快。
2. 弱网和移动端体验改善明显。

### 5) P2 代码收敛与维护性
1. 抽取公共 `useThemeDetector` 到 `src/hooks/useThemeDetector.ts`，替换 `/home/dev/github/chatwithme-2/src/components/ChartRenderer.tsx` 与 `/home/dev/github/chatwithme-2/src/components/AntDesignChartsRenderer.tsx` 的重复实现。
2. 评估删除未被业务引用的 `ChartDisplay/parseChartFromText` 老入口（仅测试使用），减少维护噪音。

收益：
1. 降低重复逻辑带来的行为漂移风险。
2. 减少未来改动面。

## 公共接口/类型变更
1. `parseAdcSpecFromCode` 返回类型从 `ParsedAdcSpec | null` 升级为结构化结果（含错误码）。
2. `ChatEventName` 增加 chart 事件枚举。
3. `MarkdownRenderer` 的 ADC 错误展示分支改为按错误码映射文案。

## 测试与验收场景
1. 单元测试：
1. ADC strict valid/invalid。
2. ADC tolerant 可恢复案例（注释、尾逗号、formatter 回调）。
3. ADC 不可恢复案例（恶意/严重破坏 JSON）。
4. 错误码映射正确性。
2. 集成测试：
1. `language=adc` 在三类输入下渲染/报错行为稳定。
2. chart telemetry 事件按期望发送。
3. 构建验收：
1. `npm run build` 通过。
2. chunk 报告中不再出现单一超大图表 chunk。
4. 运行验收：
1. `npm run db:migrate:local` 在无迁移文件时给出清晰错误。
2. 有迁移文件时可执行成功。

## 里程碑与交付顺序
1. M1（半天）：迁移脚本修复 + 文档更新。
2. M2（1天）：ADC 两段解析 + 错误码 + Markdown 错误展示 + 单测。
3. M3（半天）：chart telemetry 接入 + 事件测试。
4. M4（1天）：分包优化 + 构建对比报告。
5. M5（半天）：主题 hook 收敛 + 老入口清理（可选）。

## Assumptions & Defaults
1. 默认保持“安全优先”：ADC tolerant 仅做有限清洗，不执行任意 JS。
2. 默认不改动后端 API 协议，仅前端渲染与观测增强。
3. 默认以当前构建体积与渲染成功率为基线，改造后用同一脚本回归比较。
4. 默认优先完成 P0/P1，P2 仅在前述目标完成后执行。
