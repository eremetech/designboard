/**
 * Extracts the DATA array from index.html and generates patterns.json
 * with proper schema: slugs, split aliases, pre-computed prompts (textual, html, tsx).
 *
 * Run: node extract-data.cjs
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const outPath = path.join(__dirname, 'src', 'data', 'patterns.json');

const html = fs.readFileSync(htmlPath, 'utf-8');

// ---------- Extract the DATA array source ----------
const startMarker = 'const DATA = [';
const startIdx = html.indexOf(startMarker);
if (startIdx === -1) throw new Error('Could not find DATA start');

// Find the matching closing "];" — we need to count bracket depth
let depth = 0;
let inString = false;
let stringChar = '';
let endIdx = -1;

for (let i = startIdx + startMarker.length - 1; i < html.length; i++) {
  const ch = html[i];
  const prev = html[i - 1];

  if (inString) {
    if (ch === stringChar && prev !== '\\') inString = false;
    continue;
  }

  if (ch === '`' || ch === '"' || ch === "'") {
    inString = true;
    stringChar = ch;
    continue;
  }

  if (ch === '[') depth++;
  if (ch === ']') {
    depth--;
    if (depth === 0) {
      endIdx = i + 1;
      break;
    }
  }
}

if (endIdx === -1) throw new Error('Could not find DATA end');

const dataSource = html.substring(startIdx, endIdx);

// Evaluate it in a controlled scope
const DATA = new Function(`${dataSource}; return DATA;`)();
console.log(`Extracted ${DATA.length} categories`);

// ---------- htmlToTsx (ported from index.html) ----------
function htmlToTsx(htmlStr, componentName) {
  let tsx = htmlStr;

  tsx = tsx.replace(/class=/g, 'className=');

  tsx = tsx.replace(/style="([^"]*)"/g, (_match, styleString) => {
    const styles = styleString.split(';').filter(s => s.trim() !== '');
    const styleObj = styles.map(s => {
      const [key, ...valueParts] = s.split(':');
      const value = valueParts.join(':').trim();
      const camelKey = key.trim().replace(/-([a-z])/g, g => g[1].toUpperCase());
      return `${camelKey}: '${value.replace(/'/g, "\\'")}'`;
    }).join(', ');
    return `style={{ ${styleObj} }}`;
  });

  const svgAttrs = [
    'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
    'stroke-dashoffset', 'fill-rule', 'clip-rule', 'clip-path', 'stop-color',
    'stop-opacity', 'baseFrequency', 'numOctaves', 'stitchTiles',
    'color-interpolation-filters'
  ];

  svgAttrs.forEach(attr => {
    const camelAttr = attr.replace(/-([a-zA-Z])/g, g => g[1].toUpperCase());
    const regex = new RegExp(`${attr}=`, 'g');
    tsx = tsx.replace(regex, `${camelAttr}=`);
  });

  tsx = tsx.replace(/viewbox=/g, 'viewBox=');
  tsx = tsx.replace(/basefrequency=/g, 'baseFrequency=');
  tsx = tsx.replace(/numoctaves=/g, 'numOctaves=');
  tsx = tsx.replace(/stitchtiles=/g, 'stitchTiles=');

  const name = componentName.replace(/[^a-zA-Z0-9]/g, '') || 'Component';
  return `export const ${name} = () => {\n  return (\n    ${tsx}\n  );\n};`;
}

// ---------- Slugify ----------
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---------- Build patterns.json ----------
const output = {
  version: '1.0.0',
  categories: DATA.map(section => ({
    slug: slugify(section.section),
    name: section.section,
    description: section.desc,
    patterns: section.items.map(item => ({
      slug: slugify(item.name),
      name: item.name,
      aliases: item.aka.split(',').map(a => a.trim()).filter(Boolean),
      preview_html: item.css,
      prompts: {
        textual: item.prompt,
        html: `<!-- HTML/CSS implementation for ${item.name} -->\n${item.css}`,
        tsx: `// React (TSX) implementation for ${item.name}\n${htmlToTsx(item.css, item.name)}`
      }
    }))
  }))
};

const totalPatterns = output.categories.reduce((sum, c) => sum + c.patterns.length, 0);
console.log(`Generated ${totalPatterns} patterns across ${output.categories.length} categories`);

fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
console.log(`Written to ${outPath}`);
