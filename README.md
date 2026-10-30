# 我的导航 · 个人书签站

一个本地优先（local-first）的个人书签导航站。界面参考当下流行的导航类网站：深色玻璃拟态 + 浅色极简双主题、卡片网格、命令面板、拖拽排序。

**核心设计：本地瞬开，云端兜底。**
所有读写都先打本地 IndexedDB，所以界面永远是瞬开的、断网也能用；云端同步是异步旁路，挂了不影响使用，恢复后自动补上。

```
浏览器                                   Cloudflare
┌──────────────────────────┐            ┌───────────────────────┐
│  Vue 3 UI                │            │  Pages（静态资源）     │
│     ↕ 瞬时读写            │            │     ↕                 │
│  Dexie / IndexedDB  ←─────┼─ 异步同步 ─→│  Pages Functions      │
│  （真正的数据源）          │            │     ↕                 │
└──────────────────────────┘            │  D1 (SQLite)          │
                                        └───────────────────────┘
```

---

## 功能

**书签管理**

- 增删改查；软删除 + 回收站 + 删除后可一键撤销
- 分类（emoji 图标 + 强调色）、标签、置顶
- 拖拽排序：分类内调整顺序、拖到左侧分类上直接移动、分类本身也能拖着重排
- 多选：批量移动 / 批量删除
- 批量添加：一行一个链接，支持 `https://…`、`标题 | https://…`、`[标题](https://…)` 三种写法

**查找**

- 顶部搜索框：模糊匹配标题 / 域名 / 地址 / 描述 / 标签，并按相关度排序
- 本地搜不到时按 `Enter` 直接丢给搜索引擎（必应 / 百度 / Google / GitHub / 知乎 / MDN / npm / 豆瓣，可切换）
- `Ctrl/Cmd + K` 命令面板：一个框同时搜书签和操作，上下键选、回车执行
- 标签筛选、智能视图（全部 / 置顶 / 最近添加 / 最常访问）
- 侧边栏随滚动高亮当前分类

**图标**（导航站最容易做砸的地方，这里做了四级降级，保证不出破图）

1. 用户自定义：emoji / 图片地址 / 上传图片（存 dataURL）
2. 后端代理 `/api/icon`：服务端依次尝试多个图标源，命中后在 Cloudflare 边缘缓存 30 天
3. 浏览器直连多个公开图标源（纯静态部署时自动接手）
4. 全失败 → 按域名生成稳定的渐变色块 + 首字母

成功的地址按域名缓存进 IndexedDB，30 天内不再重跑整条链。

**其它**

- 添加书签时点「自动获取信息」，由服务端抓取目标站的标题 / 描述 / 图标（浏览器跨域抓不到，所以放服务端）
- 双主题（深色玻璃拟态 / 浅色极简）+ 跟随系统，6 套强调色，3 种卡片密度，极光 / 纯色 / 自定义图片背景
- 导入导出：JSON 完整备份；**Chrome / Edge / Firefox 导出的书签 HTML 可直接导入**；也能导出成 HTML 导回浏览器
- **智能整理**：按网站功能自动归类（开发 / AI 工具 / 设计 / 效率 / 云服务运维 / 求职考公 / 学习阅读 / 影音娱乐 / 资讯社区），
  原文件夹层级转成标签保留，不丢信息；纯本地规则引擎，不联网不花钱；**执行前可逐条预览和调整**
- 键盘快捷键（按 `?` 查看）
- 可安装为 PWA
- 请求浏览器持久化存储，避免 IndexedDB 被自动清理

---

## 本地开发

```bash
npm install
npm run dev          # http://localhost:5173
```

`npm run dev` 会同时启动一个**本地 API 模拟层**（`dev-server/api-plugin.ts`），实现和 Cloudflare Functions 完全相同的接口契约，数据落在 `.dev-data/db.json`。所以本地就能完整体验同步、自动抓标题、图标代理，不用每次都跑 wrangler。

- 本地默认密码：`admin`（可用 `.env` 里的 `APP_PASSWORD` 覆盖，参考 `.env.example`）
- 想验证真实 Workers 运行时：`npm run cf:dev`

其它命令：

```bash
npm run build        # 类型检查 + 产物构建
npm run typecheck    # 前端 + Workers 两套 tsconfig 都检查
```

---

## 部署到 Cloudflare Pages（推荐）

全程免费，且**同域**——网站能打开，同步就能用，不存在跨域问题，也不用多担心一个域名被墙。

> 📘 要绑自定义域名 `qiyue-bookmark.indevs.in`（Stackryze 注册）的话，
> 看 **[DEPLOY.md](./DEPLOY.md)** —— 那里是针对该域名写的完整步骤，
> 包含当前 lame delegation 问题的解法和各种排查。

### 1. 建 D1 数据库

```bash
npx wrangler login
npx wrangler d1 create qiyue-bookmark-db
```

把输出里的 `database_id` 填进 `wrangler.toml` 的 `REPLACE_WITH_YOUR_D1_DATABASE_ID`。

```bash
npm run db:init:remote    # 建表（可选，后端首次写入时会自动建）
```

### 2. 部署

**方式 A：命令行**

```bash
npm run cf:deploy
```

**方式 B：连 Git（push 即部署）**

在 Cloudflare 后台 → Workers & Pages → Create → Pages → 连接你的仓库，构建设置：

| 项 | 值 |
| --- | --- |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |

然后在项目的 **Settings → Bindings** 里加一个 D1 绑定：变量名 `DB`，选 `qiyue-bookmark-db`。

> ⚠️ **两种方式二选一，而且选了就改不了。**
> 用方式 A 创建的项目属于 Direct Upload 模式，**之后无法转成 Git 集成**（Cloudflare 的硬限制），
> push 代码不会触发任何部署，只能继续用 `npm run cf:deploy` 手动发版。
> 想要 push 自动部署，就必须一开始走方式 B。

### 3. 设访问密码

```bash
npx wrangler pages secret put APP_PASSWORD
npm run cf:deploy    # ⚠️ secret 要重新部署才生效
```

或在后台 **Settings → Variables and Secrets** 里加密保存。

| 变量 | 说明 |
| --- | --- |
| `APP_PASSWORD` | **必填**。解锁编辑与同步的密码 |
| `AUTH_SECRET` | 可选。签 token 的密钥，不填则由密码派生 |
| `PUBLIC_READ` | `1`（默认）访客可浏览但不能改；`0` 不输密码什么都看不到 |
| `CORS_ORIGINS` | 同域部署留空。前后端分离部署时填前端域名 |

### 4. 用起来

打开站点 → 左下角「本地模式/未解锁」→ 设置 → 同步 → 输入密码解锁。之后所有改动会在 3 秒后自动推送，换设备打开时自动拉取合并。

---

## 部署到 Render

```bash
# 仓库里已有 render.yaml，在 Render 后台 New → Blueprint 选中仓库即可
```

⚠️ **Render 的 Static Site 跑不了 `functions/` 下的代码**，所以部署到 Render 后应用会自动进入**纯本地模式**：

- ✅ 全部界面功能、离线使用、导入导出都正常
- ❌ 没有多设备同步、没有自动抓取标题、图标改走浏览器直连

想要同步的话，要么直接用 Cloudflare Pages，要么前端放 Render、后端放 Cloudflare（在 Cloudflare 侧把 `CORS_ORIGINS` 设成 Render 域名）。

---

## 关于国内访问

说实话的版本：

| 方案 | 免费 | 国内直连 | 备注 |
| --- | --- | --- | --- |
| Cloudflare Pages（`*.pages.dev`） | ✅ 静态流量不限量 | 🟡 多数地区能直连，速度一般，个别地区有污染 | 本项目首选 |
| Render（`*.onrender.com`） | ✅ 静态站点免费 | 🟡 能访问但较慢 | 没有后端能力 |
| **Cloudflare Pages + 自己的域名** | ✅ | 🟢 最稳 | 域名几十块一年，强烈建议 |

绑自己的域名是性价比最高的一步：走 Cloudflare 的 anycast，而且不会被 `pages.dev` 这种「整体域名」级别的拦截波及。具体步骤见 **[DEPLOY.md](./DEPLOY.md)**。想要极致速度就得备案 + 国内 CDN，那是另一个量级的折腾了。

**免费额度**（个人书签站完全用不完）：

- 静态资源请求和带宽：不限量
- Pages Functions：10 万次/天 —— 本项目用 `public/_routes.json` 把 Functions 锁定在 `/api/*`，静态资源完全不消耗额度，实际只有同步和抓图标才会计数
- D1：5GB 存储、500 万行读/天、10 万行写/天

---

## 数据与同步

**存储分层**

| 数据 | 存在哪 | 是否同步 |
| --- | --- | --- |
| 书签、分类 | IndexedDB + D1 | ✅ |
| 主题 / 布局 / 背景等偏好 | localStorage | ❌ 刻意不同步——手机想用紧凑布局、台式机想用大卡片，强行统一反而难受 |
| 访问次数 | IndexedDB | ❌ 每台设备各自统计（原因见 `src/db/repo.ts` 里 `recordVisit` 的注释） |
| 图标缓存 | IndexedDB | ❌ 纯缓存，可随时清空 |

**同步算法**：Last-Write-Wins + 墓碑删除 + 增量游标。

- 每条记录带 `updatedAt`；本地记一个 `lastPulledAt` 游标
- 一次同步 = 推送「本地改过的」+ 拉取「服务端变过的」，一次 HTTP 往返搞定双向
- 删除写 `deletedAt` 墓碑而不是物理删，否则删除动作传不到其它设备；墓碑 90 天后由服务端清理
- 冲突判定在 SQL 里原子完成：`WHERE excluded.updatedAt > bookmarks.updatedAt`

**自动同步时机**：本地改动后 3 秒（防抖）、每 5 分钟兜底、标签页重新可见时、关页面前。

**跨标签页**：Dexie 的 `liveQuery` 会把数据库变更广播到同浏览器的所有标签页，不需要刷新。

---

## 项目结构

```
├── functions/api/          Cloudflare Pages Functions（仅 /api/* 走这里）
│   ├── _middleware.ts        CORS + 统一错误处理
│   ├── auth/{login,status}.ts
│   ├── sync.ts               双向同步
│   ├── meta.ts               代抓网页标题/描述/图标
│   └── icon.ts               favicon 多源代理 + 边缘缓存
├── shared/                 前后端共用（模型、鉴权、D1 访问、抓取逻辑）
├── dev-server/             本地开发用的 API 模拟层，契约与线上一致
├── migrations/             D1 建表 SQL
├── src/
│   ├── db/                 Dexie schema、CRUD、liveQuery、导入导出、示例数据
│   ├── sync/engine.ts      同步引擎（LWW 合并）
│   ├── api/client.ts       后端客户端（后端不存在时自动降级）
│   ├── store/              数据 / 视图 / 设置 / 同步 / UI 状态
│   ├── composables/        图标解析、快捷键
│   ├── components/         界面组件
│   ├── utils/              URL、配色、模糊搜索
│   └── styles/main.css     设计系统（双主题 CSS 变量）
├── wrangler.toml           Cloudflare 配置
└── render.yaml             Render 配置
```

---

## 技术选型说明

- **Dexie 而不是裸 IndexedDB**：`liveQuery` 让「写数据库」和「界面更新」自动绑定，跨标签页也生效，省掉一整套状态同步代码
- **没用 Pinia / Vue Router**：单页面 + 模块级 `reactive()` 足够，少两个依赖
- **拖拽用原生 HTML5 Drag & Drop**：不引 sortablejs
- **图标用内联 SVG**：不为十几个图标拉进来几百 KB 的图标库
- **运行时依赖只有 `vue` + `dexie`**，产物约 95 KB（gzip）
