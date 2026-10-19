import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 代理目标：默认指向本机后端。
// 抽成环境变量是为了后端换地址时不用改这个文件（例如临时指到别的机器）。
const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 看板与后端不同源时浏览器会拦下请求。开发期把 /api 代理过去，
      // 浏览器发的是同源请求，跨域与预检都不存在。
      //
      // 不写 rewrite：后端 @Controller('api/v1') 的完整路径就是 /api/v1/xxx，
      // 原样转发即可命中，多一步重写反而容易和前缀漂移。
      //
      // 后端 main.ts 里的 enableCors 保留不动 —— 那是给 SDK 跨域上报用的，
      // 与本代理各管一条链路。
      '/api': {
        target,
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: 'hidden',   // ← 就这一行
  },
})
