# Supabase 数据库健康检查

RBook 使用 `.github/workflows/supabase-health.yml` 定时查询 Supabase Data API，降低 Free Plan 项目因为数据库活动过低而进入暂停候选状态的概率。

## 执行时间

工作流每天执行两次：

- `01:17 UTC`
- `13:17 UTC`

同时支持在 GitHub 仓库的 **Actions → Supabase Database Health → Run workflow** 中手动执行。

## 检查内容

工作流会：

1. 从仓库的 `.env.production` 读取 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。
2. 请求 `rest/v1/notes?select=id&limit=1`，产生一次真实数据库只读查询。
3. 对网络错误自动重试三次。
4. 校验 HTTP 状态码和 JSON 响应类型。
5. 将检查时间、状态码和采样行数写入 GitHub Actions Summary。

Publishable Key 是前端公开密钥，工作流不会使用 Supabase Secret Key、Service Role Key 或数据库密码。

## 失败处理

健康检查失败时：

1. 打开 GitHub 仓库的 **Actions** 页面。
2. 查看 `Supabase Database Health` 的失败日志和 HTTP 状态码。
3. 在 Supabase Dashboard 检查项目是否处于 Paused、Restoring 或 Unhealthy 状态。
4. 恢复项目后，手动运行工作流进行验证。

## 限制

Supabase Free Plan 是否暂停由平台综合判断。定时查询可以保持数据库活动，但不等同于付费套餐的可用性保证。

GitHub 对公共仓库还有一项限制：如果仓库连续 60 天没有任何仓库活动，计划任务可能被自动停用。长期不修改项目时，应定期检查 Actions 页面是否仍显示下一次计划运行，或手动重新启用该工作流。
