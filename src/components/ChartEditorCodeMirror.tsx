/**
 * ChartEditorCodeMirror — lazy-loaded CodeMirror wrapper for ChartEditor.
 *
 * This module is imported via React.lazy() so the ~40KB CodeMirror bundle
 * only loads when the user opens the chart editor.
 */

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintGutter } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChartEditorCodeMirrorProps {
  value: string;
  onChange: (value: string) => void;
  isDark: boolean;
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "#ffffff",
    color: "#1f2937",
    fontSize: "12px",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
    padding: "8px 0",
  },
  ".cm-gutters": {
    backgroundColor: "#f9fafb",
    borderRight: "1px solid #e5e7eb",
    color: "#9ca3af",
  },
  ".cm-activeLine": {
    backgroundColor: "#f3f4f6",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#f3f4f6",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#3b82f6",
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "#dbeafe",
  },
});

const darkThemeOverrides = EditorView.theme({
  "&": {
    fontSize: "12px",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
    padding: "8px 0",
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ChartEditorCodeMirror({
  value,
  onChange,
  isDark,
}: ChartEditorCodeMirrorProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track if update is from external (prop change) vs internal (user typing)
  const isExternalUpdate = useRef(false);

  // Compartment for swappable theme
  const themeCompartment = useRef(new Compartment());

  const getThemeExtension = useCallback(
    (dark: boolean) => {
      return dark
        ? [oneDark, darkThemeOverrides]
        : [lightTheme];
    },
    []
  );

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const themeExt = getThemeExtension(isDark);

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        lintGutter(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        json(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...closeBracketsKeymap,
          ...searchKeymap,
        ]),
        themeCompartment.current.of(themeExt),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdate.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync theme changes using the compartment
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartment.current.reconfigure(getThemeExtension(isDark)),
    });
  }, [isDark, getThemeExtension]);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (currentContent !== value) {
      isExternalUpdate.current = true;
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: value,
        },
      });
      isExternalUpdate.current = false;
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-auto"
    />
  );
}

export default ChartEditorCodeMirror;
