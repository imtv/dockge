# imtv branch — Dockge + DockerCopilot-style image updates

This branch adds image update checks and image management on top of upstream Dockge.
Designed for easy rebase/merge from `https://github.com/louislam/dockge`.

## Features

1. **Stack list update badge** — when a compose stack uses an image whose registry digest differs from the local RepoDigest, an orange **Update** badge appears next to the stack name.
2. **Stack detail** — the existing **Update** button is highlighted when `hasUpdate` is true (still runs `docker compose pull` + `up -d`).
3. **Images page** (`/images`) — list local images, delete unused ones, prune dangling/unused, and manually check for registry updates.

## New files (safe for upstream sync)

| Path | Role |
|------|------|
| `backend/image-update-checker.ts` | Registry digest check + stack mapping |
| `backend/image-manager.ts` | list / remove / prune images |
| `frontend/src/pages/Images.vue` | Images UI |

## Touched upstream files (minimal hooks)

Search for `imtv` comments when resolving merge conflicts:

- `backend/dockge-server.ts` — inject `hasUpdate` into stack list; 3‑hour cron
- `backend/agent-socket-handlers/docker-socket-handler.ts` — socket events + clear flag after update
- `frontend/src/components/StackListItem.vue` — badge
- `frontend/src/components/StackList.vue` — check-updates button
- `frontend/src/pages/Compose.vue` — highlight update button
- `frontend/src/router.ts` — `/images` route
- `frontend/src/layouts/Layout.vue` — nav link
- `frontend/src/lang/en.json`, `zh-CN.json` — strings

## Sync upstream later

```bash
git fetch origin
git merge origin/master
# or: git rebase origin/master
# resolve conflicts; keep imtv-marked blocks
```

## Socket events

- `getImageList`
- `removeImage` / `removeImages`
- `pruneImages`
- `checkImageUpdates`
- `getImageUpdateStatus`

Stack list items include `hasUpdate: boolean`.
