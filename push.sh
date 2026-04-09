#!/usr/bin/env bash
# push.sh — 标准 Git 提交与推送脚本
# 用法：bash push.sh "提交说明"
# 说明：暂存所有变更 → 提交到当前分支 → 推送到远端同名分支

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
echo "── 提交说明: $MSG"
echo ""

# ── 暂存 ──
git add -A
echo "✓ 已暂存所有变更"

# ── 查看变更摘要 ──
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
git push "$REMOTE" "$BRANCH"
echo "✓ 已推送到 ${REMOTE}/${BRANCH}"
