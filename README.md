# Hot100 复习计划

一个自部署的刷题管理站。按遗忘曲线安排复习，同时管理三个题库的新题推进。

改动历史见 [CHANGELOG.md](CHANGELOG.md)。

## 功能

- **三个题库**：LeetCode Hot100（同步 `leetcode.cn` 的 AC 状态）、牛客华为机试 HJ1–108、塔子哥「一周速成题单」（CodeFun2000）。题号段互不重叠，进度分开统计。
- **排题**：每日新题配额 + 时间预算，复习按艾宾浩斯到期日；也可切成「考点匹配」模式，让当天的 Hot100 复习跟着当天新题的考点走。支持休息日、欠账限量、手动拖动优先。
- **笔记**：每次做题记反馈分（0 = AC 快 … 5 = 陌生）、解题思路和 C++ 语法两栏；另有独立的**算法总结**页做跨题的 Markdown 笔记，正文里的题号会自动链到题目详情页。
- **计划助手**：DeepSeek 函数调用，可以直接改计划。

## 本地运行

```bash
npm install
cp .env.example .env
# 修改 .env 中的 SESSION_SECRET、SYNC_SECRET 和 APP_PASSWORD
npm run db:generate
npm run db:init
npm run db:seed
npm run dev
```

打开 `http://localhost:3000`，首次进入会跳转到登录页，输入 `.env` 里 `APP_PASSWORD` 设置的访问密码即可进入。

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
# 修改 .env 中的 SESSION_SECRET、SYNC_SECRET 和 APP_PASSWORD
docker compose up -d --build
```

SQLite 数据库保存在 Docker volume `leetcode-review-data` 中，重启或更新代码不会丢数据。

## 后续更新

如果服务器能访问 GitHub，本地推完之后在服务器执行：

```bash
git pull
docker compose up -d --build
```

**如果服务器访问不了 GitHub**（当前这台就是这样），改用 git bundle 走 SSH 送过去：

```bash
# 本地
git bundle create update.bundle main
scp update.bundle 服务器:/tmp/update.bundle

# 服务器
cd /root/Leecode
git fetch /tmp/update.bundle main:refs/remotes/bundle/main
git merge --ff-only refs/remotes/bundle/main
docker compose up -d --build
```

数据库结构变更由 `scripts/init-db.ts` 在容器启动时自动应用，都是幂等语句
（`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN` 吞掉重复列错误），
不会动已有数据。

## 力扣同步

1. 在浏览器登录 `leetcode.cn`。
2. 从浏览器开发者工具复制当前登录 Cookie。
3. 在网站的“力扣同步”页面粘贴 Cookie 并点击同步。

同步会保存 Hot100 的 AC 状态、提交画像，并优先保存最近 AC 代码和最近一次提交代码。网站不会保存力扣账号密码，只保存你手动提供的 Cookie。Cookie 过期后重新粘贴即可。

### 服务器自动同步

在服务器 `.env` 中配置 `SYNC_SECRET` 后，可以用 cron 每天触发一次同步：

```bash
curl -fsS -X POST "http://127.0.0.1:3000/api/sync/leetcode-cn/cron?secret=你的_SYNC_SECRET"
```

## 常用命令

```bash
npm test
npm run lint
npm run build
npm run db:init
npm run db:seed
```
