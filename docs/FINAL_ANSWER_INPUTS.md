# Final Answer Generation Inputs

## Overview

After the main loop exits (line 1034), the final answer is generated using accumulated state from the research iterations. This document details the exact inputs used in each path.

## Exit Paths

### Path 1: Beast Mode (if `isFinal === false`)

**Location**: Lines 1036-1076

**Trigger**: Loop exits with no final answer yet (budget exhausted or evaluation exhausted)

#### Inputs to `getPrompt()` (Line 1045):

```typescript
getPrompt(
  diaryContext,        // Array of step-by-step diary entries from loop
  allQuestions,        // All questions including original + sub-questions
  allKeywords,         // All search queries attempted
  false,               // allowReflect = false
  false,               // allowRead = false  
  false,               // allowSearch = false
  false,               // allowCoding = false
  allKnowledge,        // All accumulated knowledge items
  weightedURLs,        // Ranked URLs from search/visit actions
  true                 // beastMode = true
)
```

**Exact Values**:
- `diaryContext`: String array - step-by-step diary of actions taken
- `allQuestions`: String array - original question + all sub-questions from reflect actions
- `allKeywords`: String array - all search queries executed during loop
- `allKnowledge`: `KnowledgeItem[]` - accumulated Q&A pairs, side-info, URL content, coding solutions
- `weightedURLs`: `BoostedSearchSnippet[]` - ranked URLs with scores, titles, descriptions

#### Inputs to `SchemaGen.getAgentSchema()` (Line 1059):

```typescript
SchemaGen.getAgentSchema(
  false,               // allowReflect = false
  false,               // allowRead = false
  true,                // allowAnswer = true (ONLY action allowed)
  false,               // allowSearch = false
  false,               // allowCoding = false
  question             // Original question string
)
```

#### Inputs to `composeMsgs()` (Line 1060):

```typescript
composeMsgs(
  messages,            // Original user messages array
  allKnowledge,        // All accumulated knowledge items
  question,            // Original question string
  finalAnswerPIP       // Improvement plans from failed evaluations
)
```

**What `composeMsgs()` does**:
1. Builds user-assistant pairs from `allKnowledge` via `BuildMsgsFromKnowledge()`
2. Appends original `messages` array
3. Adds final user message with:
   - Original `question`
   - `finalAnswerPIP` (if present) wrapped in `<answer-requirements>` tags

#### Inputs to `generator.generateObject()` (Line 1061):

```typescript
generator.generateObject({
  model: 'agentBeastMode',  // Special beast mode model
  schema,                    // Schema with only answer action
  system,                    // System prompt from getPrompt()
  messages: msgWithKnowledge, // Composed messages
  numRetries: 2              // Retry count
})
```

**Result**: `thisStep` is updated with the generated answer action.

---

### Path 2: Trivial Question (if `trivialQuestion === true`)

**Location**: Lines 1080-1081

**Trigger**: Answer given at step 1 without references

#### Inputs to `buildMdFromAnswer()` (Line 1081):

```typescript
buildMdFromAnswer(answerStep)
```

**Input**: `answerStep` object containing:
- `answer`: String - raw answer text
- `references`: `Reference[]` - references (if any)
- `think`: String - thinking process
- Other AnswerAction fields

**Process**: Simple markdown conversion, **skips** finalization and reference building.

---

### Path 3: Normal Final Processing (if `!trivialQuestion && !isAggregated`)

**Location**: Lines 1082-1122

**Trigger**: Normal path after loop or beast mode

#### Step 3.1: Finalize Answer (Line 1088)

**Inputs to `finalizeAnswer()`**:

```typescript
finalizeAnswer(
  answerStep.answer,   // Raw answer text from thisStep
  allKnowledge,        // All accumulated knowledge items
  context,             // TrackerContext with tokenTracker and actionTracker
  SchemaGen            // Schema generator with language settings
)
```

**What `finalizeAnswer()` uses internally**:
- `mdContent`: The raw answer text
- `knowledgeItems`: All knowledge items for context
- `schema.languageCode`: Language code for proper formatting
- Generates a prompt using `getPrompt()` in finalizer.ts with:
  - System prompt: Editor instructions for polishing content
  - User prompt: The markdown content to be finalized

**Output**: Polished/finalized answer text

#### Step 3.2: Build References (Line 1098)

**Inputs to `buildReferences()`**:

```typescript
buildReferences(
  answerStep.answer,      // Finalized answer text
  allWebContents,         // Record<string, WebContent> - extracted web content
  context,                // TrackerContext
  SchemaGen,              // Schema generator
  80,                     // minChunkLength = 80 characters
  maxRef,                 // Maximum references (from function parameter, default 10)
  minRelScore,           // Minimum relevance score (from function parameter, default 0.80)
  onlyHostnames          // Filter hostnames (from function parameter)
)
```

**What `buildReferences()` uses**:
- `answer`: Finalized answer text (chunked)
- `webContents`: All web content extracted during visit actions:
  - `title`: Page title
  - `chunks`: Text chunks from page
  - `chunk_positions`: Position ranges for chunks
- Uses embeddings for semantic matching between answer chunks and web content chunks

**Output**: Updated answer with citations and references array

#### Step 3.3: Update References (Line 1111)

**Inputs to `updateReferences()`**:

```typescript
updateReferences(answerStep, allURLs)
```

**Inputs**:
- `answerStep`: AnswerAction with references
- `allURLs`: `Record<string, SearchSnippet>` - all URLs discovered during search

**Process**: Adds titles, exact quotes, dates to references from `allURLs`.

#### Step 3.4: Build Image References (Line 1116, if `withImages === true`)

**Inputs to `buildImageReferences()`**:

```typescript
buildImageReferences(
  answerStep.answer,    // Finalized answer text
  imageObjects,         // ImageObject[] - images extracted during visit actions
  context,              // TrackerContext
  SchemaGen             // Schema generator
)
```

**What it uses**:
- `answer`: Finalized answer text (chunked)
- `imageObjects`: Images extracted from visited URLs:
  - `url`: Image URL
  - `embedding`: Image embedding vector
  - Other image metadata
- Uses embeddings for semantic matching

---

### Path 4: Aggregated Answer (if `isAggregated === true`)

**Location**: Lines 1123-1133

**Trigger**: Team-based research with multiple subproblems

#### Inputs:

```typescript
candidateAnswers        // String array - pre-processed answers from subproblems
answerStep.imageReferences // Image references from subproblems
```

**Process**:
- Concatenates `candidateAnswers` with `'\n\n'` separator
- Filters and deduplicates images if `withImages === true`
- **Skips** finalization and reference building (already done in subproblems)

---

## Complete Input Summary

### State Variables Used

| Variable | Type | Source | Used In |
|----------|------|--------|---------|
| `diaryContext` | `string[]` | Accumulated during loop | Beast mode prompt |
| `allQuestions` | `string[]` | Original + reflect sub-questions | Beast mode prompt |
| `allKeywords` | `string[]` | All search queries | Beast mode prompt |
| `allKnowledge` | `KnowledgeItem[]` | Accumulated from all actions | Beast mode, finalize, composeMsgs |
| `weightedURLs` | `BoostedSearchSnippet[]` | Ranked URLs from search/visit | Beast mode prompt |
| `finalAnswerPIP` | `string[]` | From failed strict evaluations | Beast mode composeMsgs |
| `messages` | `CoreMessage[]` | Original user messages | Beast mode composeMsgs |
| `question` | `string` | Original question | Beast mode, schema |
| `allWebContents` | `Record<string, WebContent>` | Extracted from visit actions | buildReferences |
| `allURLs` | `Record<string, SearchSnippet>` | All discovered URLs | updateReferences |
| `imageObjects` | `ImageObject[]` | Extracted from visit actions | buildImageReferences |
| `answerStep.answer` | `string` | Generated answer | finalize, buildReferences |
| `candidateAnswers` | `string[]` | From team subproblems | Aggregated path |
| `context` | `TrackerContext` | Token/action tracking | All post-processing |
| `SchemaGen` | `Schemas` | Language/schema config | All post-processing |

### Function Parameters Used

| Parameter | Default | Used In |
|-----------|---------|---------|
| `maxRef` | `10` | `buildReferences()` |
| `minRelScore` | `0.80` | `buildReferences()` |
| `onlyHostnames` | `[]` | `buildReferences()`, `updateReferences()` |
| `withImages` | `false` | `buildImageReferences()` |

## Key Observations

1. **Beast Mode**: Uses all accumulated context but disables all actions except answer
2. **Finalization**: Uses raw answer + all knowledge for LLM-based polishing
3. **Reference Building**: Uses finalized answer + web contents for semantic matching
4. **Knowledge Integration**: `allKnowledge` is converted to conversation format in `composeMsgs()`
5. **URL Ranking**: `weightedURLs` used in prompt but not directly in final answer
6. **Improvement Plans**: `finalAnswerPIP` only used in beast mode, not in finalization


