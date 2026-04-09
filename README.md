# openspec-autodev

> OpenSpec + Superpowers 全自动开发工作流 Claude Code 插件  
> 支持多子代理并行批次执行，一键安装即用

## ✨ 特性

- **一键安装**：安装插件后运行 `/openspec-autodev:setup` 即可完成所有配置
- **全自动开发**：从需求确认到代码完成，仅需一个人工确认节点
- **并行执行**：基于依赖分析的多子代理并行批次执行，大幅缩短开发时间
- **TDD 驱动**：严格遵循 Red-Green-Refactor 循环
- **断点恢复**：工作流中断后可从断点继续
- **安全防护**：自动阻止修改敏感文件，自动格式化代码

## 🚀 快速开始

### Step 1：安装插件

**方式一：Plugin Marketplace（推荐）**
```
# 1. 注册插件市场源
/plugin marketplace add https://github.com/<your-repo>/openspec-autodev

# 2. 从市场中安装插件
/plugin install openspec-autodev
```

**方式二：手动安装**
```bash
# 克隆到 Claude Code 插件目录
git clone https://github.com/<your-repo>/openspec-autodev.git ~/.claude/plugins/openspec-autodev
```

### Step 2：初始化项目

**推荐：跳过权限确认模式**
为了在整个流程中不被打断，建议运行claude code 时使用：

```bash
claude --dangerously-skip-permission
```
>当然，如果你不想使用这个flag，在项目初始化的过程中也会通过`.claude/settings.json`中加入一些细粒度的权限来跳过指定的权限确认弹窗。

在 Claude Code 中进入你的项目目录，执行：
```
/openspec-autodev:setup
```

这会自动：
- ✅ 检测并安装 OpenSpec（如未安装）
- ✅ 检测并安装 Superpowers 技能包（如未安装）
- ✅ 初始化 `openspec/` 目录
- ✅ 配置 `CLAUDE.md` 项目宪法
- ✅ 更新 `.gitignore`
- ✅ 自动检测项目语言和测试框架

### Step 3：开始开发

```
/openspec-autodev:auto-dev 用户搜索功能
```

然后就可以放手了！整个流程自动执行：

```
需求澄清 → 规格生成 → 环境准备 → 并行TDD开发 → 验证收尾 → 等待确认
   人工          自动        自动         自动           自动       人工
```

## 📋 命令列表

| 命令 | 说明 |
|------|------|
| `/openspec-autodev:setup` | 一键初始化项目（首次使用必须执行） |
| `/openspec-autodev:auto-dev <feature>` | 启动全自动开发工作流 |
| `/openspec-autodev:resume` | 恢复中断的工作流 |
| `/openspec-autodev:parallel-dev <feature>` | 生成外部 CLI 并行执行脚本 |

## ⚡ 并行执行模式

### 方案 A：内置并行（默认）

插件在 Phase 3 中自动分析微任务依赖关系，将独立任务分组为并行批次，同一批次内的子代理**同时执行**：

```
Batch 1 (并行): T1-1, T2-1, T3-1  ← 同时启动 3 个子代理
    ↓ 全部完成
Batch 2 (并行): T1-2, T2-2        ← 同时启动 2 个子代理
    ↓ 全部完成
Batch 3 (串行): T1-3 → T4-1       ← 依次执行
```

### 方案 B：外部 CLI 并行（大规模任务）

对于超过 8 个微任务的大型功能，使用 `/openspec-autodev:parallel-dev` 生成独立的并行执行脚本：

```bash
# 自动生成 parallel-dev.sh
/openspec-autodev:parallel-dev user-search

# 在 Git Bash 终端中执行
bash parallel-dev.sh
```

## 🔄 工作流架构

```
用户输入需求
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Phase 0  需求澄清（brainstorming + /opsx:explore）│  ← 人工参与
└─────────────────────────────────────────────────┘
    │ 用户确认
    ▼
┌─────────────────────────────────────────────────┐
│  Phase 1  规格生成（/opsx:new + /opsx:ff）        │  ← 全自动
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Phase 2  环境准备 + 依赖分析 + 并行分组           │  ← 全自动
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Phase 3  TDD 开发（按批次并行子代理执行）          │  ← 全自动
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Phase 4  开发收尾 → 等待用户确认                  │  ← 人工确认
└─────────────────────────────────────────────────┘
```

## 🛡️ 内置安全防护

- **敏感文件保护**：自动阻止修改 `.env`、密钥、证书等文件
- **OpenSpec 保护**：阻止直接修改 `openspec/specs/`（必须通过 `/opsx:archive`）
- **自动格式化**：编辑文件后自动运行 Prettier + ESLint
- **文件冲突防止**：并行执行时自动检测文件冲突，必要时降级为串行

## 📊 断点恢复

如果工作流中断（网络断开、会话超时等），重新打开 Claude Code 时会自动提示：

```
⚠️ 检测到未完成的工作流：
  功能：user-search | 阶段：Phase 3 | 批次：Batch 2/4
  → 使用 /openspec-autodev:resume 继续
```

## 🔧 前置依赖

| 依赖 | 说明 | 安装方式 |
|------|------|---------|
| Claude Code | CLI 工具 | [docs.anthropic.com](https://docs.anthropic.com/claude-code) |
| Git | 版本控制 | [git-scm.com](https://git-scm.com) |
| Node.js ≥ 18 | 运行时 | [nodejs.org](https://nodejs.org) |
| OpenSpec | 规格驱动 | `setup` 命令自动安装 |
| Superpowers | TDD 技能包 | `setup` 命令自动安装 |

## 📝 License

MIT
