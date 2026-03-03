#!/bin/bash
# Session Delete Test - Test session deletion API
# This replaces session-delete.production.mjs (API-only test, no browser needed)
# Usage: ./session-delete-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"
SESSION_ID="e2e-delete-$(date +%s)"

echo "🗑️  Running Session Delete Test against: $BASE_URL"
echo "   Session ID: $SESSION_ID"

# Test 1: Create a session with a message
echo "💬 Creating session with message..."
CHAT_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/chat" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"${SESSION_ID}\",\"message\":\"Session delete smoke test\"}")

CHAT_SUCCESS=$(echo "$CHAT_RESPONSE" | grep -o '"success":[^,}]*' | grep -o 'true\|false')
if [ "$CHAT_SUCCESS" != "true" ]; then
    echo "❌ Failed to create session: $CHAT_RESPONSE"
    exit 1
fi
echo "   ✅ Session created"

# Test 2: Delete the session
echo "🔥 Deleting session..."
DELETE_RESPONSE=$(curl -s -X DELETE "${BASE_URL}/api/chat/session?sessionId=${SESSION_ID}")

DELETE_SUCCESS=$(echo "$DELETE_RESPONSE" | grep -o '"success":[^,}]*' | grep -o 'true\|false')
if [ "$DELETE_SUCCESS" != "true" ]; then
    echo "❌ Delete session failed: $DELETE_RESPONSE"
    exit 1
fi

# Check destroyed or pendingDestroy
DESTROYED=$(echo "$DELETE_RESPONSE" | grep -o '"destroyed":[^,}]*' | grep -o 'true\|false')
PENDING=$(echo "$DELETE_RESPONSE" | grep -o '"pendingDestroy":[^,}]*' | grep -o 'true\|false')

if [ "$DESTROYED" != "true" ] && [ "$PENDING" != "true" ]; then
    echo "❌ Delete response missing destroyed state: $DELETE_RESPONSE"
    exit 1
fi
echo "   ✅ Session deleted (destroyed=$DESTROYED, pendingDestroy=$PENDING)"

# Test 3: Verify history is empty after delete
echo "🔍 Verifying history is empty..."
HISTORY_RESPONSE=$(curl -s "${BASE_URL}/api/chat/history?sessionId=${SESSION_ID}")

HISTORY_SUCCESS=$(echo "$HISTORY_RESPONSE" | grep -o '"success":[^,}]*' | grep -o 'true\|false')
if [ "$HISTORY_SUCCESS" != "true" ]; then
    echo "❌ History endpoint failed after delete: $HISTORY_RESPONSE"
    exit 1
fi

# Check history array is empty
HISTORY_LENGTH=$(echo "$HISTORY_RESPONSE" | grep -o '"history":\[[^]]*\]' | grep -o '\[\]' || echo "not_empty")
if [ "$HISTORY_LENGTH" != "[]" ]; then
    echo "❌ History not empty after delete: $HISTORY_RESPONSE"
    exit 1
fi
echo "   ✅ History is empty after delete"

echo ""
echo "✅ Session delete test passed!"
echo "   - Session created: ✅"
echo "   - Session deleted: ✅"
echo "   - History cleared: ✅"
