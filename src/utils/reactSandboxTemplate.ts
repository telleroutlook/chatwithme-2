/**
 * React Sandbox HTML Template
 *
 * Builds a self-contained HTML page that can render arbitrary React components
 * inside a sandboxed iframe. Uses CDN imports for React 18, Tailwind CSS,
 * Lucide icons, and Babel standalone (for JSX transformation).
 *
 * Security: The iframe is sandboxed with `allow-scripts` only (no allow-same-origin),
 * which prevents it from accessing parent cookies, localStorage, or DOM.
 */

/**
 * Build the full HTML string for the iframe's `srcdoc` attribute.
 *
 * @param code  Raw React component code (JSX) from the user / AI
 * @param isDark  Whether the parent is in dark mode
 */
export function buildSandboxHtml(code: string, isDark: boolean): string {
  // Escape closing </script> inside user code so it doesn't break the HTML
  const escapedCode = code.replace(/<\/script>/gi, "<\\/script>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://cdn.tailwindcss.com; font-src https://fonts.gstatic.com; connect-src https://esm.sh https://cdn.tailwindcss.com; img-src * data: blob:;" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.3.1",
      "react/": "https://esm.sh/react@18.3.1/",
      "react-dom": "https://esm.sh/react-dom@18.3.1",
      "react-dom/": "https://esm.sh/react-dom@18.3.1/",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
      "lucide-react": "https://esm.sh/lucide-react@0.468.0?external=react"
    }
  }
  <\/script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
        "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      overflow: auto;
    }
    #root { min-height: 40px; }
    .sandbox-error-overlay {
      padding: 12px 16px;
      border: 2px solid #ef4444;
      border-radius: 8px;
      background: ${isDark ? "#1c1017" : "#fef2f2"};
      color: ${isDark ? "#fca5a5" : "#dc2626"};
      font-size: 13px;
      font-family: ui-monospace, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body class="${isDark ? "dark bg-gray-900 text-gray-100" : "bg-white text-gray-900"}">
  <div id="root"></div>

  <!-- Babel standalone for JSX transformation -->
  <script src="https://esm.sh/@babel/standalone@7.26.9/babel.min.js"><\/script>

  <script type="module">
    import React from "react";
    import { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, Fragment, memo, forwardRef } from "react";
    import { createRoot } from "react-dom/client";

    // Notify parent of height changes
    function reportHeight() {
      try {
        const h = document.documentElement.scrollHeight;
        window.parent.postMessage({ type: "resize", height: h }, "*");
      } catch (_) { /* sandboxed -- ignore */ }
    }

    // Report errors to parent
    function reportError(msg) {
      try {
        window.parent.postMessage({ type: "error", message: String(msg) }, "*");
      } catch (_) { /* sandboxed -- ignore */ }
    }

    // Show error in the DOM
    function showError(prefix, err) {
      reportError(prefix + (err.message || String(err)));
      const root = createRoot(document.getElementById("root"));
      root.render(
        React.createElement("div", { className: "sandbox-error-overlay" },
          prefix + (err.message || String(err))
        )
      );
      reportHeight();
    }

    // Simple Error Boundary
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error) {
        reportError("Runtime Error: " + (error.message || String(error)));
      }
      render() {
        if (this.state.error) {
          return React.createElement("div", { className: "sandbox-error-overlay" },
            "Runtime Error:\\n" + (this.state.error.message || String(this.state.error))
          );
        }
        return this.props.children;
      }
    }

    // === Step 1: Transpile user JSX with Babel ===
    let transpiledCode;
    const userCode = ${JSON.stringify(escapedCode)};
    try {
      const result = window.Babel.transform(userCode, {
        presets: [["react", { runtime: "classic" }]],
        plugins: ["transform-modules-commonjs"],
        filename: "component.jsx",
      });
      transpiledCode = result.code;
    } catch (err) {
      showError("JSX Transform Error: ", err);
      throw err;
    }

    // === Step 2: Execute the transpiled code ===
    // Babel's transform-modules-commonjs turns:
    //   export default function App() { ... }
    // into:
    //   exports["default"] = function App() { ... }
    // So we provide exports/module/require as function parameters.
    let UserComponent = null;
    try {
      const exports = {};
      const module = { exports: exports };
      const require = (name) => {
        if (name === "react") return React;
        throw new Error("Cannot require module: " + name);
      };

      const fn = new Function(
        "React", "useState", "useEffect", "useRef", "useMemo",
        "useCallback", "useReducer", "useContext", "createContext",
        "Fragment", "memo", "forwardRef",
        "exports", "module", "require",
        transpiledCode
      );
      fn(
        React, useState, useEffect, useRef, useMemo,
        useCallback, useReducer, useContext, createContext,
        Fragment, memo, forwardRef,
        exports, module, require
      );

      // After execution, check if module.exports was reassigned
      const resolved = module.exports !== exports ? module.exports : exports;

      // Resolve the component from various export patterns
      UserComponent =
        (typeof resolved === "function" ? resolved : null) ||
        resolved.default ||
        resolved.App ||
        resolved.Component ||
        resolved.Main ||
        null;

      // Fallback: re-execute and look for well-known variable names
      if (!UserComponent) {
        try {
          const fallbackFn = new Function(
            "React", "useState", "useEffect", "useRef", "useMemo",
            "useCallback", "useReducer", "useContext", "createContext",
            "Fragment", "memo", "forwardRef",
            "exports", "module", "require",
            transpiledCode +
              "\\nreturn typeof App !== 'undefined' ? App" +
              " : typeof Component !== 'undefined' ? Component" +
              " : typeof Main !== 'undefined' ? Main : null;"
          );
          UserComponent = fallbackFn(
            React, useState, useEffect, useRef, useMemo,
            useCallback, useReducer, useContext, createContext,
            Fragment, memo, forwardRef,
            {}, { exports: {} }, require
          );
        } catch (_) { /* ignore fallback failure */ }
      }
    } catch (err) {
      showError("Component Execution Error: ", err);
      throw err;
    }

    // === Step 3: Render ===
    try {
      const root = createRoot(document.getElementById("root"));
      if (UserComponent) {
        root.render(
          React.createElement(ErrorBoundary, null,
            React.createElement(UserComponent)
          )
        );
      } else {
        root.render(
          React.createElement("div", { className: "sandbox-error-overlay" },
            "No component found. The code should export a default component, or define a function named App, Component, or Main."
          )
        );
        reportError("No renderable component found");
      }
    } catch (err) {
      showError("Render Error: ", err);
    }

    // === Step 4: Auto-resize via postMessage ===
    requestAnimationFrame(() => reportHeight());
    const ro = new ResizeObserver(() => reportHeight());
    ro.observe(document.getElementById("root"));
    new MutationObserver(() => requestAnimationFrame(reportHeight))
      .observe(document.getElementById("root"), { childList: true, subtree: true, attributes: true });
  <\/script>
</body>
</html>`;
}
