import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      inspectorPort: 9230
    }),
    tailwindcss()
  ],
  build: {
    rollupOptions: {
      output: {
        // Use function-based manualChunks to prevent static imports of heavy chunks
        manualChunks(id) {
          // React ecosystem - core framework, keep in entry
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }

          // Chart libraries - lazy loaded, never in entry chunk
          // These should only be loaded when actually needed
          if (id.includes("node_modules/mermaid/")) {
            return "vendor-mermaid";
          }
          if (id.includes("node_modules/@antv/g2/")) {
            return "vendor-g2";
          }
          if (id.includes("node_modules/@ant-design/charts/")) {
            return "vendor-adc";
          }

          // Export utilities - lazy loaded for PDF/image export
          if (id.includes('node_modules/jspdf/') || id.includes('node_modules/html-to-image/')) {
            return 'vendor-export';
          }

          // Code highlighting - lazy loaded when code blocks appear
          if (id.includes('node_modules/shiki/') || id.includes('node_modules/vscode-oniguruma/')) {
            return 'vendor-highlight';
          }

          // Markdown processing - moderate size, commonly used
          if (
            id.includes('node_modules/react-markdown/') ||
            id.includes('node_modules/remark-gfm/') ||
            id.includes('node_modules/remark-math/') ||
            id.includes('node_modules/rehype-katex/')
          ) {
            return 'vendor-markdown';
          }

          // UI utilities
          if (id.includes('node_modules/@cloudflare/kumo/') || id.includes('node_modules/@phosphor-icons/react/')) {
            return 'vendor-ui';
          }

          // Virtual scrolling
          if (id.includes('node_modules/react-virtuoso/')) {
            return 'vendor-virtual';
          }

          // AI SDK
          if (
            id.includes('node_modules/ai/') ||
            id.includes('node_modules/@ai-sdk/react/') ||
            id.includes('node_modules/@ai-sdk/openai-compatible/')
          ) {
            return 'vendor-ai';
          }

          // No chunk assignment - stays in main bundle or follows dynamic imports
          return undefined;
        }
      }
    },
    // Increase chunk size warning limit since we're doing manual chunking
    chunkSizeWarningLimit: 800
  }
});
