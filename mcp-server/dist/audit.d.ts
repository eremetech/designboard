export interface TraitCheck {
    trait: string;
    status: 'pass' | 'partial' | 'missing';
    expected: string;
    found: string | null;
    fix: string | null;
}
export interface PatternAudit {
    pattern: string;
    slug: string;
    category: string;
    designIntent: string;
    verdict: 'pass' | 'partial' | 'fail';
    score: number;
    traits: TraitCheck[];
}
export interface AuditResult {
    summary: {
        patternsChecked: number;
        pass: number;
        partial: number;
        fail: number;
    };
    patterns: PatternAudit[];
    notFound: {
        input: string;
        suggestions: string[];
    }[];
}
export declare function auditImplementation(code: string, patternNames: string[]): AuditResult;
