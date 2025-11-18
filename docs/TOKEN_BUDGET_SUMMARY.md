# Token Budget System Summary

## Core Budget Check

**Location**: `src/agent.ts:518`
```518:518:src/agent.ts
while (context.tokenTracker.getTotalUsage().totalTokens < regularBudget) {
```

**Budget Calculation**: `regularBudget = tokenBudget * 0.85` (reserves 15% for beast mode)

## Key Findings

### 1. Budget Checkpoints

**Single Checkpoint Per Instance**: Each `getResponse()` call has one while loop that checks the budget at:
- **Initial entry**: After initialization (line 518)
- **Loop-back**: End of each iteration (line 1033 → 518)

**Recursive Instances**: Team-based research (`teamSize > 1`) creates parallel `getResponse()` calls at line 829, each with its own budget check loop.

**Early Exits**: Four `break` statements bypass budget re-check:
- Trivial question (line 621)
- Evaluation pass (line 685)
- Evaluation exhausted (line 702)
- Team aggregation (line 862)

### 2. Token Tracking

**Sources**: Tokens tracked from:
- LLM calls (object generation, error recovery)
- Jina APIs (search credits, rerank, classify spam)
- Manual calculations (read tool, embeddings)
- Answer processing (reducer, finalizer, markdown fixer)

**Current Scaler**: 1x multiplier (3x for completion tokens previously commented out)

**Shared Budget Pool**: Recursive calls share the same `TokenTracker` instance, competing for the same budget pool.

### 3. Budget Sources (Priority Order)

1. **Request body override**: `body.budget_tokens` (highest priority)
2. **Reasoning effort**: `body.reasoning_effort` → `getTokenBudgetAndMaxAttempts()`
   - `'low'`: 100,000 tokens
   - `'medium'`: 500,000 tokens (default)
   - `'high'`: 1,000,000 tokens
3. **Max completion tokens**: `body.max_completion_tokens` (overrides reasoning effort)
4. **CLI option**: `--token-budget` (default: 1,000,000)
5. **Default**: 1,000,000 tokens

### 4. Control Flow Dependencies

**When Budget Check PASSES (Loop Continues)**:
- Research iterations (search, read, reflect, coding actions)
- Knowledge accumulation and URL processing
- Evaluations and improvements
- Context storage
- Can exit early if answer found

**When Budget Check FAILS (Loop Exits)**:
- Stops research iteration
- Triggers beast mode if `isFinal === false`
- Uses remaining 15% budget for single LLM call
- Processes answer (finalization, references) if not trivial/aggregated

### 5. Beast Mode

**Trigger**: Loop exits AND `isFinal === false`

**Behavior**:
- Uses `beastMode: true` prompt (disables all actions except answer)
- Single LLM call with remaining 15% budget
- Uses `'agentBeastMode'` model
- Sets `isFinal = true` after generation

### 6. Answer Processing Paths

**Trivial Question** (`trivialQuestion === true`):
- Skips finalization and reference building
- Simple markdown conversion

**Non-Aggregated Answer** (`isAggregated === false`):
- Answer finalization via LLM
- Markdown repair pipeline
- Reference building via embeddings
- Image references (if enabled)

**Aggregated Answer** (`isAggregated === true`):
- Simple concatenation of candidate answers
- Skips finalization and reference building

### 7. Critical Flags

**`isFinal`**:
- `true`: Evaluation passed, trivial question, after beast mode, or team aggregation
- `false`: Initial state or evaluation exhausted
- Controls whether beast mode executes after loop exit

**`trivialQuestion`**: Set when answer given at step 1 without references
- Skips expensive finalization

**`isAggregated`**: Set when team-based research produces subproblem answers
- Uses pre-processed answers, skips finalization

## Conclusions

1. **Budget Reserve**: 15% of total budget reserved for beast mode final answer
2. **No Active Enforcement**: `TokenTracker` stores budget but doesn't enforce it; enforcement is done by while loop condition
3. **Shared Budget Pool**: Recursive calls share `TokenTracker`, so they compete for the same budget
4. **Early Exits**: Can bypass budget check entirely if answer found early
5. **Single Checkpoint**: Each instance has one while loop, but check is evaluated multiple times (initial + each iteration)
6. **No Conditional Re-entry**: Once loop exits, it never re-enters; budget check not re-evaluated after exit

