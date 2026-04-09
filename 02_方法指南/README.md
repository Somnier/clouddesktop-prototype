# 02_方法指南

本目录存放项目推进过程中积累的经验性文档，以及将 Markdown 转为 PDF 的导出工具。

## 目录内容

| 文件 | 说明 |
|---|---|
| AI Agent工作模式说明.md | VS Code + Copilot Agent 环境的能力路径、工具体系和记忆机制分析 |
| 原型设计工程实践指南.md | 五阶段原型设计工程经验：原始资料整理 → 事实层固化 → 页面结构设计 → 可交互原型实现 → 评审与修正 |
| 深度人机协同工程实践指南.md | 与 AI Agent 进行多轮多文件协作的工程经验：事实分层、锚点机制、偏移控制、边界定义 |
| md2pdf.mjs | Markdown → PDF 导出脚本 |
| package.json | Node.js 依赖声明（marked、puppeteer-core） |
| _archived_*.md | 已归档的早期版本 |

## PDF 导出工具

`md2pdf.mjs` 将 Markdown 文件转换为 GitHub 风格的 PDF，带有可点击目录和页码。

### 环境要求

- **Node.js** ≥ 18
- **Google Chrome**（脚本默认读取 `C:/Program Files/Google/Chrome/Application/chrome.exe`，如果 Chrome 安装路径不同需修改脚本中的 `CHROME` 常量）
- 依赖安装：在本目录下运行 `npm install`

### 使用方法

```bash
cd 02_方法指南
node md2pdf.mjs <输入文件.md> [输出文件.pdf]
```

- 第一个参数为 Markdown 源文件路径（必填）
- 第二个参数为 PDF 输出路径（可选，默认与输入同名，扩展名改为 `.pdf`）

示例：

```bash
node md2pdf.mjs 原型设计工程实践指南.md
node md2pdf.mjs 深度人机协同工程实践指南.md custom-output.pdf
```

### 转换流程

1. 读取 Markdown 源文件
2. 剥离手写的 `## 目录` 段落（避免与自动生成的目录重复）
3. 解析 Markdown 为 HTML，为每个标题添加锚点
4. 生成可点击的二级/三级标题目录
5. 套用 GitHub 风格 CSS（含表格、代码块、引用块样式）
6. 写出中间 `.html` 文件（可用于调试或浏览器查看）
7. 启动 Chrome headless 将 HTML 渲染为 A4 PDF，附页码

### 产出文件

每次执行会在输入文件同目录生成两个文件：

- `*.html` — 中间 HTML 文件，可直接用浏览器打开
- `*.pdf` — 最终 PDF 输出
