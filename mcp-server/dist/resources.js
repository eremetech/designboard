import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCategories, findCategoryBySlug, findPatternBySlug } from './utils.js';
export function registerResources(server) {
    // --- designboard://catalog ---
    // Lightweight index of all categories with pattern counts
    server.resource('catalog', 'designboard://catalog', { description: 'Full catalog of design pattern categories with names, descriptions, and pattern counts' }, async () => ({
        contents: [{
                uri: 'designboard://catalog',
                mimeType: 'application/json',
                text: JSON.stringify({
                    categories: getCategories().map(c => ({
                        slug: c.slug,
                        name: c.name,
                        description: c.description,
                        patternCount: c.patterns.length
                    }))
                }, null, 2)
            }]
    }));
    // --- designboard://categories/{slug} ---
    // All patterns within a category
    server.resource('category', new ResourceTemplate('designboard://categories/{slug}', {
        list: async () => ({
            resources: getCategories().map(c => ({
                uri: `designboard://categories/${c.slug}`,
                name: c.name,
                description: c.description,
                mimeType: 'application/json'
            }))
        }),
        complete: {
            slug: (value) => getCategories()
                .map(c => c.slug)
                .filter(s => s.startsWith(value))
        }
    }), { description: 'All patterns in a design category, including names, aliases, and prompts' }, async (_uri, { slug }) => {
        const category = findCategoryBySlug(slug);
        if (!category) {
            return {
                contents: [{
                        uri: `designboard://categories/${slug}`,
                        mimeType: 'text/plain',
                        text: `Category "${slug}" not found.`
                    }]
            };
        }
        return {
            contents: [{
                    uri: `designboard://categories/${slug}`,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                        slug: category.slug,
                        name: category.name,
                        description: category.description,
                        patterns: category.patterns.map(p => ({
                            slug: p.slug,
                            name: p.name,
                            aliases: p.aliases,
                            textualPrompt: p.prompts.textual
                        }))
                    }, null, 2)
                }]
        };
    });
    // --- designboard://patterns/{slug} ---
    // Single pattern with all prompt formats
    server.resource('pattern', new ResourceTemplate('designboard://patterns/{slug}', {
        list: undefined,
        complete: {
            slug: (value) => {
                const results = [];
                for (const cat of getCategories()) {
                    for (const p of cat.patterns) {
                        if (p.slug.startsWith(value))
                            results.push(p.slug);
                    }
                }
                return results.slice(0, 50);
            }
        }
    }), { description: 'Single design pattern with full textual, HTML, and TSX prompts' }, async (_uri, { slug }) => {
        const result = findPatternBySlug(slug);
        if (!result) {
            return {
                contents: [{
                        uri: `designboard://patterns/${slug}`,
                        mimeType: 'text/plain',
                        text: `Pattern "${slug}" not found.`
                    }]
            };
        }
        const { pattern, category } = result;
        return {
            contents: [{
                    uri: `designboard://patterns/${slug}`,
                    mimeType: 'application/json',
                    text: JSON.stringify({
                        slug: pattern.slug,
                        name: pattern.name,
                        aliases: pattern.aliases,
                        category: { slug: category.slug, name: category.name },
                        prompts: pattern.prompts
                    }, null, 2)
                }]
        };
    });
}
//# sourceMappingURL=resources.js.map