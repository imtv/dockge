# imtv — Dockge 定制分支工作流

基于官方 [louislam/dockge](https://github.com/louislam/dockge)，增加镜像更新检查与镜像管理。  
本文件记录 **日常开发 / 发布 / 同步上游** 流程，避免遗忘。

---

## 仓库与镜像

| 项 | 值 |
|----|-----|
| 代码仓库 | https://github.com/imtv/dockge |
| 开发分支 | `imtv`（主控全功能） |
| 代理分支 | `imtv-lite`（远程机仅 agent） |
| 官方上游 remote | `upstream` → `https://github.com/louislam/dockge.git` |
| 自己的 remote | `origin` → `https://github.com/imtv/dockge.git` |
| 主控镜像 | `ghcr.io/imtv/dockge:imtv` |
| 代理镜像 | `ghcr.io/imtv/dockge:imtv-lite` |
| 构建 Action | `.github/workflows/ghcr-build.yml`（push `imtv` / `imtv-lite` 触发） |

---

## 功能一览

1. **Compose 列表**：有更新时名称旁橙色「有更新」徽章；**右侧显示端口**  
2. **Stack 详情**：原版 Update 按钮高亮；仍执行 `docker compose pull` + `up -d`  
3. **镜像页** `/images`：按主机/代理机 **分块列表**（不合并）；筛选 / 删除 / 清理 / 检查更新  
4. **定时检查**：启动时一次 + 每 **3 小时**（`0 */3 * * *`）；**每台机器自查**，主控不替代理机扫 registry  
5. **编辑体验**：柔和主题、蓝灰底 `#2d2f3f`、不写空 `networks: {}`  
6. **imtv-lite**：远程机只开代理端口 + env 账号，等主控连接  

---

## imtv-lite（远程代理机）

适用：多台机器，只在一台跑完整面板，其它机器当 agent。

| 对比 | 主控 `imtv` | 代理 `imtv-lite` |
|------|-------------|------------------|
| 镜像 | `ghcr.io/imtv/dockge:imtv` | `ghcr.io/imtv/dockge:imtv-lite` |
| Web | 完整 UI | 简易状态页 + 仍可走 socket |
| 账号 | Web Setup 或已有库 | compose 环境变量预置 |
| 镜像更新检查 | 本机 | 本机（结果经 agent 推到主控） |
| 谁连谁 | 主控 **主动连接** 代理 | 等待被连接 |

### 代理机 compose 示例

见仓库根目录 `compose.lite.yaml`：

```yaml
services:
  dockge-lite:
    image: ghcr.io/imtv/dockge:imtv-lite
    restart: unless-stopped
    ports:
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
      - /opt/stacks:/opt/stacks
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_LITE=1
      - DOCKGE_USERNAME=agent
      - DOCKGE_PASSWORD=change-me-now
      - DOCKGE_AGENT_NAME=node-2
```

| 环境变量 | 说明 |
|----------|------|
| `DOCKGE_LITE=1` | 开启 lite 模式 |
| `DOCKGE_USERNAME` | 主控添加代理时用的用户名 |
| `DOCKGE_PASSWORD` | 密码（≥6 位；启动时会与库同步，可改 compose 后 recreate 轮换） |
| `DOCKGE_AGENT_NAME` | 主机显示名 / primaryHostname（**不是**监听地址） |
| `DOCKGE_HOSTNAME` | HTTP **监听 bind**（可选；lite 默认 `0.0.0.0`） |
| `DOCKGE_PORT` | 端口，默认 5001 |

### 主控添加代理

1. 代理机：`docker compose -f compose.lite.yaml up -d`  
2. 主控 Dockge → **设置 → Dockge Agents**  
3. 填写：`http://代理机IP:5001` + 上面的用户名密码 + 显示名  
4. 连接成功后，主控列表会出现该机 stacks；镜像页按主机分块  

### 发布 lite 镜像

```bash
git checkout imtv-lite
# ... 修改 ...
git push origin imtv-lite
# Actions 构建 ghcr.io/imtv/dockge:imtv-lite
```


### 端口显示规则

| 网络模式 | 数据来源 |
|----------|----------|
| bridge 等（有 publish） | 容器 `NetworkSettings.Ports` 的 **主机端口** |
| `network_mode: host` | 镜像/容器 **EXPOSE**（`Config.ExposedPorts`）；旁标 `host` |  

---

## 日常：改代码 → 推送 → 出镜像

```bash
cd /opt/apps/dockge   # 或你的工作目录
git checkout imtv
# ... 修改 ...

git add -A
git status             # 确认不要提交 temp.md / token
git commit -m "说明改动"

# 推送到 GitHub（需有 token 或 gh auth）
git push origin imtv
```

推送 `imtv` 后 **自动触发** GHCR 构建（也可用 Actions 页手动 `workflow_dispatch`）。

构建成功后更新本机：

```bash
docker compose pull
docker compose up -d
```

镜像标签示例：

- `ghcr.io/imtv/dockge:imtv`
- `ghcr.io/imtv/dockge:<branch>`
- `ghcr.io/imtv/dockge:<short-sha>`

若 pull 失败，到 package 设置公开可见性：  
https://github.com/users/imtv/packages/container/package/dockge  

### Compose 示例

```yaml
services:
  dockge:
    image: ghcr.io/imtv/dockge:imtv
    restart: unless-stopped
    ports:
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
      - /opt/stacks:/opt/stacks
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      # 可选：顶栏 Console（容器内 shell，非宿主机终端）
      # - DOCKGE_ENABLE_CONSOLE=true
```

---

## 同步官方上游

```bash
git fetch upstream
git checkout imtv
git merge upstream/master
# 或: git rebase upstream/master

# 冲突时搜索 imtv 注释，保留定制块
rg "imtv" -n backend frontend
```

### 新增文件（冲突少）

| 路径 | 作用 |
|------|------|
| `backend/image-update-checker.ts` | 仓库 digest 检查 + stack 映射 |
| `backend/image-manager.ts` | 镜像 list / remove / prune |
| `backend/stack-ports.ts` | 按 compose 项目收集端口 |
| `frontend/src/pages/Images.vue` | 镜像页 |
| `frontend/src/utils/editor-appearance.ts` | 编辑器外观 |
| `.github/workflows/ghcr-build.yml` | 推 GHCR |
| `IMTV.md` | 本工作流说明 |

### 改动过的上游文件（合并时注意）

搜索 `imtv`：

- `backend/dockge-server.ts` — `hasUpdate`、3h cron  
- `backend/agent-socket-handlers/docker-socket-handler.ts` — 镜像相关 socket  
- `frontend/src/components/StackListItem.vue` — 徽章  
- `frontend/src/pages/Compose.vue` — Update 高亮、模板、networks  
- `frontend/src/components/NetworkInput.vue` — 不写空 networks  
- `frontend/src/router.ts` / `layouts/Layout.vue` — `/images`  
- `frontend/src/lang/en.json`、`zh-CN.json`  
- `frontend/src/styles/main.scss` — 编辑器 focus 等  

---

## Socket 事件（镜像）

| 事件 | 说明 |
|------|------|
| `getImageList` | 镜像列表 + checkStatus |
| `removeImage` / `removeImages` | 删除 |
| `pruneImages` | prune（参数 danglingOnly） |
| `checkImageUpdates` | 强制检查 registry |
| `getImageUpdateStatus` | 检查状态 |

Stack 列表项含 `hasUpdate: boolean`。

---

## 本地开发（可选）

```bash
npm install --ignore-scripts   # 若 node-pty 编译失败
npm run dev                    # 前端 + 后端
# 需要本机 docker CLI 与权限
```

类型检查：

```bash
npx tsc --noEmit
```

---

## 安全备忘

- **不要**把 GitHub token 提交进仓库（`temp.md` 已在 `.gitignore`）  
- 临时 PAT 用完即撤销  
- Console（`DOCKGE_ENABLE_CONSOLE`）进的是 **Dockge 容器 shell**，因挂了 docker.sock，仍可操作主机 Docker  

---

## 检查频率

- 启动：立即检查一次  
- 定时：每 3 小时  
- 手动：镜像页「检查镜像更新」  
- Stack Update 成功后：清标记并异步再检查  

---

## 快速对照：别搞混的终端

| 入口 | 是什么 |
|------|--------|
| 顶栏 Console | Dockge **容器内** bash（需 env 开启） |
| Stack 日志终端 | `compose logs` |
| 服务终端 | `compose exec` 进服务容器 |
