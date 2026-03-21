/**
 * Built-in math evaluator tool — uses mathjs for precise expression evaluation.
 *
 * Runs entirely in-process (no external HTTP call), so latency is < 5ms.
 * Handles arithmetic, algebra, unit conversions, statistics, and matrix ops.
 * Cloudflare Workers compatible — mathjs is pure JS.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

export const BUILTIN_MATH_EVAL_KEY = "builtin_math_eval";

// Lazy-load mathjs with BigNumber mode for full integer precision (e.g. 2^53+1)
let mathjsEvaluate: ((expr: string) => unknown) | null = null;

async function getMathEvaluate(): Promise<(expr: string) => unknown> {
  if (!mathjsEvaluate) {
    const { create, all } = await import("mathjs");
    // Use BigNumber with 64-digit precision to avoid IEEE 754 rounding on large integers
    const math = create(all, { number: "BigNumber", precision: 64 });
    mathjsEvaluate = (expr: string) => math.evaluate(expr);
  }
  return mathjsEvaluate;
}

function formatResult(result: unknown): string {
  if (result === null || result === undefined) return "null";

  // mathjs result objects have a toString()
  const str = String(result);

  // If it's a plain number string, return as-is
  return str;
}

export function createMathEvalTool(): ToolSet {
  return {
    [BUILTIN_MATH_EVAL_KEY]: tool({
      description:
        "Evaluate mathematical expressions with full precision. Use for arithmetic, algebra, unit conversions (e.g. '5 kg to lbs'), statistics (mean, std), matrix operations, and any calculation where LLM mental math may be inaccurate. Examples: '2^53 + 1', 'sqrt(2) * pi', 'mean([4, 8, 15, 16, 23, 42])', '5 inch to cm'.",
      inputSchema: z.object({
        expression: z
          .string()
          .describe(
            "The mathematical expression to evaluate. Use mathjs syntax: operators (+,-,*,/,^), functions (sqrt, sin, cos, log, abs, round, mean, std, etc.), units (km, kg, USD, etc.), and matrix notation [[1,2],[3,4]]."
          ),
      }),
      execute: async ({ expression }: { expression: string }) => {
        if (!expression?.trim()) {
          return "Error: No expression provided.";
        }
        // Reject expressions that are excessively long (potential DoS)
        if (expression.length > 2000) {
          return "Error: Expression too long (max 2000 characters).";
        }
        try {
          const evaluate = await getMathEvaluate();
          // Wrap in a timeout to prevent CPU-exhausting expressions (e.g. 2^999999)
          const TIMEOUT_MS = 5000;
          const result = await Promise.race([
            Promise.resolve().then(() => evaluate(expression.trim())),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Evaluation timed out (expression too complex)")), TIMEOUT_MS)
            ),
          ]);
          return `${expression.trim()} = ${formatResult(result)}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Math evaluation error: ${msg}. Check your expression syntax.`;
        }
      },
    }),
  };
}
