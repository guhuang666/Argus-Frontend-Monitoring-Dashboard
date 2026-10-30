# ═════════════════════════ 构建阶段 ═════════════════════════
FROM node:22-slim AS build
WORKDIR /app

# 依赖层：只拷清单，改代码不用重装依赖（层缓存）
COPY package.json package-lock.json ./
RUN npm ci

# 前端没法像后端那样只拷 src —— vite 还需要根目录下的
# index.html、vite.config.ts、tsconfig*.json，所以整体拷进来。
# node_modules / dist 已在 .dockerignore 里排除。
COPY . .
# package.json 的 build = "tsc -b && vite build"
#   tsc -b      先做类型检查，有错直接失败（不会产出半成品）
#   vite build  打包，产物在 dist/
RUN npm run build

# ═════════════════════════ 运行阶段 ═════════════════════════
# 前端编译完只剩 html/css/js，不需要 Node 运行时。
# 换成 nginx：光镜像就比 node:22-slim 小一半，而且天生适合发静态文件。
FROM nginx:1.27-alpine

# 用我们的站点配置覆盖镜像自带的默认配置。
# 官方镜像的主配置里有 include /etc/nginx/conf.d/*.conf，
# 所以往这个目录放 .conf 文件就会生效。
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 打包产物 → nginx 的网站根目录
#   /            → index.html
#   /assets/*    → js / css
COPY --from=build /app/dist /usr/share/nginx/html

# 声明监听 80（真正的端口映射在 compose 的 ports 里）
EXPOSE 80
