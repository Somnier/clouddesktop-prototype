#!/usr/bin/env bash
# ============================================================================
# git-flow.sh — 通用 Git 工作流脚本 (Conventional Commits)
# ============================================================================
# 适用于任意项目。复制本文件到 Git 仓库根目录即可使用。
#
# 命令:
#   bash git-flow.sh                          # 交互式向导
#   bash git-flow.sh commit                   # 交互式提交
#   bash git-flow.sh commit -m "type: msg"    # 快速提交
#   bash git-flow.sh branch                   # 交互式创建分支
#   bash git-flow.sh branch feature my-thing  # 快速创建分支
#   bash git-flow.sh finish                   # 合并当前分支到主分支
#   bash git-flow.sh sync                     # 同步远端
#   bash git-flow.sh status                   # 查看仓库状态
#   bash git-flow.sh log [n]                  # 查看最近 n 条提交
#   bash git-flow.sh help                     # 显示帮助
# ============================================================================

set -euo pipefail

# ── 中文路径支持 ──────────────────────────────────────────────────────────
# Git 默认将非 ASCII 路径显示为八进制转义（\346\226\271…），此处强制关闭。
export LANG="${LANG:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"
GIT="git -c core.quotePath=false"

# ── 可配置项 ──────────────────────────────────────────────────────────────

MAIN_BRANCH="main"          # 主分支名称
REMOTE="origin"             # 远端名称
PUSH_AFTER_COMMIT=true      # 提交后是否自动推送

# ── 提交类型 (Conventional Commits 1.0) ───────────────────────────────────
# 仅用于 commit 消息的 <type> 字段。

COMMIT_TYPES=(
  "feat|新功能、新页面、新交互"
  "fix|缺陷修复、逻辑纠正"
  "docs|文档新增或修改"
  "style|样式调整、格式化（不影响逻辑）"
  "refactor|代码重构（不改变外部行为）"
  "perf|性能优化"
  "test|测试用例新增或修改"
  "build|构建系统、依赖、打包配置"
  "ci|CI/CD 流水线变更"
  "chore|杂项工程变更"
  "revert|回滚先前提交"
)

# ── 分支类型 ──────────────────────────────────────────────────────────────
# 仅用于 branch 命令创建分支。与提交类型独立。
# 格式: "输入关键字|分支前缀|说明"

BRANCH_TYPES=(
  "feature|feature|新功能开发"
  "bugfix|bugfix|缺陷修复"
  "hotfix|hotfix|紧急修复（直接修 main）"
  "release|release|版本发布准备"
  "docs|docs|文档修改"
  "refactor|refactor|代码重构"
  "chore|chore|工程杂项"
)

# ── 颜色与输出 ────────────────────────────────────────────────────────────

_green()  { printf "\033[32m%s\033[0m\n" "$1"; }
_red()    { printf "\033[31m%s\033[0m\n" "$1"; }
_yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
_cyan()   { printf "\033[36m%s\033[0m\n" "$1"; }
_dim()    { printf "\033[2m%s\033[0m\n"  "$1"; }

die() { _red "✗ $1" >&2; exit 1; }

# ── Git 工具函数 ──────────────────────────────────────────────────────────

current_branch() { $GIT rev-parse --abbrev-ref HEAD 2>/dev/null; }
on_main()        { [ "$(current_branch)" = "$MAIN_BRANCH" ]; }
has_staged()     { ! $GIT diff --cached --quiet 2>/dev/null; }
has_unstaged()   { ! $GIT diff --quiet 2>/dev/null; }
has_untracked()  { [ -n "$($GIT ls-files --others --exclude-standard 2>/dev/null)" ]; }
has_changes()    { has_staged || has_unstaged || has_untracked; }

remote_has_branch() {
  $GIT ls-remote --exit-code --heads "$REMOTE" "$1" &>/dev/null
}

sync_branch() {
  local branch="$1"
  echo ""
  echo "── 同步 ${REMOTE}/${branch}..."
  if remote_has_branch "$branch"; then
    if ! $GIT pull --rebase "$REMOTE" "$branch"; then
      _red "rebase 冲突。请手动解决:"
      echo "  git rebase --continue"
      echo "  git rebase --abort"
      exit 1
    fi
    _green "✓ 已同步 ${REMOTE}/${branch}"
  else
    _yellow "⚠ 远端尚无 ${branch}，推送时自动创建"
  fi
}

push_branch() {
  local branch="$1"
  if [ "$PUSH_AFTER_COMMIT" = true ]; then
    echo ""
    echo "── 推送到 ${REMOTE}/${branch}..."
    if ! $GIT push "$REMOTE" "$branch" 2>/dev/null; then
      _yellow "⚠ 推送失败，尝试 rebase 后重推..."
      $GIT pull --rebase "$REMOTE" "$branch" || {
        _red "rebase 冲突，请手动解决。"
        exit 1
      }
      $GIT push "$REMOTE" "$branch" || die "推送失败"
    fi
    _green "✓ 已推送到 ${REMOTE}/${branch}"
  else
    _yellow "⚠ PUSH_AFTER_COMMIT=false，仅本地提交"
  fi
}

# ── 提交类型选择 ──────────────────────────────────────────────────────────

_ct_key()  { echo "$1" | cut -d'|' -f1; }
_ct_desc() { echo "$1" | cut -d'|' -f2; }

select_commit_type() {
  echo ""
  _cyan "── 提交类型 ──"
  echo ""
  local i=1
  for entry in "${COMMIT_TYPES[@]}"; do
    printf "  %2d) %-10s %s\n" "$i" "$(_ct_key "$entry")" "$(_ct_desc "$entry")"
    ((i++))
  done
  echo ""
  local choice
  read -rp "选择 [1-${#COMMIT_TYPES[@]}]: " choice
  if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#COMMIT_TYPES[@]}" ]; then
    die "无效选择"
  fi
  SELECTED_TYPE=$(_ct_key "${COMMIT_TYPES[$((choice-1))]}")
}

# ── 构建提交消息 ──────────────────────────────────────────────────────────

build_message() {
  local type="$1"
  local scope desc body

  # 范围（可选）
  read -rp "范围（回车跳过）: " scope

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
    echo "  输入正文（空行结束）:"
    body=""
    while IFS= read -r line; do
      [ -z "$line" ] && break
      body="${body}${line}"$'\n'
    done
    [ -n "$body" ] && COMMIT_MSG="${COMMIT_MSG}"$'\n\n'"${body}"
  fi
}

# ── 子命令: commit ────────────────────────────────────────────────────────

cmd_commit() {
  local branch; branch=$(current_branch)

  # 快速模式
  if [ "${1:-}" = "-m" ] && [ -n "${2:-}" ]; then
    local msg="$2"
    if ! echo "$msg" | grep -qE "^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .+"; then
      _yellow "⚠ 消息不符合 Conventional Commits 格式"
      read -rp "仍要继续？[y/N] " yn
      [[ "$yn" =~ ^[yY]$ ]] || { echo "已取消。"; exit 0; }
    fi
    sync_branch "$branch"
    $GIT add -A
    if ! has_staged; then _yellow "没有变更。"; exit 0; fi
    echo ""; echo "── 变更摘要 ──"; $GIT diff --cached --stat; echo ""
    read -rp "确认提交到 ${branch}？[y/N] " yn
    [[ "$yn" =~ ^[yY]$ ]] || { echo "已取消。"; exit 0; }
    $GIT commit -m "$msg"
    push_branch "$branch"
    return
  fi

  # 交互模式
  sync_branch "$branch"
  $GIT add -A
  if ! has_staged; then _yellow "没有变更。"; exit 0; fi

  echo ""; echo "── 变更摘要 ──"; $GIT diff --cached --stat

  select_commit_type
  build_message "$SELECTED_TYPE"

  echo ""
  _cyan "── 提交消息预览 ──"
  echo "$COMMIT_MSG" | sed 's/^/  /'
  echo ""
  read -rp "确认提交到 ${branch}？[y/N] " yn
  [[ "$yn" =~ ^[yY]$ ]] || { echo "已取消。"; exit 0; }

  echo "$COMMIT_MSG" | $GIT commit -F -
  push_branch "$branch"
}

# ── 子命令: branch ────────────────────────────────────────────────────────

_bt_key()    { echo "$1" | cut -d'|' -f1; }
_bt_prefix() { echo "$1" | cut -d'|' -f2; }
_bt_desc()   { echo "$1" | cut -d'|' -f3; }

cmd_branch() {
  local type="${1:-}" name="${2:-}"

  if [ -z "$type" ]; then
    echo ""
    _cyan "── 创建分支 ──"
    echo ""
    local i=1
    for entry in "${BRANCH_TYPES[@]}"; do
      printf "  %2d) %-10s → %s/  %s\n" "$i" "$(_bt_key "$entry")" "$(_bt_prefix "$entry")" "$(_bt_desc "$entry")"
      ((i++))
    done
    echo ""
    local choice
    read -rp "类型 [1-${#BRANCH_TYPES[@]}]: " choice
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#BRANCH_TYPES[@]}" ]; then
      die "无效选择"
    fi
    type=$(_bt_key "${BRANCH_TYPES[$((choice-1))]}")
    read -rp "名称（英文，连字符分隔）: " name
  fi

  [ -z "$type" ] && die "缺少分支类型"
  [ -z "$name" ] && die "缺少分支名称"

  # 查找前缀
  local prefix=""
  for entry in "${BRANCH_TYPES[@]}"; do
    if [ "$(_bt_key "$entry")" = "$type" ]; then
      prefix=$(_bt_prefix "$entry")
      break
    fi
  done
  [ -z "$prefix" ] && prefix="$type"
  local branch_name="${prefix}/${name}"

  echo ""
  echo "── 创建分支 ${branch_name}（基于 ${MAIN_BRANCH}）"

  local stashed=false
  if has_changes; then
    _yellow "⚠ 暂存工作区变更..."
    $GIT stash push -m "git-flow: before branch ${branch_name}" || die "stash 失败"
    stashed=true
  fi

  $GIT checkout "$MAIN_BRANCH" 2>/dev/null || die "无法切换到 ${MAIN_BRANCH}"
  sync_branch "$MAIN_BRANCH"
  $GIT checkout -b "$branch_name" || die "分支创建失败"

  if [ "$stashed" = true ]; then
    $GIT stash pop 2>/dev/null || _yellow "⚠ stash pop 失败，请手动 git stash pop"
  fi

  _green "✓ 已创建并切换到 ${branch_name}"
}

# ── 子命令: finish ────────────────────────────────────────────────────────

cmd_finish() {
  local branch; branch=$(current_branch)
  on_main && die "当前已在 ${MAIN_BRANCH}，请先切到功能分支。"

  echo ""
  _cyan "── 合并 ${branch} → ${MAIN_BRANCH} ──"

  if has_changes; then
    _yellow "检测到未提交变更，先提交..."
    $GIT add -A
    echo ""; echo "── 变更摘要 ──"; $GIT diff --cached --stat
    select_commit_type
    build_message "$SELECTED_TYPE"
    echo "$COMMIT_MSG" | $GIT commit -F -
    push_branch "$branch"
  fi

  $GIT checkout "$MAIN_BRANCH" || die "无法切换到 ${MAIN_BRANCH}"
  sync_branch "$MAIN_BRANCH"

  echo "── 合并 ${branch}..."
  if ! $GIT merge --no-ff "$branch" -m "merge: ${branch}"; then
    _red "合并冲突，请手动解决。"
    exit 1
  fi
  push_branch "$MAIN_BRANCH"

  echo ""
  read -rp "删除已合并的分支 ${branch}？[y/N] " yn
  if [[ "$yn" =~ ^[yY]$ ]]; then
    $GIT branch -d "$branch" 2>/dev/null || true
    $GIT push "$REMOTE" --delete "$branch" 2>/dev/null || true
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
      $GIT fetch "$REMOTE" "$MAIN_BRANCH"
      if ! $GIT rebase "${REMOTE}/${MAIN_BRANCH}"; then
        _red "rebase 冲突，请手动解决。"
        exit 1
      fi
      _green "✓ 已 rebase ${MAIN_BRANCH} 到 ${branch}"
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
  echo "  最新提交: $($GIT log --oneline -1 2>/dev/null || echo '(无)')"
  echo ""
  if has_changes; then
    echo "── 工作区变更 ──"
    $GIT status --short
  else
    _green "  工作区干净。"
  fi
  echo ""
  echo "── 本地分支 ──"
  $GIT branch --list | sed 's/^/  /'
  echo ""
}

# ── 子命令: log ───────────────────────────────────────────────────────────

cmd_log() {
  local n="${1:-10}"
  echo ""
  _cyan "── 最近 ${n} 条提交 ──"
  echo ""
  $GIT log --oneline --graph --decorate -n "$n"
  echo ""
}

# ── 子命令: help ──────────────────────────────────────────────────────────

cmd_help() {
  cat << 'HELP'

git-flow.sh — 通用 Git 工作流脚本

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

命令:
  (无参数)          交互式向导
  commit            交互式提交（选类型 → 填范围 → 写描述）
  commit -m "msg"   快速提交（需符合 Conventional Commits 格式）
  branch            交互式创建分支
  branch <type> <n> 快速创建，如 branch feature add-grid
  finish            合并当前分支回主分支并推送
  sync              拉取远端最新（pull --rebase）
  status            查看分支与工作区状态
  log [n]           查看最近 n 条提交
  help              显示本帮助

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

提交类型 (commit):           分支类型 (branch):
  feat      新功能             feature   新功能开发
  fix       缺陷修复           bugfix    缺陷修复
  docs      文档修改           hotfix    紧急修复
  style     样式/格式          release   版本发布
  refactor  代码重构           docs      文档修改
  perf      性能优化           refactor  代码重构
  test      测试用例           chore     工程杂项
  build     构建/依赖
  ci        CI/CD
  chore     杂项
  revert    回滚

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

示例:

  # 快速提交
  bash git-flow.sh commit -m "fix: 修复输入框焦点丢失"
  bash git-flow.sh commit -m "feat(server): 新增状态同步接口"

  # 交互式提交（引导填写）
  bash git-flow.sh commit

  # 创建功能分支
  bash git-flow.sh branch feature terminal-redesign

  # 完成分支，合并回 main
  bash git-flow.sh finish

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
  echo "  7) help      显示帮助"
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
  $GIT rev-parse --git-dir &>/dev/null || die "当前目录不是 Git 仓库"

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
    *)       die "未知命令: $cmd — bash git-flow.sh help" ;;
  esac
}

main "$@"
