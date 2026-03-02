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
        manualChunks: {
          // React ecosystem
          'vendor-react': ['react', 'react-dom'],
          // Markdown processing
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex', 'rehype-highlight', 'highlight.js'],
          // Chart libraries - loaded on demand but grouped when used
          'vendor-chart': ['mermaid', '@antv/g2', 'echarts', '@ant-design/charts'],
          // UI utilities
          'vendor-ui': ['@cloudflare/kumo', '@phosphor-icons/react'],
          // Virtual scrolling
          'vendor-virtual': ['react-virtuoso', 'virtua'],
          // AI SDK
          'vendor-ai': ['ai', '@ai-sdk/react', '@ai-sdk/openai-compatible'],
        }
      }
    },
    // Increase chunk size warning limit since we're doing manual chunking
    chunkSizeWarningLimit: 800
  }
});
