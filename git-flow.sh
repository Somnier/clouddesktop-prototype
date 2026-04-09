#!/usr/bin/env bash
# ============================================================================
# git-flow.sh — 团队协同 Git 工作流脚本 (Conventional Commits)
# ============================================================================
# 可复用至任意项目。复制本文件到项目根目录即可使用。
#
# 命令:
#   bash git-flow.sh                          # 交互式向导
#   bash git-flow.sh commit                   # 交互式提交（引导选择类型 + 范围 + 描述）
#   bash git-flow.sh commit -m "type: msg"    # 快速提交（跳过引导，直接使用给定消息）
#   bash git-flow.sh branch                   # 交互式创建分支
#   bash git-flow.sh branch feat my-feature   # 快速创建分支 feature/my-feature
#   bash git-flow.sh finish                   # 合并当前分支到主分支并推送
#   bash git-flow.sh sync                     # 同步远端到当前分支
#   bash git-flow.sh status                   # 查看仓库状态
#   bash git-flow.sh log [n]                  # 查看最近 n 条提交（默认 10）
#   bash git-flow.sh help                     # 显示帮助与用法示例
#
# 提交消息格式 (Conventional Commits 1.0):
#   <type>(<scope>): <description>
#
#   [optional body]
#
#   [optional footer(s)]
#
# 示例:
#   feat(terminal): 首页按钮改为动名词样式
#   fix(deploy): 修复不选数据盘时仍要求填写大小
#   docs(readme): 补充 09/10 版本差异说明
#   refactor(server): 拆分 buildState 为独立模块
# ============================================================================

set -euo pipefail

# ── 可配置项（按项目需求修改）──────────────────────────────────────────────

MAIN_BRANCH="main"          # 主分支名称 (main / master / develop)
REMOTE="origin"             # 远端名称
PUSH_AFTER_COMMIT=true      # 提交后是否自动推送（false 则仅本地提交）

# ── Conventional Commits 类型定义 ─────────────────────────────────────────
# 格式: "类型|描述|适用分支前缀"
# 分支前缀为空表示该类型不常独立建分支，但仍可在 commit 中使用。

TYPES=(
  "feat|新功能、新页面、新交互|feature"
  "fix|缺陷修复、逻辑纠正|bugfix"
  "docs|文档新增或修改|docs"
  "style|样式调整、格式化（不影响逻辑）|"
  "refactor|代码重构（不改变外部行为）|refactor"
  "perf|性能优化|"
  "test|测试用例新增或修改|"
  "build|构建系统、依赖、打包配置|"
  "ci|CI/CD 流水线变更|"
  "chore|杂项（不归入以上类别的工程变更）|chore"
  "revert|回滚先前提交|"
)

# ── 颜色与输出工具 ────────────────────────────────────────────────────────

_green()  { printf "\033[32m%s\033[0m\n" "$1"; }
_red()    { printf "\033[31m%s\033[0m\n" "$1"; }
_yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
_cyan()   { printf "\033[36m%s\033[0m\n" "$1"; }
_bold()   { printf "\033[1m%s\033[0m"    "$1"; }
_dim()    { printf "\033[2m%s\033[0m"    "$1"; }

die() { _red "✗ $1" >&2; exit 1; }

# ── Git 工具函数 ──────────────────────────────────────────────────────────

current_branch() { git rev-parse --abbrev-ref HEAD 2>/dev/null; }

on_main() { [ "$(current_branch)" = "$MAIN_BRANCH" ]; }

has_staged()   { ! git diff --cached --quiet 2>/dev/null; }
has_unstaged() { ! git diff --quiet 2>/dev/null; }
has_untracked(){ [ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]; }
has_changes()  { has_staged || has_unstaged || has_untracked; }

remote_has_branch() {
  git ls-remote --exit-code --heads "$REMOTE" "$1" &>/dev/null
}

# 同步远端分支（pull --rebase）
sync_branch() {
  local branch="$1"
  echo ""
  echo "── 同步 ${REMOTE}/${branch}..."
  if remote_has_branch "$branch"; then
    if ! git pull --rebase "$REMOTE" "$branch"; then
      echo ""
      _red "rebase 冲突。请手动解决后执行:"
      echo "  git rebase --continue     # 解决冲突后继续"
      echo "  git rebase --abort        # 放弃 rebase 恢复原状"
      exit 1
    fi
    _green "✓ 已同步 ${REMOTE}/${branch}"
  else
    _yellow "⚠ 远端尚无 ${branch}，将在推送时自动创建"
  fi
}

# 推送到远端
push_branch() {
  local branch="$1"
  if [ "$PUSH_AFTER_COMMIT" = true ]; then
    echo ""
    echo "── 推送到 ${REMOTE}/${branch}..."
    if ! git push "$REMOTE" "$branch" 2>/dev/null; then
      # 可能远端有新提交，尝试 rebase 后重推
      _yellow "⚠ 直接推送失败，尝试 rebase 后重推..."
      git pull --rebase "$REMOTE" "$branch" || {
        _red "rebase 冲突。请手动解决后执行:"
        echo "  git rebase --continue"
        echo "  git push $REMOTE $branch"
        exit 1
      }
      git push "$REMOTE" "$branch" || die "推送失败"
    fi
    _green "✓ 已推送到 ${REMOTE}/${branch}"
  else
    _yellow "⚠ PUSH_AFTER_COMMIT=false，仅本地提交，未推送"
  fi
}

# ── 提交类型选择 ──────────────────────────────────────────────────────────

# 解析 TYPES 数组
_type_key()    { echo "$1" | cut -d'|' -f1; }
_type_desc()   { echo "$1" | cut -d'|' -f2; }
_type_prefix() { echo "$1" | cut -d'|' -f3; }

select_type() {
  echo ""
  _cyan "── 提交类型 (Conventional Commits) ──"
  echo ""
  local i=1
  for entry in "${TYPES[@]}"; do
    local key; key=$(_type_key "$entry")
    local desc; desc=$(_type_desc "$entry")
    printf "  %2d) %-10s %s\n" "$i" "$key" "$desc"
    ((i++))
  done
  echo ""
  local choice
  read -rp "选择 [1-${#TYPES[@]}]: " choice

  if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#TYPES[@]}" ]; then
    die "无效选择: $choice"
  fi

  SELECTED_TYPE=$(_type_key "${TYPES[$((choice-1))]}")
}

# ── 构建提交消息 ──────────────────────────────────────────────────────────

build_message() {
  local type="$1"
  local scope desc body co_authors

  # 范围（可选）
  read -rp "范围 (如 terminal, platform, readme；回车跳过): " scope

  # 描述（必填）
  read -rp "描述: " desc
  [ -z "$desc" ] && die "描述不能为空"

  # 组装首行
  if [ -n "$scope" ]; then
    COMMIT_MSG="${type}(${scope}): ${desc}"
  else
    COMMIT_MSG="${type}: ${desc}"
  fi

  # 正文（可选）
  read -rp "补充正文？[y/N] " yn
  if [[ "$yn" =~ ^[yY]$ ]]; then
    echo "  输入正文，空行结束:"
    body=""
    while IFS= read -r line; do
      [ -z "$line" ] && break
      body="${body}${line}"$'\n'
    done
    [ -n "$body" ] && COMMIT_MSG="${COMMIT_MSG}"$'\n\n'"${body}"
  fi

  # Co-authored-by（多人协作场景）
  read -rp "添加协作者 (Co-authored-by)？[y/N] " yn
  if [[ "$yn" =~ ^[yY]$ ]]; then
    co_authors=""
    while true; do
      read -rp "  姓名 <邮箱> (回车结束): " author
      [ -z "$author" ] && break
      co_authors="${co_authors}Co-authored-by: ${author}"$'\n'
    done
    if [ -n "$co_authors" ]; then
      # 确保正文与 footer 间有空行
      [[ "$COMMIT_MSG" != *$'\n\n'* ]] && COMMIT_MSG="${COMMIT_MSG}"$'\n'
      COMMIT_MSG="${COMMIT_MSG}"$'\n'"${co_authors}"
    fi
  fi
}

# ── 子命令: commit ────────────────────────────────────────────────────────

cmd_commit() {
  local branch; branch=$(current_branch)

  # 快速模式: commit -m "type(scope): message"
  if [ "${1:-}" = "-m" ] && [ -n "${2:-}" ]; then
    local msg="$2"
    # 格式校验
    if ! echo "$msg" | grep -qE "^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .+"; then
      _yellow "⚠ 消息不符合 Conventional Commits 格式: <type>(<scope>): <description>"
      read -rp "仍要继续？[y/N] " yn
      [[ "$yn" =~ ^[yY]$ ]] || { echo "已取消。"; exit 0; }
    fi
    sync_branch "$branch"
    git add -A
    if ! has_staged; then
      _yellow "没有需要提交的变更。"; exit 0
    fi
    echo ""; echo "── 变更摘要 ──"; git diff --cached --stat; echo ""
    read -rp "确认提交到 ${branch}？[y/N] " yn
    [[ "$yn" =~ ^[yY]$ ]] || { echo "已取消。"; exit 0; }
    git commit -m "$msg"
    push_branch "$branch"
    return
  fi

  # 交互模式
  sync_branch "$branch"
  git add -A
  if ! has_staged; then
    _yellow "没有需要提交的变更。"; exit 0
  fi

  echo ""; echo "── 变更摘要 ──"; git diff --cached --stat

  select_type
  build_message "$SELECTED_TYPE"

  echo ""
  _cyan "── 提交消息预览 ──"
  echo "$COMMIT_MSG" | sed 's/^/  /'
  echo ""
  read -rp "确认提交到 ${branch}？[y/N] " yn
  [[ "$yn" =~ ^[yY]$ ]] || { echo "已取消。暂存区已保留。"; exit 0; }

  echo "$COMMIT_MSG" | git commit -F -
  push_branch "$branch"
}

# ── 子命令: branch ────────────────────────────────────────────────────────

cmd_branch() {
  local type="${1:-}" name="${2:-}"

  # 交互模式
  if [ -z "$type" ]; then
    echo ""
    _cyan "── 创建分支 ──"
    echo ""
    echo "  可用分支类型:"
    for entry in "${TYPES[@]}"; do
      local prefix; prefix=$(_type_prefix "$entry")
      [ -n "$prefix" ] || continue
      local key; key=$(_type_key "$entry")
      local desc; desc=$(_type_desc "$entry")
      printf "    %-10s → %s/  (%s)\n" "$key" "$prefix" "$desc"
    done
    echo ""
    read -rp "  类型: " type
    read -rp "  名称 (英文, 连字符分隔): " name
  fi

  [ -z "$type" ] && die "缺少分支类型"
  [ -z "$name" ] && die "缺少分支名称"

  # 查找对应前缀
  local prefix=""
  for entry in "${TYPES[@]}"; do
    if [ "$(_type_key "$entry")" = "$type" ]; then
      prefix=$(_type_prefix "$entry")
      break
    fi
  done
  [ -z "$prefix" ] && prefix="$type"
  local branch_name="${prefix}/${name}"

  echo ""
  echo "── 创建分支 ${branch_name} (基于 ${MAIN_BRANCH})"

  # 保存当前工作区
  local stashed=false
  if has_changes; then
    _yellow "⚠ 暂存当前工作区变更..."
    git stash push -m "git-flow: before branch ${branch_name}" || die "stash 失败"
    stashed=true
  fi

  git checkout "$MAIN_BRANCH" 2>/dev/null || die "无法切换到 ${MAIN_BRANCH}"
  sync_branch "$MAIN_BRANCH"
  git checkout -b "$branch_name" || die "分支创建失败"

  if [ "$stashed" = true ]; then
    git stash pop 2>/dev/null || _yellow "⚠ stash pop 失败，请手动 git stash pop"
  fi

  _green "✓ 已创建并切换到 ${branch_name}"
  echo ""
  echo "  后续操作:"
  echo "    bash git-flow.sh commit     # 提交变更到当前分支"
  echo "    bash git-flow.sh finish     # 完成后合并回 ${MAIN_BRANCH}"
  echo "    bash git-flow.sh sync       # 同步远端"
}

# ── 子命令: finish ────────────────────────────────────────────────────────

cmd_finish() {
  local branch; branch=$(current_branch)

  on_main && die "当前已在 ${MAIN_BRANCH}，请先切到功能分支再 finish。"

  echo ""
  _cyan "── 合并 ${branch} → ${MAIN_BRANCH} ──"

  # 先提交未提交的变更
  if has_changes; then
    echo ""
    _yellow "检测到未提交变更，先提交..."
    git add -A
    echo ""; echo "── 变更摘要 ──"; git diff --cached --stat
    select_type
    build_message "$SELECTED_TYPE"
    echo "$COMMIT_MSG" | git commit -F -
    push_branch "$branch"
  fi

  # 同步 main，合并
  git checkout "$MAIN_BRANCH" || die "无法切换到 ${MAIN_BRANCH}"
  sync_branch "$MAIN_BRANCH"

  echo ""
  echo "── 合并 ${branch}..."
  if ! git merge --no-ff "$branch" -m "merge: ${branch}"; then
    _red "合并冲突。请手动解决后执行:"
    echo "  git merge --continue"
    echo "  git push $REMOTE $MAIN_BRANCH"
    exit 1
  fi

  push_branch "$MAIN_BRANCH"

  echo ""
  read -rp "删除已合并的分支 ${branch}？[y/N] " yn
  if [[ "$yn" =~ ^[yY]$ ]]; then
    git branch -d "$branch" 2>/dev/null || true
    git push "$REMOTE" --delete "$branch" 2>/dev/null || true
    _green "✓ 已删除 ${branch}"
  fi
}

# ── 子命令: sync ──────────────────────────────────────────────────────────

cmd_sync() {
  local branch; branch=$(current_branch)
  sync_branch "$branch"

  if ! on_main; then
    echo ""
    read -rp "将 ${MAIN_BRANCH} 最新变更 rebase 到 ${branch}？[y/N] " yn
    if [[ "$yn" =~ ^[yY]$ ]]; then
      git fetch "$REMOTE" "$MAIN_BRANCH"
      if ! git rebase "${REMOTE}/${MAIN_BRANCH}"; then
        _red "rebase 冲突。请手动解决后执行:"
        echo "  git rebase --continue     # 解决后继续"
        echo "  git rebase --abort        # 放弃 rebase"
        exit 1
      fi
      _green "✓ 已将 ${MAIN_BRANCH} 变更 rebase 到 ${branch}"
    fi
  fi
}

# ── 子命令: status ────────────────────────────────────────────────────────

cmd_status() {
  echo ""
  _cyan "── 仓库状态 ──"
  echo "  分支:     $(current_branch)"
  echo "  远端:     $REMOTE"
  echo "  主分支:   $MAIN_BRANCH"
  echo "  最新提交: $(git log --oneline -1 2>/dev/null || echo '(无)')"
  echo ""
  if has_changes; then
    echo "── 工作区变更 ──"
    git status --short
  else
    _green "  工作区干净。"
  fi
  echo ""
  # 显示当前存在的本地分支
  local branches; branches=$(git branch --list | grep -v "^\*" | sed 's/^ */  /')
  if [ -n "$branches" ]; then
    echo "── 本地分支 ──"
    git branch --list | sed 's/^/  /'
    echo ""
  fi
}

# ── 子命令: log ───────────────────────────────────────────────────────────

cmd_log() {
  local n="${1:-10}"
  echo ""
  _cyan "── 最近 ${n} 条提交 ──"
  echo ""
  git log --oneline --graph --decorate -n "$n"
  echo ""
}

# ── 子命令: help ──────────────────────────────────────────────────────────

cmd_help() {
  cat << 'HELP'

git-flow.sh — 团队协同 Git 工作流脚本

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

命令:
  (无参数)          交互式向导（推荐首次使用）
  commit            交互式提交（引导选择类型、范围、描述）
  commit -m "msg"   快速提交（消息须符合 Conventional Commits 格式）
  branch            交互式创建功能分支
  branch <t> <name> 快速创建分支，如 branch feat add-grid-view
  finish            合并当前功能分支回主分支并推送
  sync              拉取远端最新（pull --rebase）
  status            查看分支与工作区状态
  log [n]           查看最近 n 条提交日志
  help              显示本帮助

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

提交类型 (Conventional Commits):
  feat      新功能、新页面、新交互
  fix       缺陷修复、逻辑纠正
  docs      文档新增或修改
  style     样式调整、格式化（不影响逻辑）
  refactor  代码重构（不改变外部行为）
  perf      性能优化
  test      测试用例新增或修改
  build     构建系统、依赖、打包配置
  ci        CI/CD 流水线变更
  chore     杂项工程变更
  revert    回滚先前提交

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

分支类型（用于 branch 命令）:
  feat      → feature/<name>    新功能开发
  fix       → bugfix/<name>     缺陷修复
  docs      → docs/<name>       文档修改
  refactor  → refactor/<name>   重构
  chore     → chore/<name>      工程杂项

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用法示例:

  # 日常快速提交（在 main 分支上）
  bash git-flow.sh commit -m "docs(readme): 更新项目结构说明"

  # 交互式提交（向导引导选类型、填范围、写描述）
  bash git-flow.sh commit

  # 开新功能分支并工作
  bash git-flow.sh branch feat v11-terminal-redesign
  # ... 工作中，多次提交 ...
  bash git-flow.sh commit
  bash git-flow.sh commit
  # 完成后合并回 main
  bash git-flow.sh finish

  # 同步远端（多人协作时建议每次提交前先同步）
  bash git-flow.sh sync

  # 手动 rebase 场景（功能分支落后于 main 时）
  bash git-flow.sh sync          # 交互中选择 rebase main

  # 多人协作：提交时标注协作者
  bash git-flow.sh commit
  # → 向导中选择"添加协作者"，输入: 张三 <zhangsan@example.com>
  # → 生成: Co-authored-by: 张三 <zhangsan@example.com>

  # 回滚某次提交
  git revert <commit-hash>       # 生成回滚提交
  bash git-flow.sh commit -m "revert: 回滚 xxx 功能"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

团队协作建议:
  1. 小改动（文档修正、样式微调）可直接在 main 上 commit
  2. 较大功能开发（新版本迭代、多文件重构）建议建 feature 分支
  3. 提交前先 sync，避免推送冲突
  4. Co-authored-by 跟踪团队成员贡献
  5. 提交消息用中文描述即可，type 使用英文

HELP
}

# ── 交互式主向导 ──────────────────────────────────────────────────────────

cmd_wizard() {
  cmd_status

  _cyan "── 选择操作 ──"
  echo ""
  echo "  1) commit    提交并推送当前变更"
  echo "  2) branch    创建功能分支"
  echo "  3) finish    合并当前分支到 ${MAIN_BRANCH}"
  echo "  4) sync      同步远端最新"
  echo "  5) status    查看仓库状态"
  echo "  6) log       查看提交日志"
  echo "  7) help      显示帮助与用法示例"
  echo "  0) 退出"
  echo ""
  read -rp "选择: " action

  case "$action" in
    1) cmd_commit ;;
    2) cmd_branch ;;
    3) cmd_finish ;;
    4) cmd_sync ;;
    5) cmd_status ;;
    6) cmd_log ;;
    7) cmd_help ;;
    0) exit 0 ;;
    *) die "无效选择" ;;
  esac
}

# ── 入口 ──────────────────────────────────────────────────────────────────

main() {
  git rev-parse --git-dir &>/dev/null || die "当前目录不是 Git 仓库"

  local cmd="${1:-}"
  shift 2>/dev/null || true

  case "$cmd" in
    commit)  cmd_commit "$@" ;;
    branch)  cmd_branch "$@" ;;
    finish)  cmd_finish ;;
    sync)    cmd_sync ;;
    status)  cmd_status ;;
    log)     cmd_log "$@" ;;
    help)    cmd_help ;;
    "")      cmd_wizard ;;
    *)       die "未知命令: $cmd — 执行 bash git-flow.sh help 查看帮助" ;;
  esac
}

main "$@"
