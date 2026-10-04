import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: tag => ['model-viewer', 'extra-model'].includes(tag),
        },
      },
    }),
    tailwindcss(),
  ],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost/kickcraft',
        changeOrigin: true,
      },
    },
  },
})
