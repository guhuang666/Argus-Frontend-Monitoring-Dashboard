# Argus 看板

> 错误监控系统的前端：看趋势、看问题、看单条异常的堆栈、管告警规则。
> 后端在 [`../backend`](../backend)，SDK 在 [`../Argus-Util`](../Argus-Util)。

**技术栈**：React 19 · TypeScript · Vite · React Router 8（数据路由）· TanStack Query 5 · antd 6 · ECharts 6

---

## 1. 怎么跑

```bash
npm install
npm run dev        # http://localhost:5173，/api 自动代理到后端
```

后端默认在 `http://localhost:3000`，要指到别的机器就设环境变量：

```bash
VITE_PROXY_TARGET=http://47.119.32.85 npm run dev
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（HMR + `/api` 代理） |
| `npm run build` | `tsc -b` 类型检查 + `vite build` → `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | ESLint |

---

## 2. 页面与路由

```
/login                        公开，不进布局
/                             └─ RequireAuth（没凭据送回 /login）
   index                         项目列表 ← 登录后的落地页
   /projects/:projectId
      /overview                 概览：趋势 + Top 榜 + PV/UV/错误率
      /errors                   异常明细（单条事件）
      /issues                   问题列表（可筛选 / 排序 / 改状态）
      /issues/:id               问题详情（堆栈、发生次数、影响用户）
      /performance              性能趋势（LCP / CLS / INP 分位数）
      /settings                 项目设置（目前只有告警规则）
```

项目 id 是地址的一部分，所以**可分享、可刷新、可后退**：`/projects/<id>/issues` 发给同事，他看到的就是同一个项目同一个页面。

---

## 3. 目录

```
src/
├── api/            client（唯一 HTTP 出口）/ queries / queryClient / types
├── auth/           token 存取（localStorage）
├── components/     AppLayout / RequireAuth / TrendChart / FramesView / 各弹窗
├── pages/          8 个页面，与上面的路由一一对应
├── utils/          format（时间/数字）/ issue（状态文案）/ project / alert
├── router.tsx      路由表
├── App.tsx         全局 Provider：antd ConfigProvider + QueryClientProvider + RouterProvider
└── main.tsx        入口（只挂 StrictMode，页面由路由决定）
```

---

## 4. 三个约定

| 约定 | 说明 |
|---|---|
| **所有请求走 `src/api/client.ts`** | 基址是相对路径 `/api`，开发期靠 Vite 代理转给后端；浏览器视角始终同源，没有跨域与预检 |
| **登录态放 `localStorage`**（`argus:token`） | 配 `Authorization: Bearer`。代价是 XSS 能读走它，所以前端不能有 XSS；好处是天然没有 CSRF |
| **数据统一走 TanStack Query** | 缓存在 `queryClient.ts` 里集中配置，不要在组件里手写 `useEffect + fetch` |

另有两处是构建配置的硬约束，**改代码时别绕开**：

- `vite.config.ts` 里 `build.sourcemap: 'hidden'`——给 Sourcemap 上传 CLI 用。
- `tsconfig` 开了 `erasableSyntaxOnly`（Vite 只做类型擦除）。所以**不能用构造函数参数属性**（`constructor(readonly x: T)`）这类"会生成运行时代码"的 TS 语法，`ApiError` 就是这么写的。

---

## 5. 和后面的接口对照

`npm run dev` 下的代理只是一层转发，`/api/v1/xxx` 的路径与后端 controller 完全一致（**不做 rewrite**，多一步重写反而容易把前缀改漂）。后端接口一览见 [`../backend/README.md`](../backend/README.md) §7。
