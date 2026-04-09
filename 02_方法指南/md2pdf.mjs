/**
 * md2pdf.mjs — Markdown → GitHub-styled PDF with clickable TOC and page numbers
 * Usage: node md2pdf.mjs <input.md> [output.pdf]
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, basename } from 'path';
import { Marked } from 'marked';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// ── Markdown → HTML with heading anchors ──────────────────────────────────────
function convertMarkdown(mdText) {
  const headings = [];
  let headingCounter = 0;

  const marked = new Marked();
  const renderer = new marked.Renderer();

  renderer.heading = function ({ text, depth }) {
    const id = `h-${++headingCounter}`;
    const plainText = text.replace(/<[^>]+>/g, '');
    headings.push({ id, depth, text: plainText });
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  marked.setOptions({ renderer, gfm: true, breaks: false });
  const bodyHtml = marked.parse(mdText);
  return { bodyHtml, headings };
}

// ── Build clickable TOC HTML ──────────────────────────────────────────────────
function buildTocHtml(headings) {
  const filtered = headings.filter(
    h => (h.depth === 2 || h.depth === 3) && h.text !== '目录'
  );
  if (filtered.length === 0) return '';

  let html = '<nav class="pdf-toc"><h2 class="toc-title">目　录</h2>\n';
  for (const h of filtered) {
    const cls = h.depth === 2 ? 'toc-part' : 'toc-section';
    html += `<div class="${cls}"><a href="#${h.id}">${h.text}</a></div>\n`;
  }
  html += '</nav>\n';
  return html;
}

// ── Full HTML document ────────────────────────────────────────────────────────
function wrapHtml(title, tocHtml, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
/* ── GitHub Markdown Body ───────────────────────────── */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC",
    "Microsoft YaHei", Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  color: #1f2328;
  word-wrap: break-word;
  margin: 0;
  padding: 0;
}

/* ── Headings ───────────────────────────────────────── */
h1, h2, h3, h4, h5, h6 {
  margin-top: 24px; margin-bottom: 16px;
  font-weight: 600; line-height: 1.25;
}
h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid #d1d9e0; }
h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid #d1d9e0; }
h3 { font-size: 1.25em; }
h4 { font-size: 1em; }
h1:first-child { margin-top: 0; }

/* ── Paragraph & inline ─────────────────────────────── */
p { margin-top: 0; margin-bottom: 16px; }
strong { font-weight: 600; }
a { color: #0969da; text-decoration: none; }
a:hover { text-decoration: underline; }

/* ── Blockquote ─────────────────────────────────────── */
blockquote {
  margin: 0 0 16px 0; padding: 0 1em;
  color: #656d76; border-left: .25em solid #d0d7de;
}
blockquote > :first-child { margin-top: 0; }
blockquote > :last-child { margin-bottom: 0; }

/* ── Code ───────────────────────────────────────────── */
code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", monospace;
  font-size: 85%; padding: .2em .4em;
  margin: 0; background: rgba(175,184,193,.2); border-radius: 6px;
}
pre {
  margin-top: 0; margin-bottom: 16px; padding: 16px;
  overflow: auto; font-size: 85%; line-height: 1.45;
  background: #f6f8fa; border-radius: 6px;
}
pre code {
  display: inline; padding: 0; margin: 0;
  overflow: visible; line-height: inherit; word-wrap: normal;
  background: transparent; border: 0; font-size: 100%;
}

/* ── Table ──────────────────────────────────────────── */
table {
  border-spacing: 0; border-collapse: collapse;
  margin-top: 0; margin-bottom: 16px;
  display: table; width: max-content; max-width: 100%; overflow: auto;
}
th, td {
  padding: 6px 13px; border: 1px solid #d0d7de;
}
th {
  font-weight: 600; background-color: #f6f8fa;
}
tr { background-color: #ffffff; border-top: 1px solid #d8dee4; }
tr:nth-child(2n) { background-color: #f6f8fa; }

/* ── Lists ──────────────────────────────────────────── */
ul, ol { margin-top: 0; margin-bottom: 16px; padding-left: 2em; }
li { margin-top: .25em; }
li + li { margin-top: .25em; }

/* ── Horizontal rule ────────────────────────────────── */
hr {
  height: .25em; padding: 0; margin: 24px 0;
  background-color: #d0d7de; border: 0; overflow: hidden;
}

/* ── TOC page ───────────────────────────────────────── */
.pdf-toc {
  page-break-after: always;
}
.toc-title {
  font-size: 1.5em; font-weight: 600;
  border-bottom: 1px solid #d1d9e0;
  padding-bottom: .3em;
  margin-bottom: 1em;
}
.toc-part {
  font-weight: 600;
  margin: .6em 0 .1em 0;
  font-size: 1em;
}
.toc-part a { color: #1f2328; text-decoration: none; }
.toc-section {
  margin: .1em 0 .1em 2em;
  font-size: .92em;
  line-height: 1.55;
}
.toc-section a { color: #656d76; text-decoration: none; }
.toc-section a:hover, .toc-part a:hover { color: #0969da; }

/* ── Print / PDF ────────────────────────────────────── */
@page { size: A4; }

/* Avoid orphaned headings at page bottom */
h2, h3, h4 { page-break-after: avoid; }
table, pre, blockquote, figure { page-break-inside: avoid; }
</style>
</head>
<body>
${tocHtml}
${bodyHtml}
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node md2pdf.mjs <input.md> [output.pdf]');
    process.exit(1);
  }
  const inputPath = resolve(args[0]);
  const outputPath = args[1]
    ? resolve(args[1])
    : inputPath.replace(/\.md$/i, '.pdf');

  console.log(`Reading: ${inputPath}`);
  let md = readFileSync(inputPath, 'utf-8');

  // Normalize line endings
  md = md.replace(/\r\n/g, '\n');

  // Strip the manual TOC section from markdown body
  md = md.replace(/\n## 目录\n[\s\S]*?\n---\n(?=\n## )/, '\n');

  const { bodyHtml, headings } = convertMarkdown(md);
  const title = (md.match(/^#\s+(.+)$/m) || ['', 'Document'])[1];
  const tocHtml = buildTocHtml(headings);
  const fullHtml = wrapHtml(title, tocHtml, bodyHtml);

  // Write intermediate HTML for debugging
  const htmlPath = inputPath.replace(/\.md$/i, '.html');
  writeFileSync(htmlPath, fullHtml, 'utf-8');
  console.log(`HTML: ${htmlPath}`);

  // Launch Chrome and generate PDF
  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
  });

  await page.pdf({
    path: outputPath,
    format: 'A4',
    margin: { top: '18mm', bottom: '20mm', left: '18mm', right: '18mm' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="width:100%; text-align:center; font-size:9px; color:#888;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`,
  });

  await browser.close();
  console.log(`PDF: ${outputPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
