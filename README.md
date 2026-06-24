# Hot100 复习计划

一个自部署的 LeetCode Hot100 复习网站。它会同步 `leetcode.cn` 的 Hot100 AC 状态，并按遗忘曲线安排旧题重测、到期复习和新题推进。

## 本地运行

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:init
npm run db:seed
npm run dev
```

打开 `http://localhost:3000`，当前版本无需登录密码。

## Netlify 预览部署

仓库已经包含 `netlify.toml`，Netlify 会按 Next.js 项目构建：

```bash
npm run db:generate && npm run build
```

注意：Netlify 没有适合 SQLite 的持久本地磁盘，所以它只适合作为临时预览或 UI 演示环境。真实刷题数据、Cookie、同步记录和复习计划不建议放在 Netlify 上长期使用。

推荐 Netlify 用法：

```bash
npx netlify status
npx netlify link
npx netlify deploy
```

如果要发布生产预览：

```bash
npx netlify deploy --prod
```

当前已创建的 Netlify 站点：

- Site URL: `https://leecode-hot100-jm2482-20260624.netlify.app`
- Admin URL: `https://app.netlify.com/projects/leecode-hot100-jm2482-20260624`

如果在 Windows 本地执行 `netlify build/deploy` 遇到 symlink 权限错误，建议直接在 Netlify 后台连接 GitHub 仓库，让 Netlify 云端 Linux 环境构建。

## 服务器正式部署

正式使用建议通过 GitHub 拉取代码到服务器，用 Docker Compose 运行。SQLite 数据会保存在服务器本地 Docker volume 中，不会提交到 GitHub。

```bash
git clone https://github.com/JiaMingXu2482/Leecode.git
cd Leecode
cp .env.example .env
# 修改 .env 中的 SESSION_SECRET
docker compose up -d --build
```

SQLite 数据库保存在 Docker volume `leetcode-review-data` 中，重启或更新代码不会丢数据。

## 后续更新

本地改完并推到 GitHub 后，在服务器执行：

```bash
git pull
docker compose up -d --build
```

## 力扣同步

1. 在浏览器登录 `leetcode.cn`。
2. 从浏览器开发者工具复制当前登录 Cookie。
3. 在网站的“力扣同步”页面粘贴 Cookie 并点击同步。

网站不会保存力扣账号密码，只保存你手动提供的 Cookie。Cookie 过期后重新粘贴即可。

## 常用命令

```bash
npm test
npm run lint
npm run build
npm run db:init
npm run db:seed
```
