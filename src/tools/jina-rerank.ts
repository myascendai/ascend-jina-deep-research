import { TokenTracker } from "../utils/token-tracker";
import { JINA_API_KEY } from "../config";
import axiosClient from '../utils/axios-client';
import { logInfo, logError, logDebug, logWarning } from '../logging';

// Reranker provider configuration
const RERANK_PROVIDER = process.env.RERANK_PROVIDER || 'jina';
const RERANK_MODEL = process.env.RERANK_MODEL;
const DEEP_INFRA_API_KEY = process.env.DEEP_INFRA_API_KEY;
const JINA_API_URL = 'https://api.jina.ai/v1/rerank';
const DEEP_INFRA_RERANK_URL = 'https://api.deepinfra.com/v1/inference/rerank';

// Types for Jina Rerank API
interface JinaRerankRequest {
  model: string;
  query: string;
  top_n: number;
  documents: string[];
}

interface JinaRerankResponse {
  model: string;
  results: Array<{
    index: number;
    document: {
      text: string;
    };
    relevance_score: number;
  }>;
  usage: {
    total_tokens: number;
  };
}

export async function rerankDocuments(
  query: string,
  documents: string[],
  tracker?: TokenTracker,
  batchSize = 2000
): Promise<{ results: Array<{ index: number, relevance_score: number, document: { text: string } }> }> {
  try {
    // Validate API keys based on provider
    if (RERANK_PROVIDER === 'jina' && !JINA_API_KEY) {
      throw new Error('JINA_API_KEY is not set');
    }
    if (RERANK_PROVIDER === 'deepinfra' && !DEEP_INFRA_API_KEY) {
      throw new Error('DEEP_INFRA_API_KEY is not set');
    }

    // No need to slice - we'll process all documents in batches
    const batches: string[][] = [];
    for (let i = 0; i < documents.length; i += batchSize) {
      batches.push(documents.slice(i, i + batchSize));
    }

    logDebug(`Reranking ${documents.length} documents in ${batches.length} batches`);

    // Process all batches in parallel
    const batchResults = await Promise.all(
      batches.map(async (batchDocuments, batchIndex) => {
        const startIdx = batchIndex * batchSize;

        let apiUrl: string;
        let apiKey: string;
        let request: any;

        if (RERANK_PROVIDER === 'deepinfra') {
          // Deep Infra configuration
          apiUrl = DEEP_INFRA_RERANK_URL;
          apiKey = DEEP_INFRA_API_KEY!;

          request = {
            model: RERANK_MODEL || 'Qwen/Qwen3-Reranker-0.6B',
            query,
            documents: batchDocuments,
            top_n: batchDocuments.length,
            return_documents: true
          };
        } else {
          // Jina configuration (default)
          apiUrl = JINA_API_URL;
          apiKey = JINA_API_KEY!;

          request = {
            model: 'jina-reranker-v2-base-multilingual',
            query,
            top_n: batchDocuments.length,
            documents: batchDocuments
          };
        }

        const response = await axiosClient.post<JinaRerankResponse>(
          apiUrl,
          request,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            }
          }
        );

        // Track token usage from this batch
        (tracker || new TokenTracker()).trackUsage('rerank', {
          promptTokens: response.data.usage.total_tokens,
          completionTokens: 0,
          totalTokens: response.data.usage.total_tokens
        });

        // Add the original document index to each result
        return response.data.results.map(result => ({
          ...result,
          originalIndex: startIdx + result.index // Map back to the original index
        }));
      })
    );

    // Flatten and sort all results by relevance score
    const allResults = batchResults.flat().sort((a, b) => b.relevance_score - a.relevance_score);

    // Keep the original document indices in the results
    const finalResults = allResults.map(result => ({
      index: result.originalIndex,       // Original document index
      relevance_score: result.relevance_score,
      document: result.document
    }));

    return { results: finalResults };
  } catch (error) {
    logError('Reranking error:', { error });

    // Return empty results if there is an error
    return {
      results: []
    };
  }
}