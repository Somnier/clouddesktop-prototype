# 云桌面管理系统 — 简化版原型

> 基于 09_云桌面原型 的简化版本。减少终端侧操作步骤，合并重复界面，让操作更简便。
> 技术栈：Node.js + Express + SSE 实时同步 + 原生 HTML/JS 前端，可选 Electron 桌面窗口。

## 相比原型评审版的主要变化

| 变更 | 原版 (09) | 简化版 (10) |
|------|----------|------------|
| 部署向导 | 5 步（母机准备→规则→桌面→确认→分发） | 3 步（规则→桌面→分发） |
| 维护入口 | 菜单选择 → 子流程 | 工作台直达：「桌面更新」「修改IP」 |
| 故障处理 | 菜单选择 → 子流程 | 首页直达：「一键替换」「一键重置」 |
| 任务进度 | 3 个独立进度屏 | 统一进度屏（taskProgressScreen） |
| 冗余屏幕 | maintConfirm/examDesktop/examConfirm 别名 | 已移除 |

## 四端同屏架构

原型同时运行 4 个端，共享同一份 JSON 状态，通过 SSE (Server-Sent Events) 实时同步：

| 端         | 地址                              | 说明 |
|-----------|----------------------------------|------|
| 导演台     | http://localhost:3920/director    | 原型测试控制台，切换教室、触发动作、模拟故障、重置数据 |
| 母机终端   | http://localhost:3920/terminal/mother | 终端管理系统完整功能：首页、桌面管理、教室接管、部署、维护、考试 |
| 受控终端   | http://localhost:3920/terminal/controlled | 受控终端任务屏，仅显示本机任务状态 |
| 管理平台   | http://localhost:3920/platform    | Web 管理平台：校区总览、教室列表、终端详情、告警中心 |

## 快速启动

```bash
# 安装依赖
npm install

# 方式一：仅启动 Web 服务器（浏览器访问）
npm run serve
# 然后浏览器打开 http://localhost:3920/director

# 方式二：同时启动 Web 服务器 + Electron 窗口
npm start
```

服务器默认端口 `3920`，可通过环境变量 `PORT` 修改。

## 数据说明

- `data/seed.json` — 种子数据，包含 6 间教室、282 台终端、告警、桌面等初始数据
- `data/state.json` — 运行时状态快照，自动生成，删除后重启会从 seed 重建
- 导演台的「重置到初始种子数据」按钮可随时恢复到初始状态

## 目录结构

```
10_简化版/
├── server.mjs              # Express 服务器 + 状态管理 + SSE 推送
├── start.mjs               # 启动脚本（Web + Electron）
├── data/
│   └── seed.json           # 种子数据
├── public/
│   ├── shared/             # 共享资源
│   │   ├── base.css        # 基础样式
│   │   ├── ui.js           # UI 工具函数
│   │   ├── model.js        # 数据模型查询
│   │   └── state-client.js # SSE 客户端
│   └── apps/
│       ├── director/       # 导演台
│       ├── terminal/       # 终端（母机 + 受控）
│       └── platform/       # 管理平台
└── electron/               # Electron 入口
```

## 使用说明

1. 启动后先打开**导演台**，它是原型操控中心
2. 在导演台切换不同教室（不同部署阶段），母机/受控终端自动同步
3. 通过导演台的测试流程按钮（A-E）快速跳转到各功能页面
4. 终端座位格子可点击切换受控观察对象
5. 所有操作实时同步到四个端
