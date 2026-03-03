# 前端移动端优化审查报告与执行计划（极致性能优先）

## 1. 目标与原则
本计划聚焦“可量化收益”的移动端优化，优先顺序为：
1. 首屏包体与关键交互稳定性（P0）
2. 监听与渲染开销收敛（P1）
3. 渲染链路按需加载深化（P1）

约束：
- 不改变业务 API 与交互语义
- 优先低风险高收益改造
- 每个阶段都可独立上线并回滚

---

## 2. 当前代码对照结论

### 2.1 `useResponsive` 监听模型会放大重渲染
- 文件：`src/hooks/useResponsive.ts`
- 现状：每个使用方都注册 `ResizeObserver + resize`，目前多处组件使用。
- 风险：移动端旋转/键盘变化时，重复监听触发多次状态更新，导致整体渲染抖动。

### 2.2 `useVirtualViewport` 防抖定时器存在闭包问题
- 文件：`src/hooks/useVirtualViewport.ts`
- 现状：用 `useState` 保存 timer，并在回调依赖中引用，存在 stale closure 风险。
- 风险：连续 viewport 变化时定时器清理不稳定，键盘相关布局可能抖动。

### 2.3 `BottomSheet` 滑动速度计算存在逻辑缺陷
- 文件：`src/components/ui/BottomSheet.tsx`
- 现状：`deltaTime` 用了起始 Y 坐标参与计算，速度判断失真。
- 风险：快速下滑关闭手势不可靠，移动端交互体验下降。

### 2.4 `MobileTabBar` 优化收益低
- 文件：`src/components/layout/MobileTabBar.tsx`
- 现状：存在内联函数传参问题，但当前主流程未实际接入。
- 结论：不作为本轮优先项。

### 2.5 新增 P0 问题：首屏加载了超大图表包
- 文件：`vite.config.ts`
- 现状：当前手动分包策略使 chart 相关 chunk 进入入口依赖链。
- 证据：构建产物中 `vendor-chart` 体积约 2MB（minified，gzip 约 588KB）。
- 收益判断：这是最直接影响移动端首屏速度的改造点，应优先处理。

---

## 3. 分阶段执行计划

## Phase 1（P0）：首屏性能 + 手势稳定性

### 3.1 重构 Vite 分包策略，避免首屏静态引入图表大包
- 修改：`vite.config.ts`
- 方案：
  - 将对象式 `manualChunks` 改为函数式 `manualChunks(id)`。
  - chart 生态（`mermaid` / `@antv/g2` / `@ant-design/charts` / `echarts`）按需拆分，仅在动态导入路径加载。
  - 导出链路（如 `jspdf`、`html-to-image`）独立分包，避免污染首屏。
- 验收：
  - `dist/client/assets/index-*.js` 不再静态 `import` chart vendor chunk。
  - 首屏入口 JS gzip 体积较当前基线显著下降（目标 >= 30%）。

### 3.2 修复 BottomSheet 手势关闭逻辑并提升动画跟手
- 修改：`src/components/ui/BottomSheet.tsx`
- 方案：
  - 新增 `dragStartTimeRef`，用真实时间戳计算 `velocity`。
  - `touchmove` 的 transform 更新通过 `requestAnimationFrame` 调度。
  - 补齐 `touchcancel` 清理逻辑，确保状态一致性。
- 验收：
  - 快速下滑可稳定关闭；短距离慢滑不会误关。
  - 低端设备拖拽掉帧明显减少。

### 3.3 同步修复 `ModalHost` 中重复的移动底部弹层手势逻辑
- 修改：`src/components/modal/ModalHost.tsx`
- 方案：
  - 与 `BottomSheet` 对齐手势判断与速度算法。
  - 抽取共享逻辑（建议 `useSheetSwipeClose`）避免双份实现继续漂移。
- 验收：
  - 两套弹层在移动端行为一致。
  - 修复后无滚动穿透和关闭误触回归。

### 3.4 修复 `useVirtualViewport` 防抖闭包问题
- 修改：`src/hooks/useVirtualViewport.ts`
- 方案：
  - timer 存储改为 `useRef`。
  - 事件回调从依赖中剔除 timer state，避免频繁重建。
  - cleanup 统一释放 `timerRef.current`。
- 验收：
  - 键盘弹出/收起时输入区位置稳定，无明显跳动。
  - 连续 resize/scroll 时只保留最后一次有效更新。

---

## Phase 2（P1）：响应式监听去重与全局收敛

### 4.1 将 `useResponsive` 升级为单例订阅模型
- 修改：`src/hooks/useResponsive.ts`（可新增内部 store 文件）
- 方案：
  - 使用 `useSyncExternalStore` + 全局 store。
  - 全局只保留一组监听器（`ResizeObserver/resize/touchstart`）。
  - 更新节流（`rAF` 或 80~120ms）避免密集更新。
- 验收：
  - 无论多少组件调用，监听器数量恒定。
  - 旋转屏幕时 React 提交次数明显下降。

### 4.2 `MobileTabBar` 仅保留为后续接入项
- 本轮不投入开发工时，后续如恢复主路径使用再做 `memo + stable handlers`。

---

## Phase 3（P1）：重型渲染链路按需加载深化

### 5.1 代码高亮链路最小化加载
- 修改：
  - `src/components/CodeBlock.tsx`
  - `src/hooks/useShikiHighlight.ts`
  - `src/components/MarkdownRenderer.tsx`
- 方案：
  - `CodeBlock` 延迟加载，只有真正出现代码块时才拉取高亮运行时。
  - Shiki 维持按需语言加载，不让大语言集合污染首屏路径。
- 验收：
  - 纯文本会话路径不加载高亮重依赖。
  - 含代码消息首渲染有可接受 fallback（skeleton）。

---

## 6. 测试与验收矩阵

### 6.1 基础质量门禁
- `npm run lint`
- `npm run typecheck`
- `npm run build`

### 6.2 单元/组件测试新增建议
- `useVirtualViewport`：连续触发下仅最后一次生效。
- `BottomSheet`：velocity 与距离阈值组合行为。
- `ModalHost`：与 `BottomSheet` 手势一致性。
- `useResponsive`：多订阅者下监听器数量验证。

### 6.3 E2E 回归
- `test/e2e/mobile-keyboard.production.mjs`
- `test/e2e/mobile-sheet-scrolllock.production.mjs`
- `test/e2e/mobile-safe-area.production.mjs`
- 新增：快速下滑关闭手势稳定性场景。

### 6.4 性能验收
- 对比改造前后构建产物：
  - 首屏入口 JS 体积
  - 是否移除入口对 chart vendor 的静态依赖
- 在移动端设备/模拟器验证：
  - 首屏可交互时间体感改善
  - 键盘弹出与底部弹层交互稳定

---

## 7. 影响面与兼容性

### 7.1 公共接口
- 保持不变：
  - `useResponsive()` 返回结构
  - `useVirtualViewport()` 返回结构
  - `BottomSheetProps` 现有调用方式

### 7.2 新增内部能力（非破坏性）
- `useSheetSwipeClose`（建议）
- `responsiveStore`（建议）

---

## 8. 风险与回滚策略
- 风险：
  - 分包策略改动可能影响缓存命中与加载顺序
  - 手势逻辑统一时可能引入细微交互差异
- 回滚：
  - 以 Phase 为单位提交，可逐步回滚
  - 保留旧分包策略配置与手势实现分支，快速切换

---

## 9. 交付顺序（建议）
1. Phase 1 全部完成并通过回归后上线
2. 观察 1 个迭代周期，再推进 Phase 2
3. Phase 3 与后续渲染性能需求捆绑推进
