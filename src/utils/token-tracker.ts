import { EventEmitter } from 'events';

import { TokenUsage } from '../types';
import { LanguageModelUsage } from "ai";
import { logInfo, logError, logDebug, logWarning } from '../logging';

export class TokenTracker extends EventEmitter {
  private usages: TokenUsage[] = [];
  private budget?: number;

  constructor(budget?: number) {
    super();
    this.budget = budget;

    if ('asyncLocalContext' in process) {
      const asyncLocalContext = process.asyncLocalContext as any;
      this.on('usage', () => {
        if (asyncLocalContext.available()) {
          asyncLocalContext.ctx.chargeAmount = this.getTotalUsage().totalTokens;
        }
      });

    }
  }

  trackUsage(tool: string, usage: LanguageModelUsage) {
    const u = { tool, usage };
    this.usages.push(u);
    this.emit('usage', usage);
  }

  getTotalUsage(): LanguageModelUsage {
    return this.usages.reduce((acc, { usage }) => {
      // CompletionTokens > 0 means LLM usage, apply 3x multiplier
      // const scaler = usage.completionTokens > 0 ? 3 : 1;
      const scaler = 1;
      acc.promptTokens += usage.promptTokens * scaler;
      acc.completionTokens += usage.completionTokens * scaler;
      acc.totalTokens += usage.totalTokens * scaler;
      return acc;
    }, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  }

  getTotalUsageSnakeCase(): {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    breakdown: Record<string, { input_tokens?: number; output_tokens?: number; total_tokens: number }>;
  } {
    const breakdown: Record<string, { input_tokens: number; output_tokens: number; total_tokens: number }> = {};

    // Categorize tools into service groups
    const serviceMap: Record<string, string> = {
      'agent': 'llm',
      'agentBeastMode': 'llm',
      'coder': 'llm',
      'evaluator': 'llm',
      'errorAnalyzer': 'llm',
      'queryRewriter': 'llm',
      'researchPlanner': 'llm',
      'serpCluster': 'llm',
      'finalizer': 'llm',
      'reducer': 'llm',
      'fallback': 'llm',
      'read': 'jina_reader',
      'embeddings': 'jina_embeddings',
      'rerank': 'jina_rerank',
      'search': 'jina_search',
    };

    // Calculate breakdown by service
    this.usages.forEach(({ tool, usage }) => {
      const service = serviceMap[tool] || tool;
      if (!breakdown[service]) {
        breakdown[service] = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
      }
      breakdown[service].input_tokens += usage.promptTokens;
      breakdown[service].output_tokens += usage.completionTokens;
      breakdown[service].total_tokens += usage.totalTokens;
    });

    const totals = this.usages.reduce((acc, { usage }) => {
      acc.input_tokens += usage.promptTokens;
      acc.output_tokens += usage.completionTokens;
      acc.total_tokens += usage.totalTokens;
      return acc;
    }, { input_tokens: 0, output_tokens: 0, total_tokens: 0 });

    return {
      input_tokens: totals.input_tokens,
      output_tokens: totals.output_tokens,
      total_tokens: totals.total_tokens,
      // Legacy fields for backward compatibility
      prompt_tokens: totals.input_tokens,
      completion_tokens: totals.output_tokens,
      breakdown,
    };
  }

  getUsageBreakdown(): Record<string, number> {
    return this.usages.reduce((acc, { tool, usage }) => {
      acc[tool] = (acc[tool] || 0) + usage.totalTokens;
      return acc;
    }, {} as Record<string, number>);
  }


  printSummary() {
    const breakdown = this.getUsageBreakdown();
    logInfo('Token Usage Summary:', {
      budget: this.budget,
      total: this.getTotalUsage(),
      breakdown
    });
  }

  reset() {
    this.usages = [];
  }
}
