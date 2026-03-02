/**
 * LaTeX streaming render hook
 *
 * Features:
 * - Validates LaTeX formulas before rendering
 * - Handles incomplete formulas during streaming
 * - Caches valid content to prevent flicker
 */

import { useEffect, useRef, useState, useMemo } from "react";

interface UseLatexRenderOptions {
  content: string;
  enableLatex?: boolean;
  isStreaming?: boolean;
}

interface UseLatexRenderResult {
  validContent: string;
  isFormulaValid: boolean;
  lastValidFormula: string | null;
}

// Pattern to match LaTeX formulas: $...$ or $$...$$
const LATEX_PATTERNS = {
  inline: /\$([^$\n]+?)\$/g,
  block: /\$\$([^$]+?)\$\$/gs,
};

/**
 * Check if a formula string is likely complete and valid
 */
function isFormulaComplete(formula: string): boolean {
  if (!formula || formula.length < 2) return false;

  // Check for balanced braces
  let braceCount = 0;
  let inEscape = false;

  for (let i = 0; i < formula.length; i++) {
    const char = formula[i];
    if (char === "\\" && !inEscape) {
      inEscape = true;
      continue;
    }
    inEscape = false;

    if (char === "{") braceCount++;
    else if (char === "}") braceCount--;
  }

  return braceCount === 0;
}

/**
 * Extract all LaTeX formulas from content
 */
function extractFormulas(content: string): { type: "inline" | "block"; formula: string }[] {
  const formulas: { type: "inline" | "block"; formula: string }[] = [];

  // Extract block formulas first ($$...$$)
  const blockMatches = content.matchAll(/\$\$([^$]+?)\$\$/g);
  for (const match of blockMatches) {
    formulas.push({ type: "block", formula: match[1] });
  }

  // Extract inline formulas ($...$)
  const inlineMatches = content.matchAll(/\$([^$\n]+?)\$/g);
  for (const match of inlineMatches) {
    formulas.push({ type: "inline", formula: match[1] });
  }

  return formulas;
}

/**
 * Hook for handling LaTeX rendering during streaming
 *
 * During streaming, LaTeX formulas may be incomplete and cause KaTeX errors.
 * This hook validates formulas and only returns content with valid formulas.
 */
export function useLatexRender(options: UseLatexRenderOptions): UseLatexRenderResult {
  const { content, enableLatex = true, isStreaming = false } = options;

  const [validContent, setValidContent] = useState(content);
  const [isFormulaValid, setIsFormulaValid] = useState(true);
  const lastValidRef = useRef<string>(content);
  const lastFormulaRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enableLatex) {
      setValidContent(content);
      setIsFormulaValid(true);
      return;
    }

    // During streaming, check if the last formula is complete
    if (isStreaming) {
      // Find all formulas in the content
      const inlineFormulas = content.match(/\$([^$\n]+?)\$/g) || [];
      const blockFormulas = content.match(/\$\$([^$]+?)\$\$/g) || [];
      const allFormulas = [...inlineFormulas, ...blockFormulas];

      if (allFormulas.length === 0) {
        // No formulas, content is valid
        setValidContent(content);
        setIsFormulaValid(true);
        lastValidRef.current = content;
        return;
      }

      // Check the last formula
      const lastFormula = allFormulas[allFormulas.length - 1];
      const formulaContent = lastFormula.replace(/^\$+\s?|\s?\$+$/g, "");

      if (isFormulaComplete(formulaContent)) {
        // Formula appears complete, try to render
        try {
          // Use KaTeX to validate (import dynamically to avoid SSR issues)
          import("katex").then((katex) => {
            try {
              katex.default.renderToString(formulaContent, {
                throwOnError: true,
                displayMode: lastFormula.startsWith("$$"),
              });
              // Formula is valid
              setValidContent(content);
              setIsFormulaValid(true);
              lastValidRef.current = content;
              lastFormulaRef.current = lastFormula;
            } catch {
              // Formula is invalid, use last valid content
              setValidContent(lastValidRef.current);
              setIsFormulaValid(false);
            }
          }).catch(() => {
            // KaTeX import failed, just use content as-is
            setValidContent(content);
            setIsFormulaValid(true);
          });
        } catch {
          setValidContent(lastValidRef.current);
          setIsFormulaValid(false);
        }
      } else {
        // Formula is incomplete, use last valid content
        setValidContent(lastValidRef.current);
        setIsFormulaValid(false);
      }
    } else {
      // Not streaming, all content is valid
      setValidContent(content);
      setIsFormulaValid(true);
      lastValidRef.current = content;
    }
  }, [content, enableLatex, isStreaming]);

  return {
    validContent,
    isFormulaValid,
    lastValidFormula: lastFormulaRef.current,
  };
}

/**
 * Hook for detecting content stability
 * Used to determine when to switch from streaming to static renderer
 */
export function useContentStability(
  content: string,
  stabilityThreshold: number = 500
): { isStable: boolean; stableContent: string } {
  const [isStable, setIsStable] = useState(false);
  const [stableContent, setStableContent] = useState(content);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevContentRef = useRef<string>(content);

  useEffect(() => {
    // Reset stability if content changes
    if (content !== prevContentRef.current) {
      setIsStable(false);
      prevContentRef.current = content;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        setIsStable(true);
        setStableContent(content);
      }, stabilityThreshold);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [content, stabilityThreshold]);

  return { isStable, stableContent };
}
