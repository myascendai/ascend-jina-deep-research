import { PromptPair, SearchAction, SERPQuery, TrackerContext } from '../types';
import { ObjectGeneratorSafe } from "../utils/safe-generator";
import { Schemas } from "../utils/schemas";
import { logInfo, logError, logDebug, logWarning } from '../logging';


function getPrompt(query: string, think: string, context: string): PromptPair {
  const currentTime = new Date();
  const currentYear = currentTime.getFullYear();
  const currentMonth = currentTime.getMonth() + 1;

  return {
    system: `
You are an expert search query expander with deep psychological understanding.
You optimize user queries by extensively analyzing potential user intents and generating comprehensive query variations.

The current time is ${currentTime.toISOString()}. Current year: ${currentYear}, current month: ${currentMonth}.

<research-intent>
For person/OSINT research, identify the likely research purpose and tailor queries accordingly:

1. **Verification**: Verify claims about education, credentials, work history, certifications
   → Use site:linkedin.com, site:university.edu, "name" + credentials + verification

2. **Reputation**: Find public perception, red flags, controversies, legal issues
   → Search for news articles, complaints, lawsuits, reviews, public records

3. **Professional**: Investigate business activities, partnerships, deals, investments
   → Search for company affiliations, board positions, funding rounds, press releases

4. **Engagement**: Find interests, activities, social presence for outreach opportunities
   → Search for interviews, speeches, social media profiles, hobbies, causes they support

Based on the query context and any known information, prioritize the most relevant research intent.
</research-intent>

<cognitive-personas>
Generate ONE optimized query from each of these 4 cognitive perspectives (optimized for person/OSINT research):

1. Temporal Context: Add a time-sensitive query that incorporates the current date (${currentYear}-${currentMonth}) to ensure recency and freshness of information. For person research, focus on recent news, current position, latest activities.
2. Detail Analyst: Obsess over precise specifications, technical details, and exact parameters. For person research, focus on specific facts like LinkedIn profile, credentials, education, job titles, company affiliations.
3. Historical Researcher: Examine how the subject has evolved over time, previous iterations, and historical context. For person research, focus on career timeline, past employers, previous positions, professional progression.
4. Globalizer: Identify the most authoritative language/region for the subject matter. For person research, search in the person's native language or the language of their primary market to access local news and information.

Ensure each persona contributes exactly ONE high-quality query that follows the schema format. These 4 queries will be combined into a final array.
</cognitive-personas>

<rules>
Leverage the soundbites from the context user provides to generate queries that are contextually relevant.

1. Query content rules:
   - Split queries for distinct aspects
   - Add operators only when necessary
   - Ensure each query targets a specific intent
   - Remove fluff words but preserve crucial qualifiers
   - Keep 'q' field short and keyword-based (2-5 words ideal)

2. Schema usage rules:
   - Always include the 'q' field in every query object (should be the last field listed)
   - Use 'tbs' for time-sensitive queries (remove time constraints from 'q' field)
   - Include 'location' only when geographically relevant
   - Never duplicate information in 'q' that is already specified in other fields
   - List fields in this order: tbs, location, q

<query-operators>
For the 'q' field content:
- "exact phrase" : use quotes for exact name match (critical for person research to avoid namesakes)
- site:domain.com : search within specific site (linkedin.com, twitter.com, github.com, scholar.google.com)
- +term : must include term; for critical terms that must appear
- -term : exclude term; exclude common namesakes or irrelevant results
- filetype:pdf/doc : find resumes, papers, reports

Person research site operators (use when appropriate):
- site:linkedin.com "Person Name" : professional profile
- site:twitter.com OR site:x.com "Person Name" : social presence
- site:github.com "Person Name" : developer activity
- site:scholar.google.com "Person Name" : academic publications
- site:crunchbase.com "Person Name" : startup/investment info

Note: A query can't only have operators; operators can't be at the start of a query
</query-operators>
</rules>

<examples>
<example-1>
Input Query: Meg Fasy EventsGIG founder
<think>
Meg Fasy EventsGIG founder...这是在调查一个人物。需要了解她的最新动态、具体背景信息、职业历史，以及用当地语言搜索更多信息。EventsGIG看起来是个活动行业的公司，Meg Fasy应该是创始人。需要找到她的LinkedIn、过往工作经历、最近的新闻报道等。

从四个角度来搜索：最近的新闻和动态、具体的职位和公司信息、职业发展历程、以及英文本地搜索获取更多细节。
</think>
queries: [
  {
    "tbs": "qdr:m",
    "q": "Meg Fasy EventsGIG news"
  },
  {
    "q": "Meg Fasy LinkedIn EventsGIG founder CEO"
  },
  {
    "q": "Meg Fasy career history previous companies"
  },
  {
    "q": "Meg Fasy FazeFWD sponsorship events industry"
  }
]
</example-1>

<example-2>
Input Query: 张三 阿里巴巴 产品经理
<think>
张三 阿里巴巴 产品经理...这是在调查一个中国科技公司的产品经理。需要找到他的最新动态、LinkedIn或脉脉资料、过往工作经历，以及中文搜索获取更多本地信息。

四个角度：最近的职位变动或新闻、具体的职业信息和社交媒体、职业发展历程、以及中文搜索获取国内平台信息。
</think>
queries: [
  {
    "tbs": "qdr:m",
    "q": "张三 阿里巴巴 最新动态"
  },
  {
    "q": "张三 阿里巴巴 产品经理 LinkedIn 脉脉"
  },
  {
    "q": "张三 阿里巴巴 职业经历 前公司"
  },
  {
    "q": "Zhang San Alibaba product manager profile"
  }
]
</example-2>

<example-3>
Input Query: 田中太郎 ソニー エンジニア
<think>
田中太郎 ソニー エンジニア...日本の大手企業のエンジニアを調査している。最新の動向、LinkedIn や職務経歴、過去のキャリア、そして日本語での詳細情報を探す必要がある。

四つの視点から検索：最近のニュースや活動、具体的なプロフィール情報、キャリア履歴、そして英語での国際的な情報。
</think>
queries: [
  {
    "tbs": "qdr:m",
    "q": "田中太郎 ソニー 最新ニュース"
  },
  {
    "q": "田中太郎 ソニー エンジニア LinkedIn プロフィール"
  },
  {
    "q": "田中太郎 ソニー 職歴 前職"
  },
  {
    "q": "Taro Tanaka Sony engineer profile"
  }
]
</example-3>
</examples>

Each generated query must follow JSON schema format.
`,
    user: `
My original search query is: "${query}"

My motivation is: ${think}

So I briefly googled "${query}" and found some soundbites about this topic, hope it gives you a rough idea about my context and topic:
<random-soundbites>
${context}
</random-soundbites>

Given those info, now please generate the best effective queries that follow JSON schema format; add correct 'tbs' you believe the query requires time-sensitive results. 
`
  };
}
const TOOL_NAME = 'queryRewriter';

export async function rewriteQuery(action: SearchAction, context: string, trackers: TrackerContext, schemaGen: Schemas): Promise<SERPQuery[]> {
  try {
    const generator = new ObjectGeneratorSafe(trackers.tokenTracker);
    const queryPromises = action.searchRequests.map(async (req) => {
      const prompt = getPrompt(req, action.think, context);
      const result = await generator.generateObject({
        model: TOOL_NAME,
        schema: schemaGen.getQueryRewriterSchema(),
        system: prompt.system,
        prompt: prompt.user,
      });
      trackers?.actionTracker.trackThink(result.object.think);
      return result.object.queries;
    });

    const queryResults = await Promise.all(queryPromises);
    const allQueries: SERPQuery[] = queryResults.flat();
    logInfo(TOOL_NAME, { queries: allQueries });
    return allQueries;
  } catch (error) {
    logError('Query rewrite error:', { error });
    throw error;
  }
}