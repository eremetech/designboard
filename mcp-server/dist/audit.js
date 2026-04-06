import { findPatternByName, suggestPatternNames } from './utils.js';
// ── CSS extraction ───────────────────────────────────────────────────
function extractCssText(code) {
    const parts = [];
    // Inline styles: style="..." and style='...'
    for (const m of code.matchAll(/style\s*=\s*"([^"]*)"/gi))
        parts.push(m[1]);
    for (const m of code.matchAll(/style\s*=\s*'([^']*)'/gi))
        parts.push(m[1]);
    // <style> blocks
    for (const m of code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
        parts.push(m[1]);
    // JSX style objects: style={{ ... }}
    for (const m of code.matchAll(/style\s*=\s*\{\{([\s\S]*?)\}\}/gi)) {
        parts.push(m[1]
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .toLowerCase()
            .replace(/['"`]/g, '')
            .replace(/,\s*$/gm, ';'));
    }
    // SVG presentation attributes (fill, stroke, opacity, filter, etc.)
    for (const m of code.matchAll(/\b(fill|stroke|opacity|filter)\s*=\s*"([^"]*)"/gi)) {
        parts.push(`${m[1]}:${m[2]}`);
    }
    return parts.join(' ; ');
}
/**
 * Extract a gradient value with balanced parentheses from CSS text.
 * Handles nested rgba()/hsla() inside gradient functions.
 */
function findGradient(css, type) {
    const lower = css.toLowerCase();
    const needle = `${type}-gradient(`;
    const start = lower.indexOf(needle);
    if (start === -1)
        return null;
    let depth = 0;
    for (let i = start + needle.length - 1; i < css.length; i++) {
        if (css[i] === '(')
            depth++;
        if (css[i] === ')') {
            depth--;
            if (depth === 0)
                return css.substring(start, i + 1);
        }
    }
    return null;
}
function numFrom(s) {
    return parseFloat(s.match(/[\d.]+/)?.[0] ?? '0');
}
const DETECTORS = [
    {
        id: 'backdrop-blur',
        label: 'Backdrop blur',
        tier: 1,
        extract: css => {
            const m = css.match(/backdrop-filter[^;]*blur\s*\(([^)]+)\)/i);
            return m ? `blur(${m[1].trim()})` : null;
        },
        compare: (ref, found) => numFrom(found) >= numFrom(ref) * 0.4 ? 'pass' : 'partial',
        describeFix: ref => `Add \`backdrop-filter: ${ref}; -webkit-backdrop-filter: ${ref};\` to create the frosted glass effect`,
    },
    {
        id: 'backdrop-saturate',
        label: 'Backdrop saturation boost',
        tier: 1,
        extract: css => {
            const m = css.match(/backdrop-filter[^;]*saturate\s*\(([^)]+)\)/i);
            return m ? `saturate(${m[1].trim()})` : null;
        },
        compare: (ref, found) => Math.abs(numFrom(ref) - numFrom(found)) <= 0.5 ? 'pass' : 'partial',
        describeFix: ref => `Append \`${ref}\` to your backdrop-filter, e.g. \`backdrop-filter: blur(…) ${ref};\``,
    },
    {
        id: 'transparent-bg',
        label: 'Semi-transparent background',
        tier: 1,
        extract: css => {
            for (const m of css.matchAll(/background(?:-color)?\s*:[^;]*rgba\s*\(([^)]+)\)/gi)) {
                const parts = m[1].split(',').map(s => s.trim());
                const alpha = parseFloat(parts[parts.length - 1]);
                if (alpha < 0.95)
                    return `rgba(${parts.join(', ')})`;
            }
            return null;
        },
        compare: (ref, found) => {
            const refA = parseFloat(ref.match(/([\d.]+)\s*\)$/)?.[1] ?? '0.5');
            const foundA = parseFloat(found.match(/([\d.]+)\s*\)$/)?.[1] ?? '0.5');
            return Math.abs(refA - foundA) <= 0.35 ? 'pass' : 'partial';
        },
        describeFix: ref => {
            const alpha = ref.match(/([\d.]+)\s*\)$/)?.[1] ?? '0.2';
            return `Use a semi-transparent background with alpha ~${alpha}, e.g. \`background: rgba(255, 255, 255, ${alpha});\``;
        },
    },
    {
        id: 'linear-gradient',
        label: 'Linear gradient',
        tier: 1,
        extract: css => findGradient(css, 'linear'),
        compare: () => 'pass',
        describeFix: ref => `Add a linear gradient: \`background: ${ref};\``,
    },
    {
        id: 'radial-gradient',
        label: 'Radial gradient',
        tier: 1,
        extract: css => findGradient(css, 'radial'),
        compare: () => 'pass',
        describeFix: ref => `Add a radial gradient: \`background: ${ref};\``,
    },
    {
        id: 'conic-gradient',
        label: 'Conic gradient',
        tier: 1,
        extract: css => findGradient(css, 'conic'),
        compare: () => 'pass',
        describeFix: ref => `Add a conic gradient: \`background: ${ref};\``,
    },
    {
        id: 'box-shadow',
        label: 'Box shadow',
        tier: 1,
        extract: css => {
            const m = css.match(/box-shadow\s*:\s*([^;]+)/i);
            return m ? m[1].trim() : null;
        },
        compare: (ref, found) => {
            const refLayers = ref.split(/,(?![^(]*\))/).length;
            const foundLayers = found.split(/,(?![^(]*\))/).length;
            return foundLayers >= refLayers ? 'pass' : 'partial';
        },
        describeFix: ref => `Add \`box-shadow: ${ref};\``,
    },
    {
        id: 'text-shadow',
        label: 'Text shadow',
        tier: 1,
        extract: css => {
            const m = css.match(/text-shadow\s*:\s*([^;]+)/i);
            return m ? m[1].trim() : null;
        },
        compare: () => 'pass',
        describeFix: ref => `Add \`text-shadow: ${ref};\``,
    },
    {
        id: 'border-radius',
        label: 'Rounded corners',
        tier: 2,
        extract: css => {
            const m = css.match(/border-radius\s*:\s*([^;]+)/i);
            return m ? m[1].trim() : null;
        },
        compare: () => 'pass',
        describeFix: ref => `Add \`border-radius: ${ref};\``,
    },
    {
        id: 'translucent-border',
        label: 'Translucent / luminous border',
        tier: 2,
        extract: css => {
            const m = css.match(/border\s*:[^;]*rgba\s*\([^)]+\)[^;]*/i);
            return m ? m[0].replace(/border\s*:\s*/i, '').trim() : null;
        },
        compare: () => 'pass',
        describeFix: ref => `Add \`border: ${ref};\` for a luminous glass-like edge`,
    },
    {
        id: 'css-transform',
        label: 'CSS transform',
        tier: 2,
        extract: css => {
            const m = css.match(/(?<![a-z-])transform\s*:\s*([^;]+)/i);
            return m ? m[1].trim() : null;
        },
        compare: () => 'pass',
        describeFix: ref => `Add \`transform: ${ref};\``,
    },
    {
        id: 'transition',
        label: 'Smooth transition',
        tier: 2,
        extract: css => {
            const m = css.match(/transition\s*:\s*([^;]+)/i);
            return m ? m[1].trim() : null;
        },
        compare: () => 'pass',
        describeFix: ref => `Add \`transition: ${ref};\` for smooth state changes`,
    },
    {
        id: 'animation',
        label: 'CSS animation',
        tier: 1,
        extract: css => {
            const m = css.match(/animation\s*:\s*([^;]+)/i);
            return m ? m[1].trim() : null;
        },
        compare: () => 'pass',
        describeFix: ref => `Add \`animation: ${ref};\` with corresponding @keyframes`,
    },
    {
        id: 'filter',
        label: 'CSS filter effect',
        tier: 1,
        extract: css => {
            const m = css.match(/(?<!backdrop-)filter\s*:\s*([^;]+)/i);
            return m ? m[1].trim() : null;
        },
        compare: () => 'pass',
        describeFix: ref => `Add \`filter: ${ref};\``,
    },
    {
        id: 'clip-path',
        label: 'Clip path',
        tier: 1,
        extract: css => {
            const m = css.match(/clip-path\s*:\s*([^;]+)/i);
            return m ? m[1].trim() : null;
        },
        compare: () => 'pass',
        describeFix: ref => `Add \`clip-path: ${ref};\``,
    },
    {
        id: 'blend-mode',
        label: 'Blend mode',
        tier: 1,
        extract: css => {
            const m = css.match(/mix-blend-mode\s*:\s*([^;]+)/i);
            return m ? m[1].trim() : null;
        },
        compare: () => 'pass',
        describeFix: ref => `Add \`mix-blend-mode: ${ref};\``,
    },
    {
        id: 'overflow-hidden',
        label: 'Overflow clipping',
        tier: 2,
        extract: css => /overflow\s*:\s*hidden/i.test(css) ? 'hidden' : null,
        compare: () => 'pass',
        describeFix: () => `Add \`overflow: hidden;\` to contain blur and child elements within the boundary`,
    },
];
// ── Scoring ──────────────────────────────────────────────────────────
const TIER_WEIGHT = { 1: 2, 2: 1 };
const PARTIAL_FACTOR = 0.5;
function auditOnePattern(submittedCss, pattern, category) {
    const refCss = extractCssText(pattern.preview_html);
    // Determine signature: which detectors fire on the reference
    const signature = [];
    for (const d of DETECTORS) {
        const v = d.extract(refCss);
        if (v !== null)
            signature.push({ detector: d, refValue: v });
    }
    let totalWeight = 0;
    let earnedWeight = 0;
    const traits = [];
    for (const { detector, refValue } of signature) {
        const w = TIER_WEIGHT[detector.tier];
        totalWeight += w;
        const found = detector.extract(submittedCss);
        if (found === null) {
            traits.push({
                trait: detector.label,
                status: 'missing',
                expected: refValue,
                found: null,
                fix: detector.describeFix(refValue),
            });
            continue;
        }
        const cmp = detector.compare(refValue, found);
        if (cmp === 'pass') {
            earnedWeight += w;
            traits.push({ trait: detector.label, status: 'pass', expected: refValue, found, fix: null });
        }
        else {
            earnedWeight += w * PARTIAL_FACTOR;
            traits.push({
                trait: detector.label,
                status: 'partial',
                expected: refValue,
                found,
                fix: detector.describeFix(refValue),
            });
        }
    }
    const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) / 100 : 1;
    const verdict = score >= 0.8 ? 'pass' : score >= 0.4 ? 'partial' : 'fail';
    // Sort: missing first, then partial, then pass — actionable items on top
    const ORDER = { missing: 0, partial: 1, pass: 2 };
    traits.sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    return {
        pattern: pattern.name,
        slug: pattern.slug,
        category: category.name,
        designIntent: pattern.prompts.textual,
        verdict,
        score,
        traits,
    };
}
// ── Public API ───────────────────────────────────────────────────────
export function auditImplementation(code, patternNames) {
    const submittedCss = extractCssText(code);
    const audits = [];
    const notFound = [];
    for (const name of patternNames) {
        const match = findPatternByName(name);
        if (!match) {
            const suggestions = suggestPatternNames(name, 3).map(s => `${s.name} (${s.slug})`);
            notFound.push({ input: name, suggestions });
            continue;
        }
        audits.push(auditOnePattern(submittedCss, match.pattern, match.category));
    }
    return {
        summary: {
            patternsChecked: audits.length,
            pass: audits.filter(a => a.verdict === 'pass').length,
            partial: audits.filter(a => a.verdict === 'partial').length,
            fail: audits.filter(a => a.verdict === 'fail').length,
        },
        patterns: audits,
        notFound,
    };
}
//# sourceMappingURL=audit.js.map