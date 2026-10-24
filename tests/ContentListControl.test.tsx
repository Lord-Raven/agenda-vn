import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stage } from '../src/Stage';
import { ContentListPortraits } from '../src/components/ContentListControl';

const stage: Stage = Object.create(Stage.prototype);
stage.getSave = () => ({
    playerId: '', actors: {}, atlas: {}, inventory: [], maps: [],
    universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
});

const renderPortraits = (size: number, variant: 'carousel' | 'overlay', count: number) => renderToStaticMarkup(
    <ContentListPortraits
        kind="item"
        values={Array.from({ length: count }, (_, index) => `item-${index}`)}
        stage={stage}
        label="Inventory"
        size={size}
        variant={variant}
    />,
);

for (const size of [24, 28, 40, 64]) {
    for (const variant of ['carousel', 'overlay'] as const) {
        test(`${variant} portraits reserve space for the scaled icon and outline at size ${size}`, () => {
            const html = renderPortraits(size, variant, 3);
            const padding = Number(html.match(/padding:(\d+)px;/)?.[1]);
            assert.ok(padding >= size * 0.05 + 3 * 1.1);
            assert.match(html, new RegExp(`scroll-padding:${padding}px`));
            assert.match(html, /overflow-x:auto/);
            assert.match(html, /:hover,[^{]*:focus-visible\{[^}]*transform:scale\(1\.1\)/);
            assert.equal((html.match(/<div[^>]*role="listitem"/g) || []).length, 3);
        });
    }
}

test('enlarged end portraits and outlines fit inside the scroll viewport', { skip: !process.env.CHROME_BIN }, () => {
    const directory = mkdtempSync(join(tmpdir(), 'agenda-list-hover-'));
    try {
        const fixtures: string[] = [];
        for (const size of [24, 28, 40, 64]) {
            for (const variant of ['carousel', 'overlay'] as const) {
                for (const width of [90, 180, 600]) {
                    for (const count of [1, 8]) {
                        fixtures.push(`<main style="width:${width}px;container-type:inline-size">${renderPortraits(size, variant, count)}</main>`);
                    }
                }
            }
        }
        const fixture = join(directory, 'layout.html');
        writeFileSync(fixture, `<!doctype html><style>
            :root { --agenda-highlight: #99f; }
            * { transition: none !important; }
            </style>
            ${fixtures.join('')}
            <pre id="result"></pre>
            <script>
                const errors = [];
                function check(value, message) { if (!value) errors.push(message); }
                document.querySelectorAll('main').forEach((main, index) => {
                    const list = main.querySelector('[role="list"]');
                    const viewport = list.parentElement;
                    const portraits = list.querySelectorAll('[role="listitem"]');
                    [portraits[0], portraits[portraits.length - 1]].forEach((portrait, end) => {
                        viewport.scrollLeft = end ? viewport.scrollWidth : 0;
                        portrait.focus({ preventScroll: true });
                        const style = getComputedStyle(portrait);
                        check(style.transform !== 'none', index + ': focus enlarges the portrait');
                        const scale = new DOMMatrix(style.transform).a;
                        const outline = (parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)) * scale;
                        const bounds = portrait.getBoundingClientRect();
                        const clip = viewport.getBoundingClientRect();
                        check(bounds.top - outline >= clip.top - 0.1, index + ': top outline fits');
                        check(bounds.bottom + outline <= clip.bottom + 0.1, index + ': bottom outline fits');
                        check(bounds.left - outline >= clip.left - 0.1, index + ': left outline fits');
                        check(bounds.right + outline <= clip.right + 0.1, index + ': right outline fits');
                        portrait.blur();
                    });
                    if (portraits.length > 1 && main.clientWidth === 90) {
                        check(viewport.scrollWidth > viewport.clientWidth, index + ': narrow lists still scroll');
                    }
                });
                document.getElementById('result').textContent = errors.length ? JSON.stringify(errors) : 'PASS';
            </script>`);
        const output = execFileSync(process.env.CHROME_BIN!, [
            '--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', `file://${fixture}`,
        ], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
        assert.equal(output.match(/<pre id="result">([^<]*)<\/pre>/)?.[1], 'PASS');
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
