import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getCategories,
  findCategoryBySlug,
  findPatternByName,
  searchPatterns,
  suggestCategorySlugs,
  suggestPatternNames,
} from './utils.js';
import { createRequestLogger } from './logger.js';
import { auditImplementation } from './audit.js';

function patternNotFoundMessage(input: string): string {
  const suggestions = suggestPatternNames(input);
  const lines = [`Pattern "${input}" not found.`];
  if (suggestions.length > 0) {
    lines.push(`Did you mean: ${suggestions.map(s => `"${s.name}" (${s.slug})`).join(', ')}?`);
  }
  lines.push('Use search_patterns to search by keyword, or list_patterns to browse a category.');
  return lines.join(' ');
}

function categoryNotFoundMessage(input: string): string {
  const suggestions = suggestCategorySlugs(input);
  const lines = [`Category "${input}" not found.`];
  if (suggestions.length > 0) {
    lines.push(`Did you mean: ${suggestions.join(', ')}?`);
  }
  lines.push('Use list_categories to see all available category slugs.');
  return lines.join(' ');
}

export function registerTools(server: McpServer): void {
  // --- list_categories ---
  server.tool(
    'list_categories',
    'List all design pattern categories with descriptions and pattern counts',
    {},
    async () => {
      const log = createRequestLogger('list_categories');
      log.info('called');

      const categories = getCategories().map(c => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        patternCount: c.patterns.length
      }));

      log.info('completed', { resultCount: categories.length, durationMs: log.elapsed() });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(categories, null, 2)
        }]
      };
    }
  );

  // --- list_patterns ---
  server.tool(
    'list_patterns',
    'List all patterns in a category. Use list_categories first to get available category slugs.',
    {
      category: z.string().describe('Category slug (e.g. "shadows-and-depth", "ui-components")'),
    },
    async ({ category: slug }) => {
      const log = createRequestLogger('list_patterns');
      log.info('called', { category: slug });

      const category = findCategoryBySlug(slug);
      if (!category) {
        log.warn('category not found', { input: slug, durationMs: log.elapsed() });
        return {
          content: [{
            type: 'text' as const,
            text: categoryNotFoundMessage(slug)
          }],
          isError: true
        };
      }

      const patterns = category.patterns.map(p => ({
        slug: p.slug,
        name: p.name,
        aliases: p.aliases,
        textualPrompt: p.prompts.textual
      }));

      log.info('completed', { category: slug, resultCount: patterns.length, durationMs: log.elapsed() });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            category: category.name,
            description: category.description,
            patternCount: patterns.length,
            patterns
          }, null, 2)
        }]
      };
    }
  );

  // --- search_patterns ---
  server.tool(
    'search_patterns',
    'Search design patterns by name, alias, or description. Returns matching patterns ranked by relevance.',
    {
      query: z.string().describe('Free-text search query (e.g. "gradient button", "card layout", "shadow")'),
      category: z.string().optional().describe('Optional category slug to filter results (e.g. "shadows-and-depth")'),
      limit: z.number().min(1).max(50).default(10).describe('Maximum number of results to return')
    },
    async ({ query, category, limit }) => {
      const log = createRequestLogger('search_patterns');
      log.info('called', { query, category: category ?? null, limit });

      if (category && !findCategoryBySlug(category)) {
        log.warn('category not found', { input: category, durationMs: log.elapsed() });
        return {
          content: [{
            type: 'text' as const,
            text: categoryNotFoundMessage(category)
          }],
          isError: true
        };
      }

      const results = searchPatterns(query, category, limit);

      if (results.length === 0) {
        log.info('no results', { query, category: category ?? null, durationMs: log.elapsed() });
        const terms = query.split(/\s+/).filter(t => t.length > 1);
        const lines = [`No patterns found matching "${query}"${category ? ` in category "${category}"` : ''}.`];
        if (terms.length > 1) {
          lines.push(`Try searching for individual terms: ${terms.map(t => `"${t}"`).join(', ')}.`);
        }
        const suggestions = suggestPatternNames(query);
        if (suggestions.length > 0) {
          lines.push(`Closest matches: ${suggestions.map(s => `"${s.name}" (${s.slug})`).join(', ')}.`);
        }
        if (category) {
          lines.push('Try removing the category filter to search across all categories.');
        }
        return { content: [{ type: 'text' as const, text: lines.join(' ') }] };
      }

      const formatted = results.map(r => ({
        slug: r.pattern.slug,
        name: r.pattern.name,
        aliases: r.pattern.aliases,
        category: r.category.name,
        categorySlug: r.category.slug,
        relevance: r.score
      }));

      log.info('completed', { query, resultCount: formatted.length, topScore: formatted[0]?.relevance, durationMs: log.elapsed() });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(formatted, null, 2)
        }]
      };
    }
  );

  // --- get_pattern_prompt ---
  server.tool(
    'get_pattern_prompt',
    'Get the prompt for a specific design pattern in a chosen format (textual description, HTML code, or TSX/React code)',
    {
      pattern: z.string().describe('Pattern name or slug (e.g. "circle", "rounded-rectangle", "Card")'),
      format: z.enum(['textual', 'html', 'tsx']).describe(
        'Prompt format: "textual" for natural-language description, "html" for HTML/CSS snippet, "tsx" for React component'
      )
    },
    async ({ pattern, format }) => {
      const log = createRequestLogger('get_pattern_prompt');
      log.info('called', { pattern, format });

      const result = findPatternByName(pattern);
      if (!result) {
        log.warn('pattern not found', { input: pattern, durationMs: log.elapsed() });
        return {
          content: [{ type: 'text' as const, text: patternNotFoundMessage(pattern) }],
          isError: true
        };
      }

      const { pattern: p, category } = result;
      log.info('completed', { resolved: p.slug, category: category.slug, format, durationMs: log.elapsed() });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            name: p.name,
            slug: p.slug,
            category: category.name,
            format,
            prompt: p.prompts[format]
          }, null, 2)
        }]
      };
    }
  );

  // --- get_implementation ---
  server.tool(
    'get_implementation',
    'Get the implementation code for a design pattern along with its textual prompt as guidance. Useful for generating or scaffolding UI components.',
    {
      pattern: z.string().describe('Pattern name or slug (e.g. "blob", "gradient-line")'),
      framework: z.enum(['html', 'tsx']).describe('Target framework: "html" for vanilla HTML/CSS, "tsx" for React component')
    },
    async ({ pattern, framework }) => {
      const log = createRequestLogger('get_implementation');
      log.info('called', { pattern, framework });

      const result = findPatternByName(pattern);
      if (!result) {
        log.warn('pattern not found', { input: pattern, durationMs: log.elapsed() });
        return {
          content: [{ type: 'text' as const, text: patternNotFoundMessage(pattern) }],
          isError: true
        };
      }

      const { pattern: p, category } = result;
      log.info('completed', { resolved: p.slug, category: category.slug, framework, durationMs: log.elapsed() });
      return {
        content: [
          {
            type: 'text' as const,
            text: `## ${p.name}\n**Category:** ${category.name}\n**Aliases:** ${p.aliases.join(', ') || 'none'}\n\n### Design Intent\n${p.prompts.textual}\n\n### Implementation (${framework.toUpperCase()})\n\`\`\`${framework === 'tsx' ? 'tsx' : 'html'}\n${p.prompts[framework]}\n\`\`\``
          }
        ]
      };
    }
  );

  // --- audit_implementation ---
  server.tool(
    'audit_implementation',
    [
      'Audit HTML or TSX code against design patterns from this board.',
      'Compares visual CSS traits (blur, gradients, shadows, borders, etc.) in the submitted code',
      'against the reference implementation for each pattern.',
      'Returns per-pattern verdict (pass / partial / fail) with a score,',
      'and for every missing or partial trait, the exact CSS fix to apply.',
      'Use search_patterns first to find the right pattern slugs.',
    ].join(' '),
    {
      code: z.string().describe('HTML or TSX source code to audit'),
      patterns: z.array(z.string()).min(1).describe(
        'Pattern names or slugs to check against (e.g. ["liquid-glass-card", "radial-gradient"])'
      ),
    },
    async ({ code, patterns }) => {
      const log = createRequestLogger('audit_implementation');
      log.info('called', { patternCount: patterns.length, codeLength: code.length });

      const result = auditImplementation(code, patterns);

      log.info('completed', {
        checked: result.summary.patternsChecked,
        pass: result.summary.pass,
        partial: result.summary.partial,
        fail: result.summary.fail,
        notFound: result.notFound.length,
        durationMs: log.elapsed(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );
}
