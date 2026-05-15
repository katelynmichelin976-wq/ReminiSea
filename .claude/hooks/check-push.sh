#!/bin/bash
# Claude Code PreToolUse hook — checks commits ahead of upstream for issue refs
# Blocks push if any commit is missing (#N) reference.

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  推送前复查：检查待推送提交的 issue 引用"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get current branch
BRANCH=$(git branch --show-current 2>/dev/null)
if [ -z "$BRANCH" ]; then
    echo "  无法确定当前分支（可能处于 detached HEAD），跳过检查。"
    exit 0
fi

# Get upstream tracking branch
UPSTREAM=$(git rev-parse --abbrev-ref "${BRANCH}@{upstream}" 2>/dev/null)
if [ -z "$UPSTREAM" ]; then
    echo "  分支 '$BRANCH' 没有设置 upstream，跳过检查。"
    exit 0
fi

# Get commits ahead of upstream
COMMITS=$(git log --oneline "${UPSTREAM}..HEAD" 2>/dev/null)
if [ -z "$COMMITS" ]; then
    echo "  没有待推送的提交。"
    echo ""
    exit 0
fi

COMMIT_COUNT=$(echo "$COMMITS" | wc -l)
echo "  待推送提交: $COMMIT_COUNT 个"
echo ""

# Check each commit for issue reference
MISSING=0
while IFS= read -r line; do
    if [ -z "$line" ]; then continue; fi
    SHA=$(echo "$line" | awk '{print $1}')
    MSG=$(echo "$line" | cut -d' ' -f2-)

    if ! echo "$MSG" | grep -qE '#[0-9]+'; then
        echo "  ❌ $SHA — $MSG"
        echo "     缺少 issue 引用 (#N)"
        MISSING=$((MISSING + 1))
    else
        echo "  ✅ $SHA — $MSG"
    fi
done <<< "$COMMITS"

echo ""

if [ "$MISSING" -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $MISSING 个提交缺少 issue 引用，已阻止推送。"
    echo ""
    echo "  修复方法:"
    echo "    git commit --amend -m \"原消息 (#N)\""
    echo "    或手动创建 issue 后 rebase"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    exit 2
fi

echo "  全部通过 ✅"
echo ""
exit 0
