# Phantom Shooter

Phantom Shooter 是一个桌面 Web FPS 原型。项目使用 Vite、TypeScript、Three.js 和 Rapier，所有场景、武器与音效均由程序生成，不依赖外部游戏资源。

## 环境要求

- Node.js 20.19+ 或 22.12+
- 桌面版 Chrome / Edge

## 本地运行

```bash
npm install
npm run dev
```

打开终端中显示的本地地址，在启动界面选择关卡即可进入。游戏中按 `Esc` 暂停后可继续或切换关卡。

## 构建与预览

```bash
npm run build
npm run preview
```

生产文件输出到 `dist/`，可部署到任意静态网站托管服务。由于浏览器 Pointer Lock 和音频策略，请通过 HTTP 服务访问，不要直接双击打开构建后的 HTML。

## GitHub Pages 自动部署

仓库包含 `.github/workflows/deploy-pages.yml`。推送到 `main` 分支后，GitHub Actions 会自动安装依赖、构建项目并部署 `dist/`。也可以在仓库的 Actions 页面手动运行该工作流。

首次使用时，需要在 GitHub 仓库中进入 **Settings → Pages**，将 **Build and deployment → Source** 设置为 **GitHub Actions**。部署成功后的地址为：

```text
https://dairuidenny.github.io/phantom-shooter/
```

Pages 子路径配置位于 `vite.config.ts`；如果仓库改名，需要同步修改其中的 `base`。

## 操作

- `WASD`：移动
- `Shift`：冲刺；空中会保留冲刺动量并可适度修正方向
- `Space`：跳跃
- 鼠标：控制视角
- 鼠标左键：全自动射击
- 鼠标右键：瞄准
- `R`：换弹
- `E`：开始录制；录制0.5秒后可再次按下提前结束，最长4秒
- `F`：准星对准橙色虚影时取代该分身
- `Q`：充能达到300点后，在非录制状态下一次引爆全部虚影
- `Esc`：释放鼠标

最多保留3个循环回放的虚影；录制会优先使用空缺槽位，槽位全满后再按顺序覆盖最早的虚影。准星瞄准虚影时，虚影会变为橙色；按 `F` 后虚影定住，本体快速直线移动至其位置，到位后虚影消失并释放对应槽位。玩家本体或分身每次枪械命中增加1点引爆充能，达到300点且场上存在虚影时按 `Q` 会消耗全部充能并引爆；爆炸命中不会增加充能。移动、镜头和武器的主要参数集中在 `src/config.ts`，便于后续调节手感。

## 关卡

- **热身靶场**：原有的移动与射击训练场。
- **守护尖塔**：保护中央方尖碑。每波共30个基础敌人，依次从11号、1号、12号刷新方向组成三个子波次来袭；清场5秒后开始下一波，并持续重复。玩家与分身枪械均可伤害敌人，引爆分身还会造成大范围爆炸伤害和击飞。方尖碑生命耗尽后可重新挑战或切换关卡。
