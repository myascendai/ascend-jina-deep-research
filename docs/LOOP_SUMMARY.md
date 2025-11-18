# Main Research Loop Summary (Lines 518-1033)

## Loop Structure

```518:1033:src/agent.ts
while (context.tokenTracker.getTotalUsage().totalTokens < regularBudget) {
  // ... loop body ...
}
```

**Purpose**: Iterative research loop that continues until either:
- Token budget is exhausted (85% of total budget)
- Early exit conditions are met (via `break` statements)

## Loop Iteration Flow

### Phase 1: Setup & Preparation (Lines 519-569)

1. **Step Tracking** (519-523)
   - Increment `step` and `totalStep` counters
   - Calculate and log budget percentage used
   - Track progress for debugging

2. **Question Selection** (524-526)
   - Select current question from `gaps` queue using rotating index
   - `currentQuestion = gaps[totalStep % gaps.length]`

3. **Evaluation Setup** (531-544)
   - **Step 1 only**: Evaluate initial question to determine evaluation types needed
   - Create evaluation metrics with `numEvalsRequired` based on `maxBadAttempts`
   - Force strict evaluation for original question
   - Sub-questions get empty evaluation metrics

4. **Action Availability Control** (546-568)
   - **Freshness detection**: Disable answer/reflect on step 1 if freshness required
   - **Reflect limit**: Disable if gaps exceed `MAX_REFLECT_PER_STEP`
   - **URL ranking**: Rank and filter URLs, keep top 2 per hostname
   - **Read availability**: Enable only if weighted URLs exist
   - **Search limit**: Disable if already have 50+ URLs

### Phase 2: Agent Decision (Lines 570-602)

5. **Prompt Generation** (571-583)
   - Generate system prompt with current context
   - Include diary context, all questions, keywords, knowledge
   - Pass available actions and weighted URLs
   - `beastMode: false` (normal mode)

6. **Schema & Message Composition** (584-585)
   - Generate schema based on allowed actions
   - Compose messages with accumulated knowledge
   - Include final answer PIP (improvement plan) if available

7. **LLM Generation** (586-600)
   - Call `generator.generateObject()` with `model: 'agent'`
   - Agent selects one action: `answer`, `reflect`, `search`, `visit`, or `coding`
   - Extract action and thinking from result
   - Log selected action vs available actions

8. **Action Tracking** (602)
   - Track action in `actionTracker` for streaming/observability

9. **Reset Action Flags** (604-609)
   - Reset all `allow*` flags to `true` for next iteration
   - (Individual actions may disable specific flags)

### Phase 3: Action Execution (Lines 611-1023)

The agent executes one of five possible actions:

#### Action 1: Answer (Lines 612-772)

**When**: Agent chooses `answer` action with an answer provided

**Process**:
- **Trivial question check** (616-621): If step 1 with answer and no references → mark trivial and `break`
- **Evaluation** (642-663): Evaluate answer quality using evaluation metrics
- **Original question handling** (665-747):
  - **If evaluation passes**: Mark `isFinal = true` and `break` (success!)
  - **If evaluation fails**: 
    - Decrement `numEvalsRequired` for failed evaluation type
    - Add improvement plan to `finalAnswerPIP` if strict evaluation
    - If all evaluations exhausted → mark `isFinal = false` and `break` (goes to beast mode)
    - Otherwise: Analyze errors, add to knowledge, reset diary context, disable answer for next step
- **Sub-question handling** (748-772): If evaluation passes, add to knowledge and remove from gaps

**Early exits**: Lines 621, 685, 702

#### Action 2: Reflect (Lines 773-803)

**When**: Agent chooses `reflect` action with questions to answer

**Process**:
- Deduplicate questions against `allQuestions`
- **If new questions found**:
  - Add to `gaps` queue and `allQuestions`
  - Update diary context with reflection results
- **If no new questions**:
  - Log that all questions were already asked
  - Update context with failure message
- Disable reflect for next step

**No early exit**: Continues to next iteration

#### Action 3: Search (Lines 804-930)

**When**: Agent chooses `search` action with search requests

**Process**:
- Deduplicate search requests
- **Execute initial search** (809-820): Search using provided queries, accumulate results
- **Team research check** (824-867):
  - If `teamSize > 1` and multiple subproblems found:
    - Call `researchPlan()` to split into subproblems
    - **Recursively call `getResponse()`** for each subproblem in parallel
    - Aggregate answers, references, URLs from subproblem responses
    - Mark `isFinal = true`, `isAggregated = true`, and `break`
  - If single subproblem: Add to gaps queue
- **Query rewriting** (869-878): Rewrite queries based on search results (soundbites)
- **Execute rewritten searches** (882-925): Search with rewritten queries, accumulate knowledge
- Update diary context with search results
- Disable search and answer for next step

**Early exit**: Line 862 (team aggregation)

#### Action 4: Visit (Lines 931-986)

**When**: Agent chooses `visit` action with URL targets

**Process**:
- Normalize URLs from indices in `urlList`
- Filter out already visited URLs
- Combine with weighted URLs, limit to `MAX_URLS_PER_STEP`
- **Process URLs** (943-955): 
  - Read content via `processURLs()`
  - Extract knowledge, images, web content
  - Track visited URLs and bad URLs
- Update diary context with visit results
- Disable read for next step

**No early exit**: Continues to next iteration

#### Action 5: Coding (Lines 987-1023)

**When**: Agent chooses `coding` action with coding issue

**Process**:
- Initialize code sandbox with context
- **Solve coding issue** (990-1006):
  - Execute via `sandbox.solve()`
  - Add solution to knowledge with source code
  - Update diary context
- **Error handling** (1007-1019): If solution fails, log error and update context
- Disable coding for next step

**No early exit**: Continues to next iteration

### Phase 4: End of Iteration (Lines 1025-1033)

10. **Context Storage** (1025-1032)
    - Store prompt, schema, and memory state via `storeContext()`
    - For debugging and async context tracking

11. **Rate Limiting** (1033)
    - `await wait(STEP_SLEEP)` delay before next iteration
    - Prevents API rate limiting

12. **Loop Back to Budget Check** (→ Line 518)
    - Control flow returns to while condition
    - Budget check re-evaluated
    - If passed → continue to next iteration
    - If failed → exit loop

## State Variables Updated Per Iteration

- **`step`**, **`totalStep`**: Incremented
- **`currentQuestion`**: Rotated from gaps queue
- **`allKnowledge`**: Accumulated from actions
- **`allURLs`**, **`weightedURLs`**: Updated from search/visit
- **`allKeywords`**: Updated from search
- **`gaps`**: Modified by reflect (add) or answer (remove)
- **`diaryContext`**: Updated with action results
- **`evaluationMetrics`**: Updated based on evaluation results
- **`finalAnswerPIP`**: Updated from failed strict evaluations
- **`allow*` flags**: Reset, then conditionally disabled
- **`visitedURLs`**, **`badURLs`**: Updated from visit action
- **`imageObjects`**: Updated from visit action (if `withImages` enabled)

## Early Exit Conditions

The loop can exit early via `break` statements:

1. **Line 621**: Trivial question answered at step 1
2. **Line 685**: Original question answered and evaluation passes
3. **Line 702**: All evaluation attempts exhausted (routes to beast mode)
4. **Line 862**: Team research completed with aggregated answer

## Normal Exit Condition

- **Line 518**: Budget check fails (`tokenUsage >= regularBudget`)
- Exits to beast mode if `isFinal === false`

## Key Characteristics

- **Iterative**: Continues until budget exhausted or answer found
- **Adaptive**: Action availability changes based on context
- **Accumulative**: Knowledge, URLs, and context build over iterations
- **Self-correcting**: Failed evaluations trigger error analysis and improvement
- **Multi-threaded**: Team research spawns parallel recursive calls
- **Observable**: All actions tracked for streaming/logging


