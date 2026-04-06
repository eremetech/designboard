import { z } from 'zod';
import { findPatternByName, searchPatterns, getCategories } from './utils.js';
export function registerPrompts(server) {
    // --- implement_component ---
    server.prompt('implement_component', 'Generate a complete implementation prompt for a design pattern in a specific framework', {
        pattern: z.string().describe('Pattern name or slug (e.g. "card", "gradient-line", "blob")'),
        framework: z.enum(['react', 'vue', 'svelte', 'html']).optional()
            .describe('Target framework (defaults to react)')
    }, async ({ pattern, framework }) => {
        const fw = framework ?? 'react';
        const result = findPatternByName(pattern);
        if (!result) {
            return {
                messages: [{
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Pattern "${pattern}" not found. Available categories: ${getCategories().map(c => c.name).join(', ')}`
                        }
                    }]
            };
        }
        const { pattern: p, category } = result;
        const techSnippet = fw === 'react'
            ? p.prompts.tsx
            : p.prompts.html;
        return {
            messages: [{
                    role: 'user',
                    content: {
                        type: 'text',
                        text: [
                            `Implement a "${p.name}" component for a ${fw} application.`,
                            '',
                            `## Design Pattern Reference`,
                            `- **Name:** ${p.name}`,
                            `- **Also known as:** ${p.aliases.join(', ') || 'N/A'}`,
                            `- **Category:** ${category.name} — ${category.description}`,
                            '',
                            `## Design Intent`,
                            p.prompts.textual,
                            '',
                            `## Reference Implementation`,
                            '```',
                            techSnippet,
                            '```',
                            '',
                            `## Requirements`,
                            `- Framework: ${fw}`,
                            `- Follow the design intent described above`,
                            `- Make the component reusable with appropriate props`,
                            `- Use semantic HTML and accessible patterns`,
                            `- Include responsive considerations`,
                            `- Follow ${fw} best practices and conventions`
                        ].join('\n')
                    }
                }]
        };
    });
    // --- review_against_pattern ---
    server.prompt('review_against_pattern', 'Review code against a canonical design pattern and flag deviations or improvements', {
        pattern: z.string().describe('Pattern name or slug to review against'),
        code: z.string().describe('The code to review')
    }, async ({ pattern, code }) => {
        const result = findPatternByName(pattern);
        if (!result) {
            return {
                messages: [{
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Pattern "${pattern}" not found. Available categories: ${getCategories().map(c => c.name).join(', ')}`
                        }
                    }]
            };
        }
        const { pattern: p, category } = result;
        return {
            messages: [{
                    role: 'user',
                    content: {
                        type: 'text',
                        text: [
                            `Review the following code against the "${p.name}" design pattern and identify deviations, improvements, or missing elements.`,
                            '',
                            `## Canonical Pattern: ${p.name}`,
                            `**Category:** ${category.name}`,
                            `**Aliases:** ${p.aliases.join(', ') || 'N/A'}`,
                            '',
                            `### Design Intent`,
                            p.prompts.textual,
                            '',
                            `### Reference HTML`,
                            '```html',
                            p.prompts.html,
                            '```',
                            '',
                            `### Reference React/TSX`,
                            '```tsx',
                            p.prompts.tsx,
                            '```',
                            '',
                            `## Code to Review`,
                            '```',
                            code,
                            '```',
                            '',
                            `## Review Checklist`,
                            `1. Does the code match the design intent described above?`,
                            `2. Are the visual properties (colors, spacing, shapes, effects) consistent with the pattern?`,
                            `3. Is the implementation accessible?`,
                            `4. Are there any missing or extra elements compared to the canonical pattern?`,
                            `5. What specific improvements would bring this closer to the design intent?`
                        ].join('\n')
                    }
                }]
        };
    });
    // --- suggest_design_system ---
    server.prompt('suggest_design_system', 'Given a UI description, suggest relevant design patterns from the catalog to build it', {
        description: z.string().describe('Description of the UI you want to build (e.g. "e-commerce product page with hero, cards, and checkout")')
    }, async ({ description }) => {
        const keywords = description.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const accumulated = new Map();
        for (const keyword of keywords) {
            const results = searchPatterns(keyword, undefined, 10);
            for (const r of results) {
                const existing = accumulated.get(r.pattern.slug);
                if (existing) {
                    existing.score += r.score;
                    existing.keywordHits++;
                }
                else {
                    accumulated.set(r.pattern.slug, {
                        slug: r.pattern.slug,
                        name: r.pattern.name,
                        category: r.category.name,
                        prompt: r.pattern.prompts.textual,
                        score: r.score,
                        keywordHits: 1
                    });
                }
            }
        }
        const allResults = [...accumulated.values()];
        allResults.sort((a, b) => b.score - a.score);
        const top = allResults.slice(0, 15);
        const patternList = top.length > 0
            ? top.map((r, i) => `${i + 1}. **${r.name}** (${r.category})\n   ${r.prompt}`).join('\n\n')
            : 'No specific patterns matched. Consider browsing the full catalog with list_categories.';
        return {
            messages: [{
                    role: 'user',
                    content: {
                        type: 'text',
                        text: [
                            `I want to build: "${description}"`,
                            '',
                            `Based on the Design Vocabulary Board catalog, here are the most relevant design patterns to consider:`,
                            '',
                            patternList,
                            '',
                            `## Next Steps`,
                            `- Use \`get_implementation\` to get code for any pattern above`,
                            `- Use \`search_patterns\` to find additional patterns`,
                            `- Combine these patterns to create a cohesive design system for your UI`
                        ].join('\n')
                    }
                }]
        };
    });
}
//# sourceMappingURL=prompts.js.map