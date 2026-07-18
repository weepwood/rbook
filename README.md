# RBook

一个以图片笔记、真实经验和兴趣发现为核心的社区平台。界面采用响应式瀑布流，后端使用 Supabase 的 PostgreSQL、Auth、Storage 与 Row Level Security。

## 已实现

- 响应式首页与发现页瀑布流
- 话题筛选、全文关键词搜索
- 邮箱密码注册与登录
- 图文笔记发布，最多 9 张图片
- 点赞、收藏与评论数据模型
- 用户资料、关注关系与计数触发器
- Supabase Storage 图片上传与公开访问
- 完整 RLS 策略，限制用户只能修改自己的内容
- 未配置 Supabase 时自动进入演示模式
- Netlify SPA 路由配置
- GitHub Actions 类型检查与构建

## 技术栈

- React 19 + TypeScript + Vite
- React Router
- Supabase JS
- PostgreSQL + RLS
- Supabase Auth
- Supabase Storage
- 原生 CSS，无 TailwindCSS

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

`.env`：

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
```

没有填写环境变量时，应用会使用内置演示数据，便于先查看界面。

## 初始化 Supabase

迁移文件位于：

```text
supabase/migrations/202607180001_init_rbook.sql
```

使用 Supabase CLI：

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

迁移会创建：

- `profiles`
- `notes`
- `note_media`
- `likes`
- `favorites`
- `comments`
- `follows`
- `note-media` Storage bucket
- 用户注册触发器、计数触发器、索引与 RLS 策略

前端仅使用 Publishable Key。不要把 Secret Key 或 Service Role Key 放入前端环境变量。

## 构建

```bash
npm run typecheck
npm run build
npm run preview
```

## 后续路线

1. 笔记详情页、评论回复与图片轮播
2. 个性化推荐：关注流、兴趣标签与行为权重
3. 视频笔记与转码处理
4. 举报、内容审核和管理后台
5. Realtime 消息通知
6. Edge Functions 生成缩略图和敏感内容检测
7. PWA 与移动端手势体验

## License

MIT
