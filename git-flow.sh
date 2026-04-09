#!/usr/bin/env bash
# ============================================================================
# git-flow.sh — 团队协同 Git 工作流脚本
# ============================================================================
# 遵循 Conventional Commits 规范，支持功能分支和直接提交两种模式。
# 可复用至其他项目，只需复制本文件到项目根目录。
#
# 用法：
#   bash git-flow.sh                    # 交互式向导
#   bash git-flow.sh commit "消息"       # 快速提交到当前分支
#   bash git-flow.sh branch <type> <名称>  # 创建功能分支
#   bash git-flow.sh finish             # 合并当前分支到 main 并推送
#   bash git-flow.sh sync               # 同步远端最新到当前分支
#   bash git-flow.sh status             # 查看当前工作区状态
# ============================================================================

set -euo pipefail

# ── 配置 ──
MAIN_BRANCH="main"
REMOTE="origin"

# Conventional Commits 类型
COMMIT_TYPES=(
  "feat     — 新功能或新内容"
  "fix      — 修复错误"
  "docs     — 文档变更"
  "refactor — 重构（不改变功能）"
  "style    — 格式调整（不影响逻辑）"
  "chore    — 构建/工具/配置变更"
  "test     — 测试相关"
  "perf     — 性能优化"
)

# 分支前缀映射
declare -A BRANCH_PREFIX=(
  [feat]="feature"
  [fix]="bugfix"
  [docs]="docs"
  [refactor]="refactor"
  [chore]="chore"
)

# ── 工具函数 ──

color_green()  { printf "\033[32m%s\033[0m\n" "$1"; }
color_red()    { printf "\033[31m%s\033[0m\n" "$1"; }
color_yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
color_cyan()   { printf "\033[36m%s\033[0m\n" "$1"; }

die() { color_red "✗ $1"; exit 1; }

current_branch() { git rev-parse --abbrev-ref HEAD; }

has_changes() { ! git diff --cached --quiet 2>/dev/null || ! git diff --quiet 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard)" ]; }

ensure_clean_or_stash() {
  if has_changes; then
    color_yellow "⚠ 工作区有未提交的变更，将自动暂存..."
    git stash push -m "git-flow auto stash $(date +%Y%m%d-%H%M%S)" || die "stash 失败"
    STASHED=true
  else
    STASHED=false
  fi
}

restore_stash() {
  if [ "${STASHED:-false}" = true ]; then
    git stash pop || color_yellow "⚠ stash pop 失败，请手动 git stash pop"
  fi
}

sync_remote() {
  local branch="$1"
  echo ""
  echo "── 同步 ${REMOTE}/${branch}..."
  if git ls-remote --exit-code "$REMOTE" "$branch" &>/dev/null; then
    if ! git pull --rebase "$REMOTE" "$branch"; then
      echo ""
      die "rebase 失败，存在冲突。请手动解决后执行 git rebase --continue"
    fi
    color_green "✓ 已同步远端 ${branch}"
  else
    color_yellow "⚠ 远端尚无 ${branch} 分支，将在推送时创建"
  fi
}

show_status() {
  echo ""
  color_cyan "── 仓库状态 ──"
  echo "  分支:   $(current_branch)"
  echo "  远端:   $REMOTE"
  echo "  最新提交: $(git log --oneline -1 2>/dev/null || echo '(无)')"
  echo ""
  if has_changes; then
    echo "── 未提交变更 ──"
    git status --short
  else
    color_green "  工作区干净，无待提交变更。"
  fi
  echo ""
}

# ── 选择 Commit 类型（交互式）──

select_commit_type() {
  echo ""
  color_cyan "── 选择提交类型（Conventional Commits）──"
  echo ""
  local i=1
  for desc in "${COMMIT_TYPES[@]}"; do
    printf "  %d) %s\n" "$i" "$desc"
    ((i++))
  done
  echo ""
  read -rp "输入编号 [1-${#COMMIT_TYPES[@]}]: " choice

  if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt ${#COMMIT_TYPES[@]} ]; then
    die "无效选择"
  fi

  SELECTED_TYPE=$(echo "${COMMIT_TYPES[$((choice-1))]}" | awk '{print $1}')
}

# ── 构建 Commit 消息 ──

build_commit_message() {
  local type="$1"

  read -rp "可选范围 (如 readme、term-04，直接回车跳过): " scope
  read -rp "提交描述 (简明扼要): " desc

  if [ -z "$desc" ]; then
    die "提交描述不能为空"
  fi

  if [ -n "$scope" ]; then
    COMMIT_MSG="${type}(${scope}): ${desc}"
  else
    COMMIT_MSG="${type}: ${desc}"
  fi

  echo ""
  read -rp "需要补充正文吗？[y/N] " need_body
  if [[ "$need_body" =~ ^[yY]$ ]]; then
    echo "输入正文（输入空行结束）："
    BODY=""
    while IFS= read -r line; do
      [ -z "$line" ] && break
      BODY="${BODY}${line}\n"
    done
    if [ -n "$BODY" ]; then
      COMMIT_MSG="${COMMIT_MSG}\n\n${BODY}"
    fi
  fi
}

# ── 子命令：commit ──

cmd_commit() {
  local branch
  branch=$(current_branch)

  # 如果有参数，直接使用
  if [ $# -ge 1 ]; then
    local msg="$1"
    sync_remote "$branch"
    git add -A
    if git diff --cached --quiet; then
      color_yellow "没有需要提交的变更。"
      exit 0
    fi
    echo ""
    echo "── 变更摘要 ──"
    git diff --cached --stat
    echo ""
    read -rp "确认提交并推送到 ${REMOTE}/${branch}？[y/N] " confirm
    [[ "$confirm" =~ ^[yY]$ ]] || { echo "已取消。"; exit 0; }
    git commit -m "$msg"
    git push "$REMOTE" "$branch" || die "推送失败，请 git pull --rebase 后重试"
    color_green "✓ 已提交并推送到 ${REMOTE}/${branch}"
    return
  fi

  # 交互模式
  sync_remote "$branch"
  git add -A
  if git diff --cached --quiet; then
    color_yellow "没有需要提交的变更。"
    exit 0
  fi

  echo ""
  echo "── 变更摘要 ──"
  git diff --cached --stat

  select_commit_type
  build_commit_message "$SELECTED_TYPE"

  echo ""
  color_cyan "── 最终提交消息 ──"
  echo -e "  $COMMIT_MSG"
  echo ""
  read -rp "确认提交并推送到 ${REMOTE}/${branch}？[y/N] " confirm
  [[ "$confirm" =~ ^[yY]$ ]] || { echo "已取消。暂存区已保留。"; exit 0; }

  echo -e "$COMMIT_MSG" | git commit -F -
  git push "$REMOTE" "$branch" || die "推送失败，请 git pull --rebase 后重试"
  color_green "✓ 已提交并推送到 ${REMOTE}/${branch}"
}

# ── 子命令：branch ──

cmd_branch() {
  if [ $# -lt 2 ]; then
    echo "用法: bash git-flow.sh branch <type> <名称>"
    echo "  type: feat | fix | docs | refactor | chore"
    echo "  名称: 简短英文描述，用连字符分隔"
    echo ""
    echo "示例: bash git-flow.sh branch feat add-terminal-group"
    echo "      bash git-flow.sh branch fix deploy-ip-conflict"
    exit 1
  fi

  local type="$1"
  local name="$2"
  local prefix="${BRANCH_PREFIX[$type]:-$type}"
  local branch_name="${prefix}/${name}"

  echo ""
  echo "── 创建分支: $branch_name (基于 ${MAIN_BRANCH})"

  # 先同步 main
  git checkout "$MAIN_BRANCH" 2>/dev/null || die "无法切换到 ${MAIN_BRANCH}"
  sync_remote "$MAIN_BRANCH"

  git checkout -b "$branch_name" || die "分支创建失败"
  color_green "✓ 已创建并切换到 $branch_name"
  echo ""
  echo "  现在可以开始工作，完成后执行:"
  echo "    bash git-flow.sh commit    # 提交变更"
  echo "    bash git-flow.sh finish    # 合并回 ${MAIN_BRANCH}"
}

# ── 子命令：finish ──

cmd_finish() {
  local branch
  branch=$(current_branch)

  if [ "$branch" = "$MAIN_BRANCH" ]; then
    die "当前已在 ${MAIN_BRANCH}，不需要 finish。直接使用 commit 即可。"
  fi

  echo ""
  color_cyan "── 合并 ${branch} → ${MAIN_BRANCH} ──"

  # 先提交当前分支未提交的变更
  if has_changes; then
    echo ""
    color_yellow "检测到未提交变更，先提交当前分支..."
    git add -A
    echo ""
    echo "── 变更摘要 ──"
    git diff --cached --stat
    select_commit_type
    build_commit_message "$SELECTED_TYPE"
    echo -e "$COMMIT_MSG" | git commit -F -
    git push "$REMOTE" "$branch" 2>/dev/null || true
    color_green "✓ 当前分支已提交"
  fi

  # 切换到 main 并合并
  ensure_clean_or_stash
  git checkout "$MAIN_BRANCH" || die "无法切换到 ${MAIN_BRANCH}"
  sync_remote "$MAIN_BRANCH"

  echo ""
  echo "── 合并 ${branch}..."
  if ! git merge --no-ff "$branch" -m "merge: ${branch} into ${MAIN_BRANCH}"; then
    die "合并冲突，请手动解决后执行 git merge --continue"
  fi

  git push "$REMOTE" "$MAIN_BRANCH" || die "推送失败"
  color_green "✓ 已合并并推送到 ${REMOTE}/${MAIN_BRANCH}"

  # 询问是否删除分支
  echo ""
  read -rp "删除已合并的分支 ${branch}？[y/N] " del
  if [[ "$del" =~ ^[yY]$ ]]; then
    git branch -d "$branch" 2>/dev/null
    git push "$REMOTE" --delete "$branch" 2>/dev/null || true
    color_green "✓ 已删除 ${branch}"
  fi

  restore_stash
}

# ── 子命令：sync ──

cmd_sync() {
  local branch
  branch=$(current_branch)
  sync_remote "$branch"

  # 如果不在 main 上，也尝试 rebase main 的更新
  if [ "$branch" != "$MAIN_BRANCH" ]; then
    echo ""
    read -rp "是否将 ${MAIN_BRANCH} 最新变更 rebase 到当前分支？[y/N] " rebase_main
    if [[ "$rebase_main" =~ ^[yY]$ ]]; then
      git fetch "$REMOTE" "$MAIN_BRANCH"
      if ! git rebase "${REMOTE}/${MAIN_BRANCH}"; then
        die "rebase 冲突，请手动解决后执行 git rebase --continue"
      fi
      color_green "✓ 已将 ${MAIN_BRANCH} 最新变更 rebase 到 ${branch}"
    fi
  fi
}

# ── 交互式主向导 ──

cmd_wizard() {
  show_status

  color_cyan "── 选择操作 ──"
  echo ""
  echo "  1) commit   — 提交并推送当前变更"
  echo "  2) branch   — 创建功能分支"
  echo "  3) finish   — 合并当前分支到 ${MAIN_BRANCH}"
  echo "  4) sync     — 同步远端最新"
  echo "  5) status   — 查看状态"
  echo "  0) 退出"
  echo ""
  read -rp "输入编号: " action

  case "$action" in
    1) cmd_commit ;;
    2)
      echo ""
      echo "  分支类型: feat | fix | docs | refactor | chore"
      read -rp "  类型: " btype
      read -rp "  名称 (英文，连字符分隔): " bname
      cmd_branch "$btype" "$bname"
      ;;
    3) cmd_finish ;;
    4) cmd_sync ;;
    5) show_status ;;
    0) echo "退出。"; exit 0 ;;
    *) die "无效选择" ;;
  esac
}

# ── 入口 ──

main() {
  # 检查是否在 git 仓库内
  git rev-parse --git-dir &>/dev/null || die "当前目录不是 Git 仓库"

  local cmd="${1:-}"
  shift 2>/dev/null || true

  case "$cmd" in
    commit)  cmd_commit "$@" ;;
    branch)  cmd_branch "$@" ;;
    finish)  cmd_finish "$@" ;;
    sync)    cmd_sync "$@" ;;
    status)  show_status ;;
    "")      cmd_wizard ;;
    *)       die "未知命令: $cmd\n用法: bash git-flow.sh [commit|branch|finish|sync|status]" ;;
  esac
}

main "$@"
