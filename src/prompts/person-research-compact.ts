/**
 * Compact Person Research Prompt
 *
 * Optimized for token efficiency while maintaining comprehensive coverage.
 * Designed to be embedded in user message, not system message.
 */

export function buildCompactPersonResearchPrompt(personName: string, knownInfo?: string): string {
  return `Conduct comprehensive OSINT person background research on ${personName}.

${knownInfo ? `Known info: ${knownInfo}\n` : ''}
Research systematically across these dimensions:

1. IDENTITY: Name variations, age, locations, education
2. CAREER: Current/past employers, titles, industry, credentials, ventures
3. DIGITAL: LinkedIn (PRIORITY), social media, websites, content creation
4. PUBLIC: Media mentions, speaking, publications, awards
5. INTERESTS: Hobbies, travel, causes, community involvement
6. NETWORK: Professional/social connections, collaborations

Search patterns: "${personName}" + [LinkedIn | company | location | credentials | awards | social media]

OUTPUT FORMAT:
## 1. IDENTITY CONFIRMATION
- Confidence: High/Medium/Low
- Key factors
- Ambiguities

## 2. BIOGRAPHICAL
- Background, timeline, geography

## 3. PROFESSIONAL
- Current status, trajectory, credentials, affiliations

## 4. DIGITAL FOOTPRINT
- LinkedIn: [INCLUDE URL]
- Social: [ALL URLs]
- Content creation

## 5. INTERESTS
- Hobbies, causes, community

## 6. NETWORK
- Connections, partnerships

## 7. PUBLIC VISIBILITY
- Media, speaking, publications, awards

REQUIREMENTS:
- Include ALL URLs (especially LinkedIn)
- Dense bullet points only
- Cross-reference sources
- Mark confidence levels`;
}

/**
 * Ultra-compact version for low token budget scenarios
 */
export function buildMinimalPersonResearchPrompt(personName: string): string {
  return `Research ${personName}: identity, career, LinkedIn/social profiles, public visibility, interests. Output: 7 sections with URLs, dense bullets, confidence levels.`;
}
