import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/output': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        bg: resolve(__dirname, 'tools/bg-remover/index.html'),
        video: resolve(__dirname, 'tools/video-converter/index.html'),
        image: resolve(__dirname, 'tools/image-converter/index.html'),
        caption: resolve(__dirname, 'tools/caption-ai/index.html'),
        auphonic: resolve(__dirname, 'tools/auphonic-enhancer/index.html'),
        thumb: resolve(__dirname, 'tools/thumbnail-generator/index.html'),
      }
    }
  }
})
