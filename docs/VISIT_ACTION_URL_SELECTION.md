# Visit Action URL Selection Process

## Overview

The Visit action does **NOT** visit all URLs. It uses a multi-stage filtering and selection process to visit only the most relevant URLs, with a hard limit of **5 URLs per step** (`MAX_URLS_PER_STEP = 5`).

## Selection Process Flow

### Stage 1: Pre-Step URL Filtering & Ranking (Lines 553-563)

**Location**: `src/agent.ts:553-563`

Before each loop iteration, URLs are filtered and ranked:

```typescript
// Filter URLs
filteredURLs = filterURLs(allURLs, visitedURLs, badHostnames, onlyHostnames)

// Rank URLs by relevance
weightedURLs = rankURLs(filteredURLs, {
  question: currentQuestion,
  boostHostnames
}, context)

// Keep top 2 URLs per hostname for diversity
weightedURLs = keepKPerHostname(weightedURLs, 2)
```

**Filtering** (`filterURLs()`):
- **Excludes**: Already visited URLs (`visitedURLs`)
- **Excludes**: URLs from bad hostnames (`badHostnames`)
- **Includes only**: URLs from `onlyHostnames` (if specified)
- **Input**: All URLs accumulated from search actions (`allURLs`)

**Ranking** (`rankURLs()`):
- Uses semantic reranking via Jina API (if question provided)
- Boosts based on:
  - Term frequency (`freqFactor = 0.5`)
  - Hostname frequency (`hostnameBoostFactor = 0.5`)
  - Path frequency (`pathBoostFactor = 0.4`)
  - Jina rerank score (`jinaRerankFactor = 0.8`)
  - Boosted hostnames (+2 boost)
- Returns URLs sorted by `finalScore` (descending)

**Diversity** (`keepKPerHostname()`):
- Limits to **top 2 URLs per hostname**
- Prevents over-concentration on single domains

### Stage 2: Prompt Generation - Show Top URLs (Line 147)

**Location**: `src/utils/url-tools.ts:355-370` called from `src/agent.ts:147`

```typescript
urlList = sortSelectURLs(weightedURLs, 20)
```

**Process**:
- Takes ranked `weightedURLs`
- Sorts by `finalScore` (already sorted from ranking)
- Takes **top 20 URLs**
- Formats them for the prompt with:
  - Index (1-20)
  - Weight/score
  - URL
  - Preview (first 50 chars of merged title/description)

**Prompt Format**:
```
<action-visit>
- Choose and visit relevant URLs below for more knowledge. higher weight suggests more relevant:
<url-list>
  - [idx=1] [weight=4.5] "https://example.com": "Example title and description..."
  - [idx=2] [weight=4.2] "https://example.org": "..."
  ...
</url-list>
</action-visit>
```

### Stage 3: Agent Selection (Lines 321-324, 586-592)

**Location**: `src/utils/schemas.ts:321-324` and `src/agent.ts:586-592`

The agent (LLM) selects URLs by providing **indices** (1-20):

```typescript
URLTargets: z.array(z.number())
  .max(MAX_URLS_PER_STEP)  // Maximum 5 URLs
  .describe(`Required when action='visit'. Must be the index of the URL in from the original list of URLs. Maximum ${MAX_URLS_PER_STEP} URLs allowed.`)
```

**Constraints**:
- **Maximum 5 URLs** per visit action (`MAX_URLS_PER_STEP = 5`)
- Agent selects by **index** (1-20) from the `urlList` shown in prompt
- Agent can select **fewer** than 5 if desired

**Example**: Agent might select `[1, 3, 7]` to visit URLs at indices 1, 3, and 7.

### Stage 4: URL Selection & Merging (Lines 931-937)

**Location**: `src/agent.ts:931-937`

```typescript
// Convert indices to URLs
thisStep.URLTargets = (thisStep.URLTargets as number[])
  .map(idx => normalizeUrl(urlList[idx - 1]))  // Convert index to URL (1-based to 0-based)
  .filter(url => url && !visitedURLs.includes(url))  // Filter out already visited

// Merge with weightedURLs and limit
thisStep.URLTargets = [...new Set([
  ...thisStep.URLTargets,           // Agent-selected URLs
  ...weightedURLs.map(r => r.url!)  // Top ranked URLs
])].slice(0, MAX_URLS_PER_STEP)     // Limit to 5
```

**Process**:
1. **Convert indices to URLs**: Maps agent's index selections (1-20) to actual URLs from `urlList`
2. **Filter visited**: Removes URLs already in `visitedURLs`
3. **Merge sources**: Combines:
   - Agent-selected URLs (from indices)
   - Top URLs from `weightedURLs` (ranked list)
4. **Deduplicate**: Uses `Set` to remove duplicates
5. **Hard limit**: `.slice(0, MAX_URLS_PER_STEP)` ensures **maximum 5 URLs**

**Important**: Even if agent selects 5 URLs and `weightedURLs` has many URLs, the final selection is **capped at 5**.

### Stage 5: URL Processing (Lines 943-955)

**Location**: `src/agent.ts:943-955` → `src/utils/url-tools.ts:466-632`

```typescript
processURLs(
  uniqueURLs,        // Final selected URLs (max 5)
  context,
  allKnowledge,
  allURLs,
  visitedURLs,
  badURLs,
  imageObjects,
  SchemaGen,
  currentQuestion,
  allWebContents,
  withImages
)
```

**Process**:
- Processes URLs **in parallel** (`Promise.all`)
- Reads content, extracts knowledge, images
- Updates `visitedURLs` and `badURLs`
- Returns results

## Summary: What Gets Visited?

### Per Visit Action:
- **Maximum**: 5 URLs (`MAX_URLS_PER_STEP`)
- **Minimum**: 0 URLs (if all selected URLs already visited)

### Selection Sources:
1. **Agent-selected URLs**: Indices (1-20) chosen by LLM from prompt
2. **Top-ranked URLs**: From `weightedURLs` (already ranked by relevance)

### Filtering Applied:
- ✅ Excludes already visited URLs
- ✅ Excludes bad hostnames
- ✅ Respects `onlyHostnames` filter (if set)
- ✅ Limited to top 2 per hostname (diversity)
- ✅ Hard cap of 5 URLs total

### Example Flow:

```
Starting state:
- allURLs: 100 URLs from searches
- visitedURLs: 15 URLs already visited
- weightedURLs: 85 filtered + ranked URLs

Step 1:
- Filtered: 85 URLs (excludes 15 visited)
- Ranked: 85 URLs sorted by relevance
- Diversity: Top 2 per hostname → 40 URLs
- Shown to agent: Top 20 URLs in prompt
- Agent selects: [1, 3, 5, 7, 9] (5 URLs)
- Final selection: 5 URLs (agent selections)
- Processed: 5 URLs visited

Step 2:
- Filtered: 80 URLs (excludes 20 visited now)
- Ranked: 80 URLs sorted by relevance
- Diversity: Top 2 per hostname → 35 URLs
- Shown to agent: Top 20 URLs in prompt
- Agent selects: [2, 4] (2 URLs)
- Final selection: 2 URLs (agent selections)
- Processed: 2 URLs visited

Total after 2 steps: 7 URLs visited (not all 100)
```

## Key Constraints

| Constraint | Value | Location |
|------------|-------|----------|
| **Max URLs per step** | 5 | `MAX_URLS_PER_STEP` constant |
| **URLs shown in prompt** | 20 | `sortSelectURLs(weightedURLs, 20)` |
| **Max URLs per hostname** | 2 | `keepKPerHostname(weightedURLs, 2)` |
| **Agent selection range** | 1-20 | Indices from prompt |

## Why This Design?

1. **Token Efficiency**: Visiting all URLs would consume excessive tokens
2. **Relevance**: Ranking ensures most relevant URLs are prioritized
3. **Diversity**: Hostname limit prevents over-focus on single domains
4. **Agent Control**: LLM selects based on current context and needs
5. **Iterative**: Can visit more URLs in subsequent steps if needed

## Answer to Question

**Q: Does it visit all URLs? Or only some?**

**A: Only some. Maximum 5 URLs per visit action, selected through a multi-stage process:**
1. Filter out visited/bad URLs
2. Rank by relevance (semantic + frequency + hostname)
3. Show top 20 to agent
4. Agent selects up to 5 by index
5. Merge with top-ranked URLs and cap at 5
6. Process selected URLs

The agent can take multiple visit actions across iterations to gradually visit more URLs, but each individual visit action is limited to 5 URLs.


