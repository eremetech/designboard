import { z } from 'zod';
declare const PatternPromptsSchema: z.ZodObject<{
    textual: z.ZodString;
    html: z.ZodString;
    tsx: z.ZodString;
}, "strip", z.ZodTypeAny, {
    textual: string;
    html: string;
    tsx: string;
}, {
    textual: string;
    html: string;
    tsx: string;
}>;
declare const PatternSchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    aliases: z.ZodArray<z.ZodString, "many">;
    preview_html: z.ZodString;
    prompts: z.ZodObject<{
        textual: z.ZodString;
        html: z.ZodString;
        tsx: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        textual: string;
        html: string;
        tsx: string;
    }, {
        textual: string;
        html: string;
        tsx: string;
    }>;
}, "strip", z.ZodTypeAny, {
    slug: string;
    name: string;
    aliases: string[];
    preview_html: string;
    prompts: {
        textual: string;
        html: string;
        tsx: string;
    };
}, {
    slug: string;
    name: string;
    aliases: string[];
    preview_html: string;
    prompts: {
        textual: string;
        html: string;
        tsx: string;
    };
}>;
declare const CategorySchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    patterns: z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        aliases: z.ZodArray<z.ZodString, "many">;
        preview_html: z.ZodString;
        prompts: z.ZodObject<{
            textual: z.ZodString;
            html: z.ZodString;
            tsx: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            textual: string;
            html: string;
            tsx: string;
        }, {
            textual: string;
            html: string;
            tsx: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        slug: string;
        name: string;
        aliases: string[];
        preview_html: string;
        prompts: {
            textual: string;
            html: string;
            tsx: string;
        };
    }, {
        slug: string;
        name: string;
        aliases: string[];
        preview_html: string;
        prompts: {
            textual: string;
            html: string;
            tsx: string;
        };
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    slug: string;
    name: string;
    description: string;
    patterns: {
        slug: string;
        name: string;
        aliases: string[];
        preview_html: string;
        prompts: {
            textual: string;
            html: string;
            tsx: string;
        };
    }[];
}, {
    slug: string;
    name: string;
    description: string;
    patterns: {
        slug: string;
        name: string;
        aliases: string[];
        preview_html: string;
        prompts: {
            textual: string;
            html: string;
            tsx: string;
        };
    }[];
}>;
declare const PatternDataSchema: z.ZodObject<{
    version: z.ZodString;
    categories: z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        patterns: z.ZodArray<z.ZodObject<{
            slug: z.ZodString;
            name: z.ZodString;
            aliases: z.ZodArray<z.ZodString, "many">;
            preview_html: z.ZodString;
            prompts: z.ZodObject<{
                textual: z.ZodString;
                html: z.ZodString;
                tsx: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                textual: string;
                html: string;
                tsx: string;
            }, {
                textual: string;
                html: string;
                tsx: string;
            }>;
        }, "strip", z.ZodTypeAny, {
            slug: string;
            name: string;
            aliases: string[];
            preview_html: string;
            prompts: {
                textual: string;
                html: string;
                tsx: string;
            };
        }, {
            slug: string;
            name: string;
            aliases: string[];
            preview_html: string;
            prompts: {
                textual: string;
                html: string;
                tsx: string;
            };
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        slug: string;
        name: string;
        description: string;
        patterns: {
            slug: string;
            name: string;
            aliases: string[];
            preview_html: string;
            prompts: {
                textual: string;
                html: string;
                tsx: string;
            };
        }[];
    }, {
        slug: string;
        name: string;
        description: string;
        patterns: {
            slug: string;
            name: string;
            aliases: string[];
            preview_html: string;
            prompts: {
                textual: string;
                html: string;
                tsx: string;
            };
        }[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    version: string;
    categories: {
        slug: string;
        name: string;
        description: string;
        patterns: {
            slug: string;
            name: string;
            aliases: string[];
            preview_html: string;
            prompts: {
                textual: string;
                html: string;
                tsx: string;
            };
        }[];
    }[];
}, {
    version: string;
    categories: {
        slug: string;
        name: string;
        description: string;
        patterns: {
            slug: string;
            name: string;
            aliases: string[];
            preview_html: string;
            prompts: {
                textual: string;
                html: string;
                tsx: string;
            };
        }[];
    }[];
}>;
export type PatternPrompts = z.infer<typeof PatternPromptsSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type PatternData = z.infer<typeof PatternDataSchema>;
export declare function getCategories(): Category[];
export declare function findCategoryBySlug(slug: string): Category | undefined;
export declare function findPatternBySlug(slug: string): {
    pattern: Pattern;
    category: Category;
} | undefined;
export declare function findPatternByName(name: string): {
    pattern: Pattern;
    category: Category;
} | undefined;
/** Returns the closest category slugs to the given input. */
export declare function suggestCategorySlugs(input: string, limit?: number): string[];
/** Returns the closest pattern names/slugs to the given input. */
export declare function suggestPatternNames(input: string, limit?: number): {
    slug: string;
    name: string;
    category: string;
}[];
export interface SearchResult {
    pattern: Pattern;
    category: Category;
    score: number;
}
export declare function searchPatterns(query: string, categorySlug?: string, limit?: number): SearchResult[];
export {};
