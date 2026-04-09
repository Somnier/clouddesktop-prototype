#!/usr/bin/env bash
# push.sh — 团队协同 Git 提交与推送脚本
# 用法：bash push.sh "提交说明"
# 说明：拉取远端最新 → 暂存所有变更 → 提交 → 推送（含冲突检测）

set -euo pipefail

# ── 检查参数 ──
if [ $# -lt 1 ]; then
  echo "用法: bash push.sh \"提交说明\""
  exit 1
fi

MSG="$1"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
REMOTE="origin"

echo "── 当前分支: $BRANCH"
echo "── 远端:     $REMOTE"
echo "── 提交说明: $MSG"
echo ""

# ── 拉取远端最新（多人协同时避免推送冲突）──
echo "── 拉取 ${REMOTE}/${BRANCH} 最新提交..."
if ! git pull --rebase "$REMOTE" "$BRANCH"; then
  echo ""
  echo "✗ 拉取或 rebase 失败，可能存在冲突。"
  echo "  请手动解决冲突后执行："
  echo "    git rebase --continue"
  echo "    bash push.sh \"$MSG\""
  exit 1
fi
echo "✓ 已同步远端最新提交"
echo ""

# ── 暂存 ──
git add -A
echo "✓ 已暂存所有变更"

# ── 检查是否有实际变更 ──
if git diff --cached --quiet; then
  echo "没有需要提交的变更。"
  exit 0
fi

# ── 变更摘要 ──
echo ""
echo "── 变更摘要 ──"
git diff --cached --stat
echo ""

# ── 确认 ──
read -rp "确认提交并推送到 ${REMOTE}/${BRANCH}？[y/N] " confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
  echo "已取消。暂存区已保留，可手动 git commit。"
  exit 0
fi

# ── 提交 ──
git commit -m "$MSG"
echo "✓ 已提交"

# ── 推送 ──
if ! git push "$REMOTE" "$BRANCH"; then
  echo ""
  echo "✗ 推送失败。可能远端又有新提交，请重试："
  echo "    git pull --rebase $REMOTE $BRANCH"
  echo "    git push $REMOTE $BRANCH"
  exit 1
fi
echo "✓ 已推送到 ${REMOTE}/${BRANCH}"
