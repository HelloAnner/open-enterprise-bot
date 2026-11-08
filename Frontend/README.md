# Moss 企业级 Bot Web

## 运行

```bash
npm install
npm run dev
npm run build
npm test
```

## 技术栈

React + TypeScript + Vite；TanStack Query 管理服务端状态；Zustand 仅管理 UI 状态；Radix/shadcn 风格源码组件；Lucide 图标；Motion 动画；dnd-kit 看板拖拽；react-resizable-panels 布局；MSW 提供 HTTP Mock API；Zod 校验接口响应。

## 分层

- `src/api`：接口契约、统一 Client、API endpoints、Query hooks 和 MSW。
- `src/domain`：Bot、消息、看板领域类型与纯业务逻辑。
- `src/stores`：当前 Bot、搜索、分组展开、回复引用等 UI 状态。
- `src/components/ui`：无业务耦合的基础组件。
- `src/features`：侧边栏、Bot、聊天、文件、看板功能模块。
- `src/app`：Provider、应用组合与响应式布局。
- `src/styles`：设计 tokens、布局、聊天、组件和响应式样式。

## 数据流

```text
Component → Query/Mutation hook → chatApi → apiClient → HTTP
                                                     ├─ MSW（开发演示）
                                                     └─ 真实后端（环境切换）
```

Bot 摘要与会话消息分开请求；消息按 Bot ID 缓存。发送、上传、表情、删除和拖拽支持乐观更新，失败时回滚并提示。页面包含加载与错误重试状态。

## 局域网远程访问

```bash
npm run dev:remote
```

访问 `http://mac-mini-1002:4173`。该模式监听 `0.0.0.0`、允许 `mac-mini-1002`，并通过 Node HTTP middleware 复用 `src/api/mock/handlers.ts`，不依赖 Service Worker，因此无需 HTTPS 或证书。

## 接入真实后端

复制 `.env.example` 为 `.env`：

```env
VITE_USE_MOCKS=false
VITE_API_BASE_URL=https://api.example.com
```

真实服务需要实现 `src/api/chatApi.ts` 中的 endpoints，并满足 `src/api/contracts.ts` 的响应契约。页面组件无需改动。

## Mock 数据

MSW 使用 `moss.enterprise.mock-db.v1` 持久化当前应用的演示数据，刷新后保留。上传文件限制为 2 MB。输入 `模拟失败` 可验证 503、乐观更新回滚和草稿恢复。
