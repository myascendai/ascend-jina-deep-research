import axiosClient from "../utils/axios-client";
import { logInfo, logError, logDebug } from '../logging';

// Define return types matching the Python version
interface RapidAPISearchResult {
  url?: string;
  link?: string;
  title?: string;
  name?: string;
  snippet?: string;
  content?: string;
  description?: string;
  score?: number;
}

interface NormalizedSearchResult {
  url: string;
  title: string;
  snippet: string;
  score?: number;
}

interface RapidAPISearchResponse {
  organic?: RapidAPISearchResult[];
  results?: RapidAPISearchResult[];
  items?: RapidAPISearchResult[];
  organic_results?: RapidAPISearchResult[];
  data?: RapidAPISearchResult[];
}

/**
 * Execute a Google Search via RapidAPI provider.
 *
 * @param query - Search query string
 * @param maxResults - Maximum number of results to return (default: 6)
 * @param timeout - Request timeout in milliseconds (default: 15000)
 * @returns Normalized search results
 */
export async function rapidapiGoogleSearch(
  query: string,
  maxResults: number = 6,
  timeout: number = 15000
): Promise<{ response: { results: NormalizedSearchResult[] } }> {
  const apiKey = process.env.GOOGLE_RAPIDAPI_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_RAPIDAPI_KEY environment variable is not set');
  }

  logInfo('RapidAPI Google Search start:', {
    query: query.substring(0, 80),
    host: 'google-search116.p.rapidapi.com',
    maxResults,
    hasKey: !!apiKey,
    timeout
  });

  try {
    const response = await axiosClient.get<RapidAPISearchResponse | RapidAPISearchResult[]>(
      'https://google-search116.p.rapidapi.com/',
      {
        params: { query },
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'google-search116.p.rapidapi.com'
        },
        timeout
      }
    );

    if (response.status !== 200) {
      throw new Error(`RapidAPI search failed: ${response.status} ${response.statusText}`);
    }

    logDebug('RapidAPI response status:', { status: response.status });

    // Normalize various possible response shapes
    let rawResults: RapidAPISearchResult[] = [];
    const data = response.data;

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      // Try multiple possible field names
      for (const key of ['results', 'items', 'organic', 'organic_results', 'data'] as const) {
        const value = data[key];
        if (Array.isArray(value)) {
          rawResults = value;
          break;
        }
      }
    } else if (Array.isArray(data)) {
      rawResults = data;
    }

    // Normalize and limit results
    const normalized: NormalizedSearchResult[] = rawResults
      .slice(0, Math.max(1, Math.min(maxResults, 20)))
      .filter((item): item is RapidAPISearchResult =>
        typeof item === 'object' &&
        item !== null &&
        !!(item.url || item.link)
      )
      .map(item => ({
        url: item.url || item.link || '',
        title: item.title || item.name || '',
        snippet: item.snippet || item.content || item.description || '',
        score: item.score
      }));

    logInfo('RapidAPI Google Search results:', { count: normalized.length });

    // Return in the same format as other search providers
    return {
      response: {
        results: normalized
      }
    };

  } catch (error) {
    logError('RapidAPI Google Search error:', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
