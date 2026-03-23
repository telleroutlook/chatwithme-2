#!/usr/bin/env python3
"""
System prompt benchmark — sends test queries to production API and records tool call behavior.

Usage:
    python3 scripts/benchmark-prompt.py [baseline|optimized]

Uses curl under the hood to avoid Cloudflare bot detection on Python urllib User-Agent.
"""

import json
import subprocess
import sys
import time
from collections import defaultdict

LABEL = sys.argv[1] if len(sys.argv) > 1 else "baseline"
BASE_URL = "https://chat2.3we.org"
DEBUG_TOKEN = "claude-debug-a952d905222a512e"
OUTPUT_FILE = f"scripts/benchmark-results-{LABEL}.jsonl"
SUMMARY_FILE = f"scripts/benchmark-summary-{LABEL}.txt"

# Rate limit: GLM has strict rate limits
DELAY_BETWEEN = 12

SESSION_PREFIX = f"bench-{LABEL}-{int(time.time())}"

# Test cases: (category, expected_tools, query)
TESTS = [
    # === no_tool: should answer from knowledge, 0 tools ===
    ("no_tool", 0, "什么是Python的GIL？"),
    ("no_tool", 0, "HTTP状态码304是什么意思？"),
    ("no_tool", 0, "写一个JavaScript的快速排序算法"),
    ("no_tool", 0, "解释一下TCP三次握手"),
    ("no_tool", 0, "React和Vue的主要区别是什么？"),
    ("no_tool", 0, "二战是哪一年结束的？"),
    ("no_tool", 0, "光速是多少？"),
    ("no_tool", 0, "什么是量子纠缠？"),

    # === search: needs 1 web search, no page read ===
    ("search", 1, "今天的AI新闻有哪些？"),
    ("search", 1, "特斯拉最新的股价是多少？"),
    ("search", 1, "2026年NBA总冠军是哪个队？"),

    # === weather: needs weather tool, 1 tool ===
    ("weather", 1, "北京今天天气怎么样？"),
    ("weather", 1, "东京现在的温度是多少？"),

    # === currency: needs currency tool, 1 tool ===
    ("currency", 1, "100美元等于多少人民币？"),
    ("currency", 1, "500欧元换日元是多少？"),

    # === math: simple, should NOT use tool, 0 tools ===
    ("math", 0, "2+2等于多少？"),
    ("math", 0, "123乘以456是多少？"),
    ("math", 0, "圆周率的前5位是什么？"),

    # === math_tool: complex, SHOULD use math tool, 1 tool ===
    ("math_tool", 1, "计算 (3.14159 * 12.5^2) + sqrt(144) - ln(2.71828)"),

    # === chart: should generate chart directly, 0 tools ===
    ("chart", 0, "画一个柱状图，显示2024年四个季度的收入：Q1=120万，Q2=150万，Q3=180万，Q4=200万"),
    ("chart", 0, "画一个折线图显示一周的气温变化：周一15度，周二18度，周三20度，周四17度，周五22度"),

    # === wikipedia: should NOT call wikipedia for well-known topics, 0 tools ===
    ("wikipedia", 0, "爱因斯坦是哪国人？"),
    ("wikipedia", 0, "太阳系有几大行星？"),
]


def send_query_curl(query: str, session_id: str) -> dict:
    """Send a query via curl to avoid Cloudflare bot detection on Python urllib."""
    url = f"{BASE_URL}/api/chat?debug_token={DEBUG_TOKEN}"
    payload = json.dumps({"message": query, "sessionId": session_id})

    start = time.time()
    try:
        result = subprocess.run(
            ["curl", "-s", "--max-time", "90", "-X", "POST", url,
             "-H", "Content-Type: application/json",
             "-d", payload],
            capture_output=True, text=True, timeout=100,
        )
        raw = result.stdout
        if not raw.strip():
            return {"body": {"error": "empty response", "stderr": result.stderr[:200]}, "duration_ms": int((time.time() - start) * 1000)}
        body = json.loads(raw)
    except subprocess.TimeoutExpired:
        body = {"error": "timeout"}
    except json.JSONDecodeError:
        body = {"error": "invalid json", "raw": raw[:300] if raw else ""}
    except Exception as e:
        body = {"error": str(e)}

    duration_ms = int((time.time() - start) * 1000)
    return {"body": body, "duration_ms": duration_ms}


def extract_tool_info(body: dict) -> dict:
    """Extract tool call info from debug response."""
    debug = body.get("_debug", {})
    tools = debug.get("toolCalls", [])
    return {
        "count": len(tools),
        "tools": [
            {"name": t.get("tool", ""), "status": t.get("status", ""), "durationMs": t.get("durationMs", 0)}
            for t in tools
        ],
        "names": [t.get("tool", "") for t in tools],
    }


def main():
    total = 0
    passed_count = 0
    failed_count = 0
    results = []

    print(f"=== Prompt Benchmark: {LABEL} ===")
    print(f"Output: {OUTPUT_FILE}")
    print(f"Delay between requests: {DELAY_BETWEEN}s")
    print()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        for i, (category, expected_tools, query) in enumerate(TESTS):
            case_num = i + 1
            session_id = f"{SESSION_PREFIX}-case{case_num}"

            short_query = query[:40] + ("..." if len(query) > 40 else "")
            print(f"[{case_num}/{len(TESTS)}] {category} (expect {expected_tools} tools): {short_query} ", end="", flush=True)

            resp = send_query_curl(query, session_id)
            body = resp["body"]
            duration_ms = resp["duration_ms"]

            # Check for errors
            if "error" in body and body["error"] not in (None, ""):
                print(f"ERROR ({body['error']}, {duration_ms}ms)")
                record = {
                    "case": case_num,
                    "category": category,
                    "query": query,
                    "expected_tools": expected_tools,
                    "actual_tools": -1,
                    "tool_names": "ERROR",
                    "duration_ms": duration_ms,
                    "has_content": False,
                    "passed": False,
                    "verdict": "error",
                    "response_preview": str(body.get("error", ""))[:150],
                }
                results.append(record)
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
                out.flush()
                total += 1
                failed_count += 1
                if case_num < len(TESTS):
                    time.sleep(DELAY_BETWEEN)
                continue

            tool_info = extract_tool_info(body)
            actual_tools = tool_info["count"]
            tool_names = ",".join(tool_info["names"]) or "none"

            response_text = body.get("response", body.get("text", body.get("content", "")))
            has_content = len(str(response_text)) > 10

            # Judge
            verdict = "fail"
            if actual_tools == expected_tools:
                verdict = "pass"
            elif expected_tools >= 1 and actual_tools == expected_tools + 1:
                verdict = "acceptable"

            is_pass = verdict in ("pass", "acceptable")
            total += 1
            if is_pass:
                passed_count += 1
            else:
                failed_count += 1

            if verdict == "pass":
                print(f"PASS ({actual_tools} tools, {duration_ms}ms) [{tool_names}]")
            elif verdict == "acceptable":
                print(f"ACCEPTABLE ({actual_tools} tools, {duration_ms}ms) [{tool_names}]")
            else:
                print(f"FAIL ({actual_tools} tools, expected {expected_tools}, {duration_ms}ms) [{tool_names}]")

            record = {
                "case": case_num,
                "category": category,
                "query": query,
                "expected_tools": expected_tools,
                "actual_tools": actual_tools,
                "tool_names": tool_names,
                "duration_ms": duration_ms,
                "has_content": has_content,
                "passed": is_pass,
                "verdict": verdict,
                "response_preview": str(response_text)[:150] if response_text else "",
            }
            results.append(record)
            out.write(json.dumps(record, ensure_ascii=False) + "\n")
            out.flush()

            if case_num < len(TESTS):
                time.sleep(DELAY_BETWEEN)

    # Summary
    print()
    print(f"=== Summary ===")
    rate = passed_count / total * 100 if total else 0
    print(f"Total: {total}  Pass: {passed_count}  Fail: {failed_count}  Rate: {rate:.1f}%")

    cats = defaultdict(lambda: {"total": 0, "pass": 0, "fail": 0, "durations": [], "tool_excess": 0, "details": []})
    for r in results:
        c = cats[r["category"]]
        c["total"] += 1
        if r["passed"]:
            c["pass"] += 1
        else:
            c["fail"] += 1
        c["durations"].append(r["duration_ms"])
        if r["actual_tools"] >= 0:
            c["tool_excess"] += max(0, r["actual_tools"] - r["expected_tools"])
        if not r["passed"]:
            c["details"].append(f'    FAIL: "{r["query"][:30]}" got {r["actual_tools"]} tools [{r["tool_names"]}]')

    summary_lines = [
        f"Prompt Benchmark Summary: {LABEL}",
        f"Date: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}",
        f"Total: {total}  Pass: {passed_count}  Fail: {failed_count}  Rate: {rate:.1f}%",
        "",
        "Per-category breakdown:",
    ]
    for cat in sorted(cats.keys()):
        stats = cats[cat]
        avg_dur = sum(stats["durations"]) / len(stats["durations"]) if stats["durations"] else 0
        summary_lines.append(f"  {cat}: {stats['pass']}/{stats['total']} pass, avg {avg_dur:.0f}ms, excess tools: {stats['tool_excess']}")
        for d in stats["details"]:
            summary_lines.append(d)

    summary_text = "\n".join(summary_lines)
    with open(SUMMARY_FILE, "w", encoding="utf-8") as f:
        f.write(summary_text + "\n")

    print()
    print(summary_text)
    print()
    print(f"Detailed results: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
