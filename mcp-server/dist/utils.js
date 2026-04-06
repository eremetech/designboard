import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { logger } from './logger.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
// ── Zod schemas (single source of truth for shape + runtime validation) ──
const PatternPromptsSchema = z.object({
    textual: z.string().min(1),
    html: z.string().min(1),
    tsx: z.string().min(1),
});
const PatternSchema = z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    aliases: z.array(z.string()),
    preview_html: z.string(),
    prompts: PatternPromptsSchema,
});
const CategorySchema = z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    patterns: z.array(PatternSchema).min(1),
});
const PatternDataSchema = z.object({
    version: z.string(),
    categories: z.array(CategorySchema).min(1),
});
// ── Load & validate ──────────────────────────────────────────────────────
const raw = require(join(__dirname, 'data', 'patterns.json'));
const parsed = PatternDataSchema.safeParse(raw);
if (!parsed.success) {
    const issues = parsed.error.issues
        .map(i => `  ${i.path.join('.')} — ${i.message}`)
        .join('\n');
    const msg = `patterns.json failed validation:\n${issues}`;
    logger.error(msg);
    throw new Error(msg);
}
const data = parsed.data;
export function getCategories() {
    return data.categories;
}
export function findCategoryBySlug(slug) {
    return data.categories.find(c => c.slug === slug);
}
export function findPatternBySlug(slug) {
    for (const category of data.categories) {
        const pattern = category.patterns.find(p => p.slug === slug);
        if (pattern)
            return { pattern, category };
    }
    return undefined;
}
export function findPatternByName(name) {
    const lower = name.toLowerCase();
    for (const category of data.categories) {
        const pattern = category.patterns.find(p => p.slug === lower
            || p.name.toLowerCase() === lower
            || p.aliases.some(a => a.toLowerCase() === lower));
        if (pattern)
            return { pattern, category };
    }
    return undefined;
}
const FIELDS = ['name', 'aliases', 'category', 'textual'];
const FIELD_BOOST = { name: 3, aliases: 2, category: 1.5, textual: 1 };
const BM25_K1 = 1.2;
const BM25_B = 0.75;
function tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(t => t.length > 1);
}
const docs = [];
const invertedIndex = new Map();
const avgFieldLen = { name: 0, aliases: 0, category: 0, textual: 0 };
const docsByCategory = new Map();
// Exact-match lookup tables
const exactName = new Map();
const exactSlug = new Map();
function addToIndex(docIdx, field, tokens) {
    for (const token of tokens) {
        let posting = invertedIndex.get(token);
        if (!posting) {
            posting = new Map();
            invertedIndex.set(token, posting);
        }
        let tfs = posting.get(docIdx);
        if (!tfs) {
            tfs = { name: 0, aliases: 0, category: 0, textual: 0 };
            posting.set(docIdx, tfs);
        }
        tfs[field]++;
    }
}
// Build index at module load
(function buildIndex() {
    for (const category of data.categories) {
        const catDocs = [];
        for (const pattern of category.patterns) {
            const docIdx = docs.length;
            const nameTokens = tokenize(pattern.name);
            const aliasTokens = tokenize(pattern.aliases.join(' '));
            const catTokens = tokenize(category.name);
            const textTokens = tokenize(pattern.prompts.textual);
            const entry = {
                pattern,
                category,
                fieldLengths: {
                    name: nameTokens.length,
                    aliases: aliasTokens.length,
                    category: catTokens.length,
                    textual: textTokens.length,
                },
            };
            docs.push(entry);
            catDocs.push(docIdx);
            addToIndex(docIdx, 'name', nameTokens);
            addToIndex(docIdx, 'aliases', aliasTokens);
            addToIndex(docIdx, 'category', catTokens);
            addToIndex(docIdx, 'textual', textTokens);
            exactName.set(pattern.name.toLowerCase(), docIdx);
            exactSlug.set(pattern.slug, docIdx);
        }
        docsByCategory.set(category.slug, catDocs);
    }
    const N = docs.length;
    for (const f of FIELDS) {
        avgFieldLen[f] = docs.reduce((sum, d) => sum + d.fieldLengths[f], 0) / N;
    }
})();
function idf(docFreq) {
    const N = docs.length;
    return Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
}
/**
 * BM25F score for a single query term against a document.
 * Computes a weighted pseudo-tf across fields, then applies BM25.
 */
function bm25fTermScore(docIdx, tfs, termIdf) {
    const doc = docs[docIdx];
    let weightedTf = 0;
    for (const f of FIELDS) {
        const tf = tfs[f];
        if (tf === 0)
            continue;
        const dl = doc.fieldLengths[f];
        const avgDl = avgFieldLen[f] || 1;
        const norm = 1 - BM25_B + BM25_B * (dl / avgDl);
        weightedTf += FIELD_BOOST[f] * (tf / norm);
    }
    return termIdf * (weightedTf / (BM25_K1 + weightedTf));
}
/**
 * Simple edit-distance for short strings (Levenshtein).
 * Used to suggest "did you mean?" corrections.
 */
function editDistance(a, b) {
    const la = a.length, lb = b.length;
    const dp = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
    for (let i = 0; i <= la; i++)
        dp[i][0] = i;
    for (let j = 0; j <= lb; j++)
        dp[0][j] = j;
    for (let i = 1; i <= la; i++) {
        for (let j = 1; j <= lb; j++) {
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return dp[la][lb];
}
/** Returns the closest category slugs to the given input. */
export function suggestCategorySlugs(input, limit = 3) {
    const lower = input.toLowerCase();
    return data.categories
        .map(c => ({ slug: c.slug, name: c.name, dist: Math.min(editDistance(lower, c.slug), editDistance(lower, c.name.toLowerCase())) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, limit)
        .filter(c => c.dist <= Math.max(input.length * 0.6, 4))
        .map(c => c.slug);
}
/** Returns the closest pattern names/slugs to the given input. */
export function suggestPatternNames(input, limit = 3) {
    const lower = input.toLowerCase();
    const candidates = [];
    for (const category of data.categories) {
        for (const p of category.patterns) {
            const dists = [
                editDistance(lower, p.slug),
                editDistance(lower, p.name.toLowerCase()),
                ...p.aliases.map(a => editDistance(lower, a.toLowerCase()))
            ];
            candidates.push({ slug: p.slug, name: p.name, category: category.name, dist: Math.min(...dists) });
        }
    }
    return candidates
        .sort((a, b) => a.dist - b.dist)
        .slice(0, limit)
        .filter(c => c.dist <= Math.max(input.length * 0.6, 4))
        .map(({ slug, name, category }) => ({ slug, name, category }));
}
export function searchPatterns(query, categorySlug, limit = 10) {
    const q = query.toLowerCase().trim();
    // Exact-match shortcut: name or slug
    const exactIdx = exactName.get(q) ?? exactSlug.get(q);
    if (exactIdx !== undefined) {
        const doc = docs[exactIdx];
        if (!categorySlug || doc.category.slug === categorySlug) {
            return [{ pattern: doc.pattern, category: doc.category, score: 100 }];
        }
    }
    const terms = tokenize(q);
    if (terms.length === 0)
        return [];
    const allowedDocs = categorySlug ? new Set(docsByCategory.get(categorySlug)) : null;
    // Accumulate BM25F scores per document
    const scores = new Map();
    for (const term of terms) {
        const posting = invertedIndex.get(term);
        if (!posting)
            continue;
        const termIdf = idf(posting.size);
        for (const [docIdx, tfs] of posting) {
            if (allowedDocs && !allowedDocs.has(docIdx))
                continue;
            const s = bm25fTermScore(docIdx, tfs, termIdf);
            scores.set(docIdx, (scores.get(docIdx) ?? 0) + s);
        }
    }
    const results = [];
    for (const [docIdx, score] of scores) {
        const doc = docs[docIdx];
        results.push({ pattern: doc.pattern, category: doc.category, score: Math.round(score * 100) / 100 });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
}
//# sourceMappingURL=utils.js.map