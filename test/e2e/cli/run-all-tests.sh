#!/bin/bash
# E2E Test Runner - Run all Playwright CLI tests
# Usage: ./run-all-tests.sh [base_url] [test_pattern]
#
# Examples:
#   ./run-all-tests.sh                           # Run all tests against localhost
#   ./run-all-tests.sh https://prod.example.com  # Run all tests against production
#   ./run-all-tests.sh localhost api             # Run only API tests
#   ./run-all-tests.sh localhost mobile          # Run only mobile tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${1:-http://localhost:8787}"
TEST_PATTERN="${2:-all}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0
TESTS=()

run_test() {
    local name=$1
    local script=$2

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Running: $name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if bash "$script" "$BASE_URL"; then
        echo -e "${GREEN}✅ PASSED: $name${NC}"
        PASSED=$((PASSED + 1))
        TESTS+=("✅ $name")
    else
        echo -e "${RED}❌ FAILED: $name${NC}"
        FAILED=$((FAILED + 1))
        TESTS+=("❌ $name")
    fi
    echo ""
}

# Clean up any existing browser sessions
cleanup() {
    echo -e "${YELLOW}Cleaning up browser sessions...${NC}"
    playwright-cli close-all 2>/dev/null || true
}

trap cleanup EXIT

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Playwright CLI E2E Test Suite                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Target: ${YELLOW}$BASE_URL${NC}"
echo -e "Pattern: ${YELLOW}$TEST_PATTERN${NC}"
echo ""

# Define test groups
declare -A API_TESTS=(
    ["API Smoke"]="api-smoke-test.sh"
    ["Session Delete"]="session-delete-test.sh"
)

declare -A UI_TESTS=(
    ["UI Smoke"]="smoke-test.sh"
    ["Scroll Lock"]="scroll-lock-test.sh"
    ["Bottom Growth"]="bottom-growth-test.sh"
    ["Chart Rendering"]="chart-rendering-test.sh"
    ["Chart Dark Theme Contrast"]="chart-dark-theme-contrast-test.sh"
)

declare -A MOBILE_TESTS=(
    ["Mobile Keyboard"]="mobile-test.sh"
    ["Mobile Safe Area"]="mobile-safe-area-test.sh"
    ["Mobile Sheet Scroll"]="mobile-sheet-scrolllock-test.sh"
)

# Run tests based on pattern
case "$TEST_PATTERN" in
    api)
        for name in "${!API_TESTS[@]}"; do
            run_test "$name" "$SCRIPT_DIR/${API_TESTS[$name]}"
        done
        ;;
    ui)
        for name in "${!UI_TESTS[@]}"; do
            run_test "$name" "$SCRIPT_DIR/${UI_TESTS[$name]}"
        done
        ;;
    mobile)
        for name in "${!MOBILE_TESTS[@]}"; do
            run_test "$name" "$SCRIPT_DIR/${MOBILE_TESTS[$name]}"
        done
        ;;
    all|*)
        # Run API tests first (no browser needed)
        for name in "${!API_TESTS[@]}"; do
            run_test "$name" "$SCRIPT_DIR/${API_TESTS[$name]}"
        done
        # Then UI tests
        for name in "${!UI_TESTS[@]}"; do
            run_test "$name" "$SCRIPT_DIR/${UI_TESTS[$name]}"
        done
        # Then mobile tests
        for name in "${!MOBILE_TESTS[@]}"; do
            run_test "$name" "$SCRIPT_DIR/${MOBILE_TESTS[$name]}"
        done
        ;;
esac

# Summary
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                              Test Summary                                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
for test in "${TESTS[@]}"; do
    echo "  $test"
done
echo ""
echo -e "Total: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"

if [ $FAILED -gt 0 ]; then
    exit 1
fi
