---
type: task
status: verified
waza_spec_version: 0.1.0
created: 2026-05-05
updated: 2026-05-05
owner: user
---

# Task Spec: Game Shelf Drop Four

## Intent

构建 `game-shelf` 的首个可运行版本：外层是小游戏选择页面，当前接入第一个小游戏 `四子棋 / Drop Four`。用户打开项目后先看到游戏列表，选择 `四子棋` 后进入可玩的四连重力棋盘。

这个任务的目标不是只搬运一个独立小游戏，而是建立后续继续添加多个小游戏的基本结构：有清晰的游戏注册表、首页入口、游戏详情/游玩页面和可验证的四子棋玩法。

## Context

项目目录是 `/root/projects/game-shelf`。当前目录为空，不是 git 仓库，也没有前端项目骨架。

相邻目录 `/root/projects/drop-five` 可作为迁移来源。该来源项目虽然目录名和旧 spec 叫 `drop-five`，但当前实现实际是 `Drop Four`：规则常量为 `CONNECT_LENGTH = 4`，UI 文案、README、Vitest 测试和 Playwright E2E 都按四连实现。

2026-05-05 已通过 `/think` 确认：

- 本项目会放很多用户制作的小游戏。
- 外层需要一个选择游戏的页面。
- 当前游戏命名改回 `四子棋 / Drop Four`。
- 当前游戏路径建议为 `/games/drop-four`。
- 不再把产品名或 URL 命名为 `drop-five`。

## Non-Goals

- 不实现账号、登录、云存档、排行榜、后端服务或数据库。
- 不实现联网对战、房间、匹配或 AI 对手。
- 不实现多语言系统；本任务只需要中文首页和中英并存的游戏名。
- 不实现复杂游戏市场、分类、搜索、标签筛选或排序。
- 不实现每个小游戏的独立构建、iframe 沙箱或插件运行时。
- 不迁移 `/root/projects/drop-five/dist`、`node_modules`、`.git` 或历史构建产物。
- 不把四子棋规则抽象成通用棋类引擎。
- 不修改 `/root/.lody`、`/root/.codex`、`/root/.agents` 或其他工具配置。

## Decisions

- 技术栈固定为 `Vite + React + TypeScript + Vitest + Playwright`。
- 项目根应用命名为 `game-shelf`。
- 首页作为默认入口 `/`，展示小游戏选择页面。
- 当前第一个游戏中文名为 `四子棋`，英文名为 `Drop Four`。
- 当前游戏 slug 固定为 `drop-four`，路径固定为 `/games/drop-four`。
- 游戏信息集中维护在一个 registry 中，至少包含 `slug`、中文名、英文名、简介、入口路径和状态。
- 暂不引入 React Router；使用轻量 pathname 路由或等价的最小路由实现即可。
- 四子棋迁移到 `src/games/drop-four/**`，规则纯函数与 UI 组件保持分离。
- 四子棋规则保持当前来源实现：`9x9` 棋盘、玩家 1 先手、点击列落子、连续 4 枚同色棋子获胜。
- 四子棋胜利方向包括横向、纵向、左上到右下、右上到左下。
- 落子动画期间锁定输入；满列点击不切换回合并给出可观察反馈。
- 胜负优先级固定为：如果最后一子同时填满棋盘并形成四连，判定为胜利而不是平局。
- 最低移动端宽度按 `360px` 适配：首页和游戏页都不能横向滚动。

## Implementation Plan

- 初始化 `Vite + React + TypeScript` 项目骨架，配置 `npm run dev`、`npm run build`、`npm test`、`npm run test:e2e`。
- 建立基础目录结构：`src/main.tsx`、`src/App.tsx`、`src/games/registry.ts`、`src/games/drop-four/**`、`tests/**`。
- 实现首页游戏选择页面，展示 `四子棋 / Drop Four` 卡片、简介和进入按钮。
- 实现最小路由：`/` 渲染首页，`/games/drop-four` 渲染四子棋页面，未知路径提供可返回首页的提示。
- 从 `/root/projects/drop-five` 迁移四子棋规则模块、UI 思路、样式思路、Vitest 测试和 Playwright 测试。
- 迁移时移除旧项目名残留：不得在用户可见文案、README 或路径中继续使用 `Drop Five` 作为当前游戏名称。
- 保留四连规则，确保 `CONNECT_LENGTH = 4`，测试和 Playwright 断言也按四连更新。
- 编写项目级 `README.md`，说明这是小游戏合集项目、当前包含 `四子棋 / Drop Four`，并列出运行和验证命令。
- 配置 `.gitignore`，排除 `node_modules`、`dist`、Playwright 报告和测试产物。

## Boundaries

### Allowed Changes

- `specs/**`
- `package.json`
- `package-lock.json`
- `src/**`
- `tests/**`
- `public/**`
- `index.html`
- `vite.config.*`
- `tsconfig*.json`
- `playwright.config.*`
- `.gitignore`
- `README.md`

### Forbidden Changes

- 不新增后端服务、数据库、认证系统或部署脚本。
- 不引入 Next.js、Astro、Svelte、Vue、Phaser、Pixi、Three.js 或其他新框架。
- 不复制 `node_modules`、`dist`、`test-results` 或来源项目 `.git`。
- 不把 `/root/projects/drop-five` 作为运行时依赖；迁移后的 `game-shelf` 必须能独立运行。
- 不扩展实现第二个小游戏。
- 不引入全量路由库，除非实现过程中发现 pathname 路由无法满足已列验收标准，并先修订本 spec。
- 不修改本 spec 边界之外的工具或用户配置目录。

### External Dependencies

- Node.js / `npm`：安装依赖、运行开发服务器、构建和测试。
- `Vite`：前端开发服务器和生产构建。
- `React`：实现首页、路由壳和四子棋 UI。
- `TypeScript`：约束游戏状态、注册表和组件接口。
- `Vitest`：验证四子棋规则纯函数。
- Playwright：验证首页入口、游戏交互和 `360px` 响应式行为。

## Acceptance Criteria

Scenario: Open game shelf home

- Given 用户打开 `/`
- When 页面加载完成
- Then 用户看到小游戏选择页面，并能看到 `四子棋` 和 `Drop Four`

Scenario: Enter Drop Four from home

- Given 用户位于首页
- When 用户选择 `四子棋 / Drop Four`
- Then 页面进入 `/games/drop-four`，并显示四子棋棋盘、当前玩家提示和重开按钮

Scenario: Unknown route can recover

- Given 用户打开一个未知路径
- When 页面加载完成
- Then 用户看到未知页面提示，并能返回首页

Scenario: Start a Drop Four game

- Given 用户进入 `/games/drop-four`
- When 页面加载完成
- Then 用户可以看到 `9x9` 竖向棋盘、当前玩家提示和重开按钮

Scenario: Drop a piece into a column

- Given 某一列仍有空位且轮到玩家 A
- When 玩家 A 选择该列
- Then 玩家 A 的棋子落到该列最低可用空位，并且回合切换到玩家 B

Scenario: Reject a full column

- Given 某一列已经被棋子填满
- When 当前玩家选择该列
- Then 棋盘状态不变，当前玩家不切换，并给出可观察的不可落子反馈

Scenario: Lock input during drop animation

- Given 一枚棋子正在执行下落动画
- When 用户在动画结束前再次点击任意列
- Then 棋盘状态不发生第二次落子，直到动画结束才允许下一手

Scenario: Win with four in a row

- Given 当前落子会形成任一方向连续 4 枚同色棋子
- When 玩家完成该次落子
- Then 游戏进入胜利状态，显示获胜玩家，并阻止继续落子

Scenario: Draw when board is full

- Given 棋盘只剩最后一个空位，且落子后不会产生四连
- When 当前玩家完成最后一次合法落子
- Then 游戏进入平局状态，并显示平局结果

Scenario: Victory takes priority over draw

- Given 棋盘只剩最后一个空位，且该次落子会形成连续 4 枚同色棋子
- When 当前玩家完成最后一次合法落子
- Then 游戏进入胜利状态，而不是平局状态

Scenario: Restart game

- Given 游戏已经进入胜利或平局状态，或已有至少一步落子
- When 用户点击重开按钮
- Then 棋盘清空，当前玩家重置，胜负状态清除，可以开始新局

Scenario: Responsive mobile home and game

- Given 用户使用宽度 `360px` 的手机浏览器打开项目
- When 用户访问首页并进入 `/games/drop-four`
- Then 首页卡片、进入按钮、棋盘、状态提示和重开按钮都可见且可操作，不需要横向滚动

Scenario: Core rules are tested

- Given 开发者运行 `npm test`
- When 测试执行完成
- Then 落子、满列、横向胜利、纵向胜利、双斜线胜利、胜利优先于平局、纯平局都有自动化测试覆盖并通过

## Verification Plan

### Required Commands

- `npm run build`: 验证 TypeScript 和生产构建通过。
- `npm test`: 验证四子棋规则纯函数测试通过。
- `npm run test:e2e`: 验证首页入口、游戏交互和 `360px` 响应式可用性通过。

### Scenario Coverage

- Open game shelf home: 由 Playwright E2E 覆盖 `/` 页面加载、游戏卡片和进入按钮。
- Enter Drop Four from home: 由 Playwright E2E 覆盖首页跳转到 `/games/drop-four`。
- Unknown route can recover: 由 Playwright E2E 覆盖未知路径和返回首页。
- Start a Drop Four game: 由 Playwright E2E 覆盖 `9x9` 棋盘、当前玩家提示和重开按钮。
- Drop a piece into a column: 由 `npm test` 覆盖规则状态变化；由 Playwright E2E 覆盖 UI 落子反馈。
- Reject a full column: 由 `npm test` 覆盖状态不变和回合不切换；由 Playwright E2E 覆盖可观察反馈。
- Lock input during drop animation: 由 Playwright E2E 覆盖 UI 时序行为。
- Win with four in a row: 由 `npm test` 覆盖横向、纵向、两条斜线胜利；由 Playwright E2E 覆盖胜利状态锁定 UI。
- Draw when board is full: 由 `npm test` 覆盖纯平局状态。
- Victory takes priority over draw: 由 `npm test` 覆盖胜利优先级。
- Restart game: 由 Playwright E2E 覆盖重开后的 UI 状态。
- Responsive mobile home and game: 由 Playwright `360px` 视口覆盖首页和游戏页无横向滚动。
- Core rules are tested: 由 `npm test` 覆盖。

### Failure Handling

- 任一 Required Command 或场景验证失败时，进入 `/hunt`。
- `/hunt` 必须先定位根因，再修改代码；修复后先重跑原失败命令，再重跑完整 Verification Plan。
- 如果同一验证目标连续 3 轮 `verify -> /hunt -> fix -> verify` 仍失败，停止实现，把 spec 标记为 `blocked`，并在 Run Log 记录失败命令、错误摘要、已尝试修复和下一步需要的信息。

### Evidence Required

- Run Log 必须记录 `npm run build`、`npm test` 和 `npm run test:e2e` 的执行结果摘要。
- Playwright 证据必须记录覆盖的浏览器/视口，至少包括 Chromium 和 `360px` 视口场景。
- 如果因环境缺少 Playwright 浏览器而无法运行 E2E，Run Log 必须记录具体错误、未验证场景和残余风险；不得把未运行的 E2E 标为通过。
- UI 主观检查可以作为补充证据，但不能替代核心规则测试和 E2E 关键路径。

## Waza Flow

- [x] Spec created
- [x] Spec reviewed and approved
- [x] `/think` approved the implementation approach
- [x] Playwright or equivalent E2E decision recorded
- [x] Implementation completed within Boundaries
- [x] Verification Plan executed
- [x] `/hunt` not needed; no failed verification or unexpected behavior
- [x] Verification passed
- [x] `/check` completed before merge or handoff
- [ ] Closeout written

## Run Log

| Date | Actor | Action | Evidence |
|------|-------|--------|----------|
| 2026-05-05 | User + Codex | Confirmed `/think` direction: `game-shelf` needs a game selection home page and the first game is `四子棋 / Drop Four` at `/games/drop-four`. | Conversation approval before spec creation. |
| 2026-05-05 | Codex | Created draft Waza task spec. | `specs/game-shelf-drop-four.spec.md` |
| 2026-05-05 | User + Codex | Approved Waza task spec after `/think` review found no blocking unknowns. | Spec status changed to `approved`. |
| 2026-05-05 | Codex | Implemented `game-shelf` home page, minimal pathname routing, unknown-route recovery, and `四子棋 / Drop Four` at `/games/drop-four`. | Added Vite/React/TypeScript app, game registry, Drop Four rules/UI/styles, README, Vitest tests, and Playwright E2E tests. |
| 2026-05-05 | Codex | Executed full Verification Plan. | `npm run build` passed with Vite production output; `npm test` passed `10` Vitest rule tests; `npm run test:e2e` passed `10` Chromium Playwright tests including home, route recovery, Drop Four flows, and `360px` viewport. |
| 2026-05-05 | Codex | Ran `/check` deep review. | Scope on target; hard stops `0`; dependency/security scan found no blocking issue; architecture review found no required redesign. Safe auto-fix: made Playwright `dropInColumn` helper wait on target cell/settle state instead of fixed time. Re-verification passed: `npm run build`, `npm test`, `npm run test:e2e`. |

## Closeout

Not started. This section must remain empty until implementation, verification, `/check`, and final handoff are complete.
