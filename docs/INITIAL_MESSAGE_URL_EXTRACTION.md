# Message URL Extraction and Usage

## Overview

The "Extract URLs from Messages" step (lines 503-516) extracts URLs mentioned in the initial user messages and adds them to the URL pool. However, **they are NOT automatically visited** - they go through the same ranking and selection process as search URLs.

## Extraction Process (Lines 503-516)

```typescript
// add all mentioned URLs in messages to allURLs
messages.forEach(m => {
  let strMsg = '';
  if (typeof m.content === 'string') {
    strMsg = m.content.trim();
  } else if (typeof m.content === 'object' && Array.isArray(m.content)) {
    // find the very last sub content whose 'type' is 'text'  and use 'text' as the question
    strMsg = m.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  }

  extractUrlsWithDescription(strMsg).forEach(u => {
    addToAllURLs(u, allURLs);
  });
})
```

### What `extractUrlsWithDescription()` Does

**Location**: `src/utils/url-tools.ts:679-764`

**Process**:
1. **Finds URLs**: Uses regex to find all `http://` and `https://` URLs in the message text
2. **Cleans URLs**: Removes trailing punctuation (periods, commas, etc.)
3. **Extracts Context**: For each URL, extracts surrounding text:
   - **Default**: 50 characters before and after the URL
   - Handles overlapping URLs (adjusts boundaries)
   - Combines before/after text as description
4. **Returns**: Array of `SearchSnippet` objects with:
   - `url`: The extracted URL
   - `description`: Surrounding context text (up to 50 chars before + 50 chars after)
   - `title`: Empty string (no title available from message)

**Example**:
```
Input: "Check out this article about AI: https://example.com/article about machine learning and neural networks."

Output: {
  url: "https://example.com/article",
  description: "Check out this article about AI: ... about machine learning and neural networks.",
  title: ""
}
```

### What `addToAllURLs()` Does

**Location**: `src/utils/url-tools.ts:340-353`

**Process**:
1. **Normalizes URL**: Converts URL to normalized form
2. **Checks if exists**: 
   - **If new**: Adds to `allURLs` with `weight = 1` (default `weightDelta`)
   - **If exists**: Increments weight and merges descriptions
3. **Returns**: 1 if new URL added, 0 if already existed

**Important**: URLs from messages get **weight = 1** (same as initial search results).

## What Happens After Extraction

### Integration into URL Pool

The extracted URLs are added to `allURLs` and then:

1. **Go through filtering** (Line 556):
   - Same filters as search URLs:
     - Excludes already visited URLs
     - Excludes bad hostnames
     - Respects `onlyHostnames` filter

2. **Go through ranking** (Line 555):
   - Same ranking algorithm as search URLs:
     - Semantic reranking via Jina API
     - Frequency-based boosting
     - Hostname/path boosting
     - **No special priority** - compete on equal footing

3. **Diversity filtering** (Line 563):
   - Limited to top 2 per hostname (same as search URLs)

4. **Prompt inclusion** (Line 147):
   - Top 20 ranked URLs shown to agent (may include message URLs if they rank high)

5. **Agent selection** (Lines 931-937):
   - Agent can select message URLs by index (1-20)
   - Still subject to `MAX_URLS_PER_STEP = 5` limit

### No Automatic Visiting

**Key Point**: URLs from messages are **NOT automatically visited**. They:
- ✅ Are added to the URL pool
- ✅ Can be ranked and shown in prompt
- ✅ Can be selected by agent for visiting
- ❌ Are **NOT** automatically visited without agent selection
- ❌ Have **NO special priority** over search URLs

## Example Flow

### Scenario: User Message Contains URLs

```
User message: "Can you check these sources about quantum computing?
- https://example.com/quantum1 (this is about qubits)
- https://example.com/quantum2 (discusses superposition)
- Also search for more recent papers."
```

### Step-by-Step Processing:

1. **Extraction** (Lines 503-516):
   - Extracts 2 URLs with descriptions:
     - `https://example.com/quantum1` with description "...about qubits"
     - `https://example.com/quantum2` with description "...discusses superposition"
   - Adds to `allURLs` with `weight = 1` each

2. **First Loop Iteration** (Lines 553-565):
   - `allURLs` contains 2 message URLs
   - Filter: 2 URLs (none visited yet)
   - Rank: 2 URLs ranked by relevance to question
   - Diversity: Both URLs included (different hostnames)
   - Top 20: Both URLs shown in prompt (if ranked high enough)

3. **Agent Decision**:
   - Agent sees both URLs in prompt with indices and weights
   - Agent may or may not select them for visiting
   - If selected: URLs get visited (subject to 5 URL limit)
   - If not selected: URLs remain in pool for future iterations

4. **Search Results** (If agent chooses search):
   - Search results also added to `allURLs`
   - Message URLs now compete with search URLs
   - All URLs ranked together
   - Top 20 shown to agent (mix of message + search URLs)

5. **Future Iterations**:
   - Message URLs remain in `allURLs` until visited
   - Can be selected in later iterations
   - Once visited, excluded from future prompts

## Key Characteristics

| Aspect | Behavior |
|--------|----------|
| **Weight** | Starts at `weight = 1` (same as search results) |
| **Priority** | No special priority - competes equally with search URLs |
| **Auto-visit** | ❌ NOT automatically visited |
| **Prompt inclusion** | ✅ Shown if ranks in top 20 |
| **Selection** | ✅ Agent can select by index |
| **Persistence** | ✅ Remains in pool until visited or filtered out |

## Purpose

The extraction serves to:
1. **Capture user intent**: URLs mentioned by user are likely relevant
2. **Respect user input**: User-provided URLs should be considered
3. **Integrate seamlessly**: Treats user URLs same as discovered URLs
4. **Enable prioritization**: User URLs can be prioritized through ranking if relevant

## Comparison: Message URLs vs Search URLs

| Feature | Message URLs | Search URLs |
|---------|--------------|-------------|
| **Source** | User messages | Search API results |
| **Initial Weight** | 1 | 1 |
| **Description** | Context from message (50 chars) | Title + snippet from search |
| **Title** | Empty | From search result |
| **Date** | None | From search result (if available) |
| **Processing** | Same ranking/filtering | Same ranking/filtering |
| **Selection** | Same agent selection | Same agent selection |

## Answer to Question

**Q: What does it actually do with the Extract URLs from the initial messages?**

**A: It extracts URLs with surrounding context, adds them to the URL pool (`allURLs`) with weight=1, and then treats them exactly like search URLs:**

1. **Extraction**: Finds URLs in message text and extracts 50 chars of context before/after as description
2. **Addition**: Adds to `allURLs` dictionary with initial weight of 1
3. **Integration**: URLs go through same filtering and ranking as search URLs
4. **Selection**: Can appear in prompt (if ranked high) and be selected by agent
5. **No auto-visit**: NOT automatically visited - requires agent selection
6. **No special treatment**: Compete equally with search URLs for ranking and selection

The URLs from messages are essentially "seed URLs" that get included in the discovery pool, but they still need to be selected by the agent through the normal visit action process.


