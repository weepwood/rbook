# RBook

RBook 是一个以图片笔记、真实经验和兴趣发现为核心的社区平台。前端采用响应式瀑布流，后端使用 Supabase PostgreSQL、Auth、Storage、Edge Functions 与 Row Level Security。

线上地址：`https://rrrrbook.netlify.app`

## 已实现

### 内容与社区

- 响应式首页、发现页和话题筛选
- 标题与正文关键词搜索
- 图文笔记发布，单篇最多 9 张图片
- 笔记详情、图片轮播和完整正文
- 点赞与取消点赞
- 收藏与取消收藏
- 评论、回复和本人删除评论
- 笔记与评论举报
- 点赞、评论、关注通知
- 个人笔记、收藏和赞过的内容列表

### 用户与权限

- 邮箱密码注册、邮箱确认与登录
- 用户资料编辑
- 普通用户、审核员、管理员三级权限
- 启用和停用账号
- 停用账号同时限制登录和社区写操作
- 最后活跃时间记录
- 第一个注册账号自动成为初始管理员

### 管理后台

管理员登录后可访问 `/admin`：

- 用户总数、公开笔记、评论数、待处理举报
- 今日访问量与独立会话
- 近 14 日访问趋势
- 热门页面排行
- 最近访问日志
- 用户角色与账号状态管理
- 举报处理、内容隐藏与驳回
- 管理员操作审计日志

访问日志通过 Supabase Edge Function 采集。系统只保存脱敏 IP 网段，不保存完整 IP 地址，并限制为正式站点、本地开发地址和 Netlify 预览域名调用。

### 数据与安全

- 所有业务表启用 Row Level Security
- 用户只能修改自己的内容
- 审核员可以处理内容和举报
- 管理员接口再次校验 JWT、角色和账号状态
- Secret Key 和 Service Role Key 仅在 Edge Function 中使用
- 图片上传按用户目录隔离
- 内部触发器函数禁止通过 PostgREST RPC 直接调用
- 关键外键与后台查询已建立索引

## 技术栈

- React 19 + TypeScript + Vite
- React Router
- Supabase JS
- PostgreSQL + RLS
- Supabase Auth
- Supabase Storage
- Supabase Edge Functions
- Netlify
- 原生 CSS，无 TailwindCSS

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

环境变量：

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
VITE_SITE_URL=http://localhost:5173
```

没有填写 Supabase 环境变量时，首页会使用内置演示数据。

## 初始化 Supabase

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy track-access --no-verify-jwt
supabase functions deploy admin-console
```

迁移会创建或扩展：

- `profiles`
- `notes`
- `note_media`
- `likes`
- `favorites`
- `comments`
- `follows`
- `user_access`
- `notifications`
- `content_reports`
- `access_logs`
- `admin_audit_logs`
- `note-media` Storage Bucket

Edge Functions：

- `track-access`：记录匿名和登录用户的页面访问，使用来源白名单、短时间去重和 IP 脱敏。
- `admin-console`：提供受管理员权限保护的用户、统计、举报和审核接口。

前端只使用 Publishable Key。不要把 Secret Key 或 Service Role Key 放进前端环境变量或 Git 仓库。

## Supabase Auth 配置

正式环境建议设置：

```text
Site URL
https://rrrrbook.netlify.app

Redirect URLs
https://rrrrbook.netlify.app/**
http://localhost:5173/**
```

生产环境还应启用泄露密码保护，并配置自有 SMTP 服务，避免依赖 Supabase 的测试邮件额度。

## 构建

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

## 后续路线

- 关注流和个性化推荐
- 视频笔记、转码与封面抽帧
- Realtime 即时通知
- 敏感内容自动检测
- PWA 与移动端手势
- 访问日志按日汇总和长期归档

## License

MIT
