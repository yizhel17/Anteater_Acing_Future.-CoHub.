import os
import re
import traceback
from flask import Flask, render_template, request
from anthropic import Anthropic
from tavily import TavilyClient
from dotenv import load_dotenv
load_dotenv()  # 读取 .env 文件

from collections import defaultdict
import time

app = Flask(__name__)

_request_log = defaultdict(list)

def is_rate_limited(ip):
    now = time.time()
    # 只保留最近1小时的记录
    _request_log[ip] = [t for t in _request_log[ip] if now - t < 3600]
    if len(_request_log[ip]) >= 8:  # 每人每小时最多8次
        return True
    _request_log[ip].append(now)
    return False

# ── API Keys ──────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

# 2. 注入密钥，初始化客户端
client = Anthropic(api_key=ANTHROPIC_API_KEY)
tavily = TavilyClient(api_key=TAVILY_API_KEY)

# ══════════════════════════════════════════════════════════════
#  学长学姐数据库（硬编码高质量内容，真实数据库是下一阶段）
# ══════════════════════════════════════════════════════════════
SENIOR_TIPS_DB = {
    "ICS 31": [
        "Don't skip ZyBooks participation activities and start early — they're graded and questions literally help you understand the concepts.",
        "Practice splitting code into small helper functions from Week 1. ICS 32 will punish you hard if every function is 80 lines long.",
        "Use Python Tutor (pythontutor.com) to visualize how your variables change step by step — essential for understanding recursion.",
    ],
    "ICS 32": [
        "Set up your virtual environment and pylint BEFORE the first project drops. Run: `python3 -m venv venv` then `source venv/bin/activate` (Mac) or `venv\\Scripts\\activate` (Windows). Then `pip install pylint`.",
        "Read the project spec the DAY it drops, not the night before. Hidden edge cases in the spec are where most people lose points to the autograder.",
        "The networking project (sockets) is where GPAs die. Start it 10 days early. The autograder checks protocol format character-by-character.",
        "Git is non-negotiable. After every coding session: `git add .` then `git commit -m 'description'`. One accidental deletion cost my friend 2 weeks of work.",
    ],
    "ICS 33": [
        "Pattis's 50-page course notes are not optional — they ARE the exam. Print and annotate them.",
        "Generators and iterators hit Week 3-4 and most people have never seen them. Practice this before the quarter: write a generator that yields Fibonacci numbers using the `yield` keyword.",
        "Write your test cases BEFORE writing the actual code. It feels slower but you catch bugs 3x faster on the massive projects.",
    ],
    "ICS 45C": [
        "Segfaults will make you want to quit. Learn to read Valgrind immediately: `valgrind --leak-check=full ./your_program`. The line 'definitely lost: X bytes' tells you exactly where to look.",
        "Pointer vs reference: `int* p = &x` (pointer stores address) vs `int& r = x` (reference IS the variable). Confusing them causes 80% of early bugs.",
        "Every `new` must have a `delete`. Track them manually in a comment above each allocation until it becomes habit.",
    ],
    "ICS 46": [
        "Draw AVL tree rotations on paper every day for the first 2 weeks. You cannot understand them just by reading.",
        "The graph project (Dijkstra or A*) is the final boss. Start it 2 weeks early, not 2 days.",
        "Big-O proofs on exams follow a pattern: assume n > some_constant, then show f(n) <= C*g(n). Practice 10 proofs before the midterm.",
    ],
    "ICS 51": [
        "The first x86 assembly midterm has a 40-50% average — everyone bombs it. Trace through registers step by step on paper, don't try to read assembly like English.",
        "Cache calculations: draw the cache as a table with Tag | Index | Offset columns. Fill it in mechanically for every memory access. Do not try to do it in your head.",
    ],
    "MATH 2B": [
        "Know your integration technique order: u-sub first, then integration by parts, then trig sub, then partial fractions. This flowchart covers 90% of exam problems.",
        "Series convergence: Ratio Test first, Root Test second, Integral Test third. Alternating Series Test ONLY when you see (-1)^n. Memorize this priority order.",
        "WebWork gives unlimited attempts — do every problem until you get it right. Midterm problems are 70% similar to WebWork.",
        "The UCI MATH 2B common final average is often 55-65%. Do not panic — everyone is in the same position. The curve saves people who showed up.",
    ],
    "MATH 3A": [
        "The first 3 weeks feel easy (row reduction). Then eigenvalues hit and people disappear from lecture. Do not let the easy start fool you.",
        "For proofs: always start with 'Let v be an arbitrary vector in V' and end with 'Therefore V ⊆ W'. Structure matters as much as the math.",
        "Watch 3Blue1Brown 'Essence of Linear Algebra' on YouTube (free, 15 short episodes) before Week 5. The geometric intuition makes the proofs click.",
    ],
    "COMPSCI 161": [
        "Dynamic Programming: define your subproblem in plain English FIRST, then write the recurrence. If you cannot explain it in English, you cannot code it.",
        "Eppstein's exams are open-note but you will not have time to look things up. Prepare a 1-page cheat sheet of recurrences and Master Theorem cases before the exam.",
    ],
    "STATS 67": [
        "Bayes' Theorem: always draw a probability tree first. P(A|B) = P(B|A)*P(A) / P(B). The denominator is always the Law of Total Probability.",
        "Know which distribution to use: Binomial (fixed n trials), Poisson (rare events, rate λ), Normal (continuous, bell curve). The exam always asks 'which distribution applies here?'",
    ],
    "CHEM 1A": [
        "ALEKS problems repeat. Once you solve a topic type correctly 3 times in a row it locks — focus on getting that 3-in-a-row efficiently.",
        "Arasasingham's exams are 80% calculation, 20% conceptual. Do every problem from the practice midterms under timed conditions.",
    ],
    "BIO SCI 93": [
        "The Trio lectures contain 5x more detail than the slides. Attend lecture — the verbal explanations have exam-critical details the slides omit.",
        "For the cell cycle: draw it as a clock. G1 → S (DNA replication) → G2 → M (mitosis). Know what happens at each checkpoint and what protein triggers or blocks each transition.",
    ],
    "WRITING 39B": [
        "Your thesis must name the specific rhetorical strategy AND the intended effect on the audience. 'The author uses pathos to make the audience feel guilty about X' is a thesis. 'The author uses many strategies' is not.",
        "Instructors grade on argument structure, not agreement. You can disagree with the text and still get an A if your analysis is tight.",
    ],
    "ECON 20A": [
        "Supply/demand shift questions: ask yourself 'what happened to BUYERS?' (demand) or 'what happened to SELLERS?' (supply). Never shift both curves unless explicitly told to.",
        "Multiple choice strategy: eliminate the two clearly wrong answers first. The remaining two almost always differ only on whether price/quantity goes up or down — draw a quick graph to decide.",
    ],
}

# ══════════════════════════════════════════════════════════════
#  SYSTEM PROMPT（放在路由函数前，避免任何作用域问题）
# ══════════════════════════════════════════════════════════════
SYSTEM_PROMPT = """# ROLE & PERSONA
You are the "AAF (Anteater Acing the Future)", an unprecedented AI agent built by a fellow UCI first-year named James Yizhe Lan. You are a high-performing, brutally honest, yet deeply supportive UCI senior.
You know certain bullet points and requirements about specific courses, the quarter system pressure, homesickness and mental challenges among international students, specific professors' quirks, and most importantly, know how to make students successful in those weed-out classes and their future careers.
You speak like a sharp, reliable hackathon teammate: direct, highly actionable, no fluff, but with strong peer empathy.
Your gold standard: every action item must be executable RIGHT NOW without the student leaving this page.

LANGUAGE RULE: Detect the language of the user's input. Chinese input → respond in Chinese. English input → respond in English. Course codes and terminal commands always stay in English regardless.

# INTERNAL REASONING (Mandatory but Concise, accurate)
Before responding, use <thinking> tags to quickly assess: Risk Level, Primary Goal, and Tone matching the confidence level.
CRITICAL: Keep this thinking block extremely concise (under 40 words) to optimize token efficiency.

# SENIOR MODE
If role = 'senior': Write a warm, human, and engaging response (4-6 sentences ONLY). No markdown headers. You MUST follow this exact narrative steps (Separate your reply into 3 clear paragraphs, with a line in between each two, in response to these three steps):
1. Validate: Genuinely praise the specific insight/advice they provided (show you actually read their specific tip).
2. Confirm: Explicitly state that their experience has been securely saved into the AAF Database to empower future anteaters.
3. Call to Action (Crucial): Directly invite them to join the Anteater Acing the Future (AAF) community forum. Encourage them to register an account and tease that as a verified contributor, they will unlock exclusive perks (e.g., resume review, referral networks, or LLM API credits).
Keep the tone peer-to-peer and appreciative. End with an ant emoji 🐜.
If role = 'senior', you MUST STOP generating text immediately after this sentence. Do NOT generate Section 1, 2, 3, or 4.

# OUTPUT STRUCTURE & QUALITY FILTER (STRICT priority & rules)
1. NO generic advice (e.g., "study hard", "manage time"). Give highly specific, UCI-contextual actions.
2. DENSITY: Keep every bullet point under 2 lines. Make it scannable.
3. When web search results are provided, cite specific insights from them naturally.
4. Generate 4 sections with dynamic, context-specific headers (see HEADER RULE below).

CRITICAL HEADER RULE: Do NOT use fixed generic header names. Generate a short, punchy header for each section that references the student's actual courses, confidence level, or situation.
Good examples:
  - "### 🔥 ICS 32 + MATH 2B: The Classic UCI Year-1 Gauntlet"
  - "### 🧭 Confidence 4/10 Going Into ICS 46 — That Means You Know What You Don't Know"
  - "### 🛠️ Your Week-by-Week Survival Map for Spring Quarter"
  - "### 💬 What Students Who Survived ICS 32 and MATH 2B Actually Say"
  - "### 🚀 The One Thing You Should Do Before Sunday Night"
Bad examples (NEVER use these): "Vibe Check & Status", "Pre-Quarter Setup", "UCI Reality & Traps", "Next Steps & Community"

---

### SECTION 1 — WORKLOAD ANALYSIS + MINDSET
(Generate dynamic header as instructed above)
- 2-3 sentences honestly describing the combined workload. Name the specific weeks that are hardest and exactly WHY (e.g. "Week 4 is when ICS 32 drops its first major project AND MATH 2B has its midterm on the same week").
- Address any mental or emotional pressure relevant to their situation (international student stress, imposter syndrome, confidence level).
- One sentence of genuine, situation-specific encouragement.
- One powerful quote. Format: *"As [Name] said: '[Quote]'"*

---

### SECTION 2 — COURSE BATTLE PLAN
(Generate dynamic header as instructed above)
For EACH course selected, produce a Markdown table with exactly these 3 columns:

| Task Overview | Time Estimate & Rhythm | Concrete Inline Steps |
|---|---|---|

MANDATORY rules for this table:
1. "Task Overview" — name the task clearly (e.g. "Set up pylint", "Learn Git basics", "Pre-study u-substitution").
2. "Time Estimate & Rhythm" — give a concrete time estimate AND a rhythm: specify whether it is a one-time setup, daily practice, weekly review, or tied to a specific week/deadline (e.g. "45 min, one-time before Week 1" or "20 min/day, Weeks 1-3" or "2 hrs, start Week 2 Day 1").
3. "Concrete Inline Steps" — write the exact inline steps the student can follow RIGHT NOW. Must include literal terminal commands in backticks OR exact UI click paths (e.g. "Cmd+Shift+P → Select Linter → pylint"). Never write vague instructions like "set up your environment."
4. Cover: Before Quarter Starts, Week 1, Week 2, Week 3 minimum.
5. Use <br> to break lines inside a table cell if needed.

---

### SECTION 3 — SENIOR COMMUNITY INTEL
(Generate dynamic header as instructed above)
Extract the 2-3 most actionable tips from the SENIOR TIPS DATABASE provided. Do NOT copy verbatim — paraphrase and add 1 sentence of your own commentary explaining WHY this specific tip matters for their situation. If the database has no data for a course, say so and give your best inference.


---

### SECTION 4 — YOUR IMMEDIATE NEXT MOVE
(Generate dynamic header as instructed above)
- One hyper-specific networking or career tip directly tied to their courses.
- End with this Call-to-Action (substitute actual course names):
  "Drop your specific blockers in the **Anteater Tutor community forum** — whether it's a [Course A] bug or a [Course B] convergence panic, James and the community are there. See you there! 🐜"

---

GLOBAL FORMATTING RULES:
- Total response length: 600-900 words. Dense and scannable, not an essay.
- Bullet points: max 2 lines each.
- Terminal commands and code: always in backticks.
- No filler phrases: no "Great question!", no "In conclusion", no "I hope this helps".
- Tables ONLY in Section 2. Use bullets everywhere else."""


def get_senior_tips(courses):
    tips_by_course = {}
    for course in courses:
        if course in SENIOR_TIPS_DB:
            tips_by_course[course] = SENIOR_TIPS_DB[course]
    return tips_by_course


@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        user_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
        if is_rate_limited(user_ip):
            return render_template("index.html", 
                ai_response="⚠️ You've reached the hourly limit. Please try again in an hour."), 429
        try:
            role       = request.form.get("role")
            courses    = request.form.getlist("courses")
            confidence = request.form.get("confidence")
            goals      = request.form.getlist("expertise") if role == "senior" else request.form.getlist("goal")
            user_query = request.form.get("user_query")

            # ── 学长数据库 ──
            senior_tips     = get_senior_tips(courses)
            senior_tips_str = ""
            if senior_tips:
                lines = ["=== SENIOR TIPS DATABASE ==="]
                for course, tips in senior_tips.items():
                    lines.append(f"[{course}]")
                    for i, tip in enumerate(tips, 1):
                        lines.append(f"  {i}. {tip}")
                lines.append("=== END ===")
                senior_tips_str = "\n".join(lines)

            # ── Tavily 高级定向检索 ──
            search_results = ""
            if courses and role != "senior":
                snippets = []
            for course in courses[:1]:   # 只取第1门课，避免超时
                targeted_queries = [
                    f"{course} UCI professor exam difficulty study tips reddit student experience",
                    f"{course} UCI internship career relevance skills employers",
        ]
            for query in targeted_queries:
                try:
                    res = tavily.search(query=query, search_depth="basic", max_results=3)
                    for r in res.get("results", []):
                        url = r.get("url", "").lower()
                        if "reddit.com" in url:             source_tag = "📌 r/UCI Forum"
                        elif "uci.edu" in url:              source_tag = "🎓 UCI Official"
                        elif "ratemyprofessors.com" in url: source_tag = "⭐ RateMyProfessors"
                        elif "blind.com" in url:            source_tag = "💼 Blind SWE Intel"
                        elif "linkedin.com" in url:         source_tag = "🔗 LinkedIn"
                        else:                               source_tag = "🌐 Web"
                        snippets.append(f"[{source_tag} | {r['title']}]: {r['content'][:200]}")
                except Exception:
                    pass  # Tavily 失败不影响主流程

                if snippets:
                    seen, deduped = set(), []
                    for s in snippets:
                        key = s[:60]
                        if key not in seen:
                            seen.add(key)
                            deduped.append(s)
                    search_results = "\n".join(deduped)

            # ── 组装用户上下文 ──
            parts = [
                f"Role: {role}",
                f"Courses selected: {', '.join(courses) if courses else 'none'}",
                f"Confidence level: {confidence}/10",
                f"Goals: {', '.join(goals) if goals else 'not specified'}",
                f"Student's own words: {user_query if user_query else '(none provided)'}",
            ]
            if senior_tips_str:
                parts.append(f"\n{senior_tips_str}")
            if search_results:
                parts.append(f"\n=== WEB CONTEXT ===\n{search_results}\n=== END ===")
            user_context = "\n".join(parts)

            # ── 调用 Claude ──
            message = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1500,
                temperature=0.65,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_context}],
            )
            raw     = message.content[0].text
            cleaned = re.sub(r"<thinking>.*?</thinking>", "", raw, flags=re.DOTALL).strip()
            return render_template("index.html", ai_response=cleaned)

        except Exception:
            # 返回完整 traceback，方便前端显示真实错误
            full_tb = traceback.format_exc()
            print(f"\n{'='*50}\n❌ BACKEND ERROR:\n{full_tb}\n{'='*50}\n")
            return f"Error:\n{full_tb}", 200

    return render_template("index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port, debug=False)