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

打开 `http://localhost:3000`，使用 `.env` 里的 `APP_PASSWORD` 登录。

## 服务器部署

```bash
git clone https://github.com/你的用户名/leetcode-review-planner.git
cd leetcode-review-planner
cp .env.example .env
# 修改 .env 中的 APP_PASSWORD 和 SESSION_SECRET
docker compose up -d --build
```

SQLite 数据库保存在 Docker volume `leetcode-review-data` 中，不会提交到 GitHub。

## 更新部署

```bash
git pull
docker compose up -d --build
```

## 力扣同步

1. 在浏览器登录 `leetcode.cn`。
2. 从浏览器开发者工具复制当前登录 Cookie。
3. 在网站的「力扣同步」区域粘贴 Cookie 并点击同步。

网站不会保存力扣账号密码，只保存你手动提供的 Cookie。Cookie 过期后重新粘贴即可。

## 常用命令

```bash
npm test
npm run lint
npm run build
npm run db:init
npm run db:seed
```
