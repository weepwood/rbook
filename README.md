# RBook

RBook 是一个以图片笔记、真实经验和兴趣发现为核心的社区平台。前端采用 React、TypeScript 与响应式瀑布流，后端使用 Supabase PostgreSQL、Auth、Storage、Edge Functions 与 Row Level Security。

线上地址：`https://rrrrbook.netlify.app`

## 产品闭环

### 内容发现

- `/`：个性化推荐首页，支持“推荐、关注、最新”三种信息流
- `/explore`：话题发现与关键词搜索
- `/note/:noteId`：可复制、分享和直接访问的笔记详情页
- `/user/:username`：公开创作者主页
- 推荐理由展示：关注作者、兴趣匹配、社区热门、新鲜内容
- 相关推荐：结合标签重合、作者关系、互动热度和内容新鲜度

### 笔记详情

- 多图查看、缩略图切换与页码
- 完整正文、标签、位置、发布时间和浏览量
- 点赞、收藏、分享、举报
- 关注或取消关注作者
- 相关推荐列表
- 浏览、停留、点赞、收藏、评论、分享和关注行为采集

### 评论系统

- 主评论和多级回复归并为讨论线程
- 最热与最新排序
- 评论点赞与取消点赞
- 回复、编辑本人评论、删除本人评论
- 评论举报与后台审核
- 回复折叠、展开和评论分页加载
- 评论与回复数量由数据库触发器维护

### 用户中心

- 邮箱注册、邮箱确认、登录和退出
- 头像上传，限制 JPEG、PNG、WebP、AVIF 和 5MB
- 编辑昵称、用户名、简介和所在地
- 我的笔记、收藏、赞过、评论过
- 公开主页预览
- 关注与粉丝列表
- 公开创作者主页与关注关系
- 普通用户、审核员、管理员三级权限
- 启用与停用账号

### 通知与管理

- 点赞、评论、关注通知
- `/admin` 管理后台
- 用户角色与账号状态管理
- 内容举报、隐藏和审核
- 用户、笔记、评论、访问量与独立会话统计
- 近 14 日访问趋势、热门页面和最近访问日志
- 管理员操作审计

## 推荐算法

推荐排序运行在 PostgreSQL 中，由 `get_personalized_note_ids` 返回排序后的笔记 ID 和推荐理由。

主要信号：

1. **兴趣匹配**：根据用户对笔记标签的浏览、停留和互动累计兴趣分数。
2. **社交关系**：提高已关注作者内容的排序权重。
3. **互动质量**：综合点赞、收藏、评论和浏览量，收藏与评论权重更高。
4. **内容新鲜度**：新内容获得时间衰减加分。
5. **作者多样性**：同一作者连续出现过多时进行降权。
6. **稳定探索**：加入确定性轻微扰动，让排序保持稳定同时保留内容探索空间。

行为权重保存在 `user_tag_preferences`，原始事件保存在 `content_events`。匿名用户使用浏览器会话 ID，登录用户会逐步形成自己的标签偏好。事件写入受 RLS 限制，兴趣更新由不可直接调用的数据库触发器完成。

## 数据库结构

主要表：

- `profiles`
- `notes`
- `note_media`
- `likes`
- `favorites`
- `comments`
- `comment_likes`
- `follows`
- `content_events`
- `user_tag_preferences`
- `user_access`
- `notifications`
- `content_reports`
- `access_logs`
- `admin_audit_logs`

Storage Buckets：

- `note-media`：笔记图片
- `avatars`：用户头像

所有业务表启用 Row Level Security。前端只使用 Publishable Key；Secret Key 和 Service Role Key 仅在受保护的 Edge Function 中使用。

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

没有填写 Supabase 环境变量时，部分首页内容会使用内置演示数据。

## 初始化 Supabase

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy track-access --no-verify-jwt
supabase functions deploy admin-console
```

前端推荐、评论互动、头像存储和用户关系所需结构均已写入 `supabase/migrations`。

## Supabase Auth 配置

```text
Site URL
https://rrrrbook.netlify.app

Redirect URLs
https://rrrrbook.netlify.app/**
http://localhost:5173/**
```

生产环境建议在 Supabase Dashboard 中启用泄露密码保护，并配置自有 SMTP 服务。

## 构建

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

Netlify 使用独立的 Vite 生产打包命令；完整 TypeScript 检查和 ESLint 检查保留在 CI 与本地构建流程中。

## 后续路线

- 视频笔记、转码与封面抽帧
- Realtime 即时通知和私信
- 敏感内容与图片自动检测
- PWA、离线草稿和移动端手势
- 推荐系统 A/B 测试与曝光去重
- 访问日志按日汇总和长期归档

## License

MIT