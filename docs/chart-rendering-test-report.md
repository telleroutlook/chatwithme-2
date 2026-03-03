# 图表渲染测试分析报告 (March 3, 2026)

## 1. 测试概览
本报告基于 `playwright-cli` 对 `ChatWithMe` 生产系统进行的 E2E 图表渲染测试。由于环境限制（API Key 缺失及数据库迁移脚本路径错误），本次测试通过前端 Mock 数据的方式验证了渲染引擎的稳定性。测试覆盖了 Mermaid、Ant Design Charts (ADC) 和 G2 三类核心可视化引擎。

## 2. 测试环境
- **前端 URL**: `http://localhost:5173` (Vite Dev)
- **后端 URL**: `http://localhost:8787` (Wrangler Dev - 启动受阻)
- **引擎版本**:
  - Mermaid: 11.12.3
  - Ant Design Charts: 2.6.7
  - AntV G2: 5.4.8

## 3. 错误分析与发现

### 3.1 环境启动故障 (Critical)
- **问题描述**: 运行 `npm run dev` 或 `npm run db:migrate:local` 时报错 `Unable to read SQL text file "./drizzle/meta/*.sql"`。
- **根因分析**: 项目根目录下不存在 `drizzle` 目录，导致 `wrangler d1 execute` 无法找到迁移文件。
- **解决方案**: 
  1. 确认 `drizzle-kit generate` 是否已成功执行并生成了 SQL 文件。
  2. 修正 `package.json` 中的路径，或者在 `src/server/auth-db.ts` 中继续使用自动初始化逻辑（目前后端已具备 D1 自动建表功能，可考虑简化迁移流程）。

### 3.2 ADC 2.x 兼容性风险 (Medium)
- **问题描述**: ADC 2.x React 组件对 `label` 和回调函数的处理与 1.x 有显著差异。
- **发现**: `AntDesignChartsRenderer.tsx` 尝试通过 `normalizeConfigForADC2` 转换配置，但 LLM 可能会输出包含 `(d) => ...` 的代码块。
- **潜在风险**: `adcSpecParser.ts` 使用 `JSON.parse` 进行严格解析，若 LLM 输出包含 JavaScript 回调，解析将直接失败。
- **建议**: 在 `adcSpecParser.ts` 中引入类似 `g2SpecParser.ts` 的容错解析逻辑，或者在 System Prompt 中严禁输出回调。

### 3.3 G2 Spec 解析脆弱性 (Low)
- **问题描述**: `sanitizeFunctionLikeProps` 使用正则表达式删除 `formatter` 等回调属性。
- **潜在风险**: 正则表达式在处理嵌套对象或非标准格式时可能误删有用数据或导致解析死循环。
- **建议**: 考虑使用更稳健的 AST 解析或更安全的字符串清理策略。

### 3.4 主题切换检测 (UX)
- **问题描述**: `useThemeDetector` 依赖于 `data-mode` 属性的 `MutationObserver`。
- **实际情况**: 经检查 `ThemeProvider` 正确设置了 `data-mode`。
- **结论**: 图表引擎能够实时响应主题切换，渲染逻辑正常。

## 4. 测试结论 (Mock 验证)

| 组件 | 输入指令 | 渲染状态 | 备注 |
| :--- | :--- | :--- | :--- |
| **Mermaid** | `flowchart TD...` | ✅ 成功 | 渲染流畅，支持动态导入。 |
| **ADC** | `{"type": "bar", ...}` | ✅ 成功 | `normalizeConfigForADC2` 运行正常。 |
| **G2** | `{"type": "line", ...}` | ✅ 成功 | 兼容简单 Spec，主题色适配良好。 |

## 5. 改进建议
1. **统一路径管理**: 修正 `package.json` 中的数据库迁移路径，避免部署失败。
2. **增强解析器**: 为 ADC 解析器添加容错处理，应对 LLM 输出的非标 JSON。
3. **加载优化**: 针对大型图表库（如 Mermaid）的懒加载，建议添加更精细的 Loading 状态。
