import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    plugins: [react()],

    // ── Development server ──────────────────────────────────────────────────
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },

    // ── Path aliases ────────────────────────────────────────────────────────
    resolve: {
      alias: {
        '@': '/src',
      },
    },

    // ── Production build ────────────────────────────────────────────────────
    build: {
      outDir: 'dist',
      // Remove console.log / console.debug in production builds
      minify: isProduction ? 'terser' : false,
      terserOptions: isProduction
        ? {
            compress: {
              drop_console: true,
              drop_debugger: true,
            },
          }
        : undefined,
      // Hidden source maps — useful for error tracking but not exposed to users
      sourcemap: isProduction ? 'hidden' : true,
      // Split vendor chunks for better long-term caching
      rollupOptions: {
        output: {
          manualChunks: {
            vendor:  ['react', 'react-dom', 'react-router-dom'],
            redux:   ['@reduxjs/toolkit', 'react-redux'],
            charts:  ['recharts'],
            icons:   ['lucide-react'],
            forms:   ['react-hook-form'],
            dates:   ['date-fns'],
          },
        },
      },
      // Inline assets ≤ 4 kB directly into JS (saves a round trip per small image/svg)
      assetsInlineLimit: 4096,
      // Warn if any chunk exceeds 500 kB
      chunkSizeWarningLimit: 500,
    },
  }
})
