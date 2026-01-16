import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Generate bundle analysis report (only in build)
    mode === 'production' && visualizer({
      filename: 'dist/bundle-stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  server: {
    port: 5173,
  },
  build: {
    // Use terser for better minification (smaller than esbuild)
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
    // Enable source maps for production debugging (optional)
    sourcemap: false,
    // Rollup options for better tree shaking and chunking
    rollupOptions: {
      output: {
        // Manual chunks for better caching
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom'],
          // Markdown rendering
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'rehype-raw'],
          // Syntax highlighting (large)
          'vendor-syntax': ['react-syntax-highlighter'],
          // Math rendering
          'vendor-katex': ['katex'],
        },
      },
      treeshake: {
        moduleSideEffects: 'no-external',
        preset: 'recommended',
      },
    },
    // Chunk size warning limit
    chunkSizeWarningLimit: 500,
  },
}));
