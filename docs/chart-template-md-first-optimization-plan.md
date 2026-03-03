# 图表提示词优化计划（V4：仅保留高收益）

## Summary
本计划只保留已确认可直接带来正收益的改造项，不包含任何候选项或预研项。

## 1. 本轮仅做三项改造

1. 动态提示词裁剪（轻量版）
- 目标：降低 system prompt token，提升相关性。
- 实施：基于 `chartPrimary` + 用户显式关键词命中（line/bar/pie/flowchart/sequence 等）注入对应子集。
- 回退：未命中或异常时回退到完整核心集合。

2. 确定性排序
- 目标：保证 prompt 可预测、快照稳定。
- 实施：统一排序规则（engine 优先级 + chartType 名称），固定拼接顺序。

3. Mermaid 校验增强（轻量）
- 目标：在渲染前过滤明显无效/高风险内容，减少运行时报错。
- 实施：增加声明行校验、基础括号/引号平衡、禁用 HTML 标签检查。

## 2. 代码改造范围
1. `src/demos/chat/system-prompt.ts`
- 加入受控裁剪与稳定排序；保留完整回退。

2. `src/demos/chat/chart-knowledge.ts`
- 提供可排序、可筛选的轻量接口（不改知识源格式）。

3. `src/components/MarkdownRenderer.tsx`（必要时 `src/components/ChartRenderer.tsx`）
- Mermaid 渲染前增加轻量静态校验。

## 3. 测试与验收

### 新增测试
1. `system-prompt` 相关测试
- 裁剪命中与未命中回退。
- `chartPrimary=adc/g2` 顺序稳定。
- 核心场景快照稳定。

2. Mermaid 相关测试
- 声明行非法拦截。
- 括号/引号不平衡拦截。
- HTML 标签禁用规则拦截。

### 回归测试
- `src/utils/adcSpecParser.test.ts`
- `src/components/ChartRenderer.test.ts`

### 验收门槛
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`

## 4. 实施顺序
1. Phase 1：提示词裁剪 + 排序
2. Phase 2：Mermaid 轻校验
3. Phase 3：补齐测试并验收

## 5. 回滚策略
1. 关闭裁剪分支，恢复完整 prompt 拼接。
2. Mermaid 轻校验从“拦截”降级为“仅提示”。
