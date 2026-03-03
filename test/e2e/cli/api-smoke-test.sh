#!/bin/bash
# API Smoke Test - Test backend API endpoints directly
# This replaces smoke.production.mjs (API-only test, no browser needed)
# Usage: ./api-smoke-test.sh [base_url]

set -e

BASE_URL="${1:-http://localhost:8787}"
SESSION_ID="e2e-api-smoke-$(date +%s)"

echo "🌐 Running API Smoke Test against: $BASE_URL"
echo "   Session ID: $SESSION_ID"

# Test 1: Home page reachable
echo "📍 Testing home page..."
HOME_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$HOME_STATUS" != "200" ]; then
    echo "❌ Home page failed with status: $HOME_STATUS"
    exit 1
fi
echo "   ✅ Home page reachable (200)"

# Test 2: Get chat history (should be empty for new session)
echo "📜 Testing history endpoint..."
HISTORY_RESPONSE=$(curl -s "${BASE_URL}/api/chat/history?sessionId=${SESSION_ID}")
HISTORY_SUCCESS=$(echo "$HISTORY_RESPONSE" | grep -o '"success":[^,}]*' | grep -o 'true\|false')

if [ "$HISTORY_SUCCESS" != "true" ]; then
    echo "❌ History endpoint failed: $HISTORY_RESPONSE"
    exit 1
fi
echo "   ✅ History endpoint working"

# Test 3: Send a chat message
echo "💬 Testing chat endpoint..."
CHAT_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/chat" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"${SESSION_ID}\",\"message\":\"E2E API smoke test\"}")

CHAT_SUCCESS=$(echo "$CHAT_RESPONSE" | grep -o '"success":[^,}]*' | grep -o 'true\|false')
if [ "$CHAT_SUCCESS" != "true" ]; then
    echo "❌ Chat endpoint failed: $CHAT_RESPONSE"
    exit 1
fi

# Check response exists
CHAT_RESPONSE_TEXT=$(echo "$CHAT_RESPONSE" | grep -o '"response":"[^"]*"' | head -1)
if [ -z "$CHAT_RESPONSE_TEXT" ]; then
    echo "❌ Chat response empty: $CHAT_RESPONSE"
    exit 1
fi
echo "   ✅ Chat endpoint working"

# Test 4: Test invalid edit (should return 400)
echo "✏️  Testing edit validation..."
EDIT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/chat/edit" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"${SESSION_ID}\"}")
EDIT_STATUS=$(echo "$EDIT_RESPONSE" | tail -1)

if [ "$EDIT_STATUS" != "400" ]; then
    echo "❌ Edit validation failed, expected 400, got: $EDIT_STATUS"
    exit 1
fi
echo "   ✅ Edit validation working (400 for invalid request)"

# Test 5: Clear history
echo "🗑️  Testing history clear..."
CLEAR_RESPONSE=$(curl -s -X DELETE "${BASE_URL}/api/chat/history?sessionId=${SESSION_ID}")
CLEAR_SUCCESS=$(echo "$CLEAR_RESPONSE" | grep -o '"success":[^,}]*' | grep -o 'true\|false')

if [ "$CLEAR_SUCCESS" != "true" ]; then
    echo "❌ History clear failed: $CLEAR_RESPONSE"
    exit 1
fi
echo "   ✅ History clear working"

echo ""
echo "✅ All API smoke tests passed!"
echo "   Results:"
echo "   - Home page: ✅"
echo "   - History endpoint: ✅"
echo "   - Chat endpoint: ✅"
echo "   - Edit validation: ✅"
echo "   - History clear: ✅"
