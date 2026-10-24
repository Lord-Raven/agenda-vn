import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameConfiguration, Stage } from '../src/Stage';
import { GlobalStatBar } from '../src/components/GlobalStatBar';
import { ControlDock } from '../src/components/ControlDock';
import { Control } from '../src/content/Control';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { CALENDAR_TIME_OF_DAY_ORDER } from '../src/content/CalendarEvent';
import { Actor } from '../src/content/Actor';
import { Item } from '../src/content/Item';
import { Location } from '../src/content/Location';

const createStage = () => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], functions: [], globalStatValues: {}, statUpdateRules: [],
        controls: Array.from({ length: 8 }, (_, index) => new Control({
            name: `Control ${index}`, placement: 'top', widthWeight: index === 3 ? 2 : 1,
        })),
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-23',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => ({
        playerId: '', actors: {}, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    });
    return stage;
};

const renderBar = (isVerticalLayout: boolean, withButtons = true, buttonHeight = 32) => {
    const stage = createStage();
    return renderToStaticMarkup(<GlobalStatBar
        stage={() => stage}
        isVerticalLayout={isVerticalLayout}
        buttons={withButtons ? <button data-actions style={{ width: 120, height: buttonHeight }}>Actions</button> : undefined}
    />);
};

for (const isVerticalLayout of [false, true]) {
    test(`stat bar floats actions and preserves weighted control widths (compact: ${isVerticalLayout})`, () => {
        const html = renderBar(isVerticalLayout);
        assert.match(html, /float:right/);
        assert.match(html, /display:contents/);
        assert.match(html, /float:left/);
        assert.ok(html.indexOf('>Actions<') < html.indexOf('Current Date:'));
        assert.ok(html.includes(`width:calc(${isVerticalLayout ? 96 : 150}px * 2)`));
        assert.equal((html.match(/>Control \d</g) || []).length, 8);
    });

    test(`stat bar retains flex layout without actions (compact: ${isVerticalLayout})`, () => {
        const html = renderBar(isVerticalLayout, false);
        assert.doesNotMatch(html, /float:|display:contents/);
        assert.match(html, /flex-wrap:wrap/);
        assert.ok(html.includes(`flex:2 1 calc(${isVerticalLayout ? 96 : 150}px * 2)`));
    });
}

for (const dateMode of ['calendar', 'turnBased'] as const) {
    for (const timeMode of ['timeOfDay', 'phase'] as const) {
        for (const isVerticalLayout of [false, true]) {
            for (const [phaseIndex, currentTimeOfDay] of CALENDAR_TIME_OF_DAY_ORDER.entries()) {
                test(`date indicator: ${dateMode}, ${timeMode}, vertical ${isVerticalLayout}, ${currentTimeOfDay}`, () => {
                    const stage = createStage();
                    Object.assign(stage.getConfiguration(), { dateMode, timeMode });
                    const save = { ...stage.getSave()!, currentTimeOfDay };
                    stage.getSave = () => save;
                    const html = renderToStaticMarkup(<GlobalStatBar stage={() => stage} isVerticalLayout={isVerticalLayout} />);
                    const useSegments = dateMode === 'turnBased' && timeMode === 'phase' && isVerticalLayout;
                    assert.equal(html.includes('role="img"'), useSegments);
                    assert.equal(html.includes('Hourglass'), timeMode === 'phase' && !useSegments);
                    const segments = html.match(/<span\b[^>]*aria-hidden="true"[^>]*>/g) || [];
                    assert.equal(segments.length, useSegments ? 4 : 0);
                    if (useSegments) {
                        assert.match(html, new RegExp(`aria-label="Phase ${phaseIndex + 1} of 4"`));
                        assert.match(html, />Day 1</);
                        segments.forEach((segment, index) => {
                            const className = segment.match(/\bcss-[\w-]+/)![0];
                            const styles = html.match(new RegExp(`\\.${className}\\{([^}]+)\\}`))![1];
                            assert.ok(styles.includes(`background-color:var(--agenda-${index <= phaseIndex ? 'highlight' : 'text-muted'})`));
                            assert.ok(styles.includes(`opacity:${index <= phaseIndex ? '1' : '0.45'}`));
                        });
                    } else if (timeMode === 'timeOfDay') {
                        assert.match(html, /data-testid="(?:WbTwilight|WbSunny|Bedtime|Bed)Icon"/);
                    }
                });
            }
        }
    }
}

for (const placement of ['top', 'bottom'] as const) {
    for (const type of ['statDisplay', 'statEditor'] as const) {
        for (const withIcon of [false, true]) {
            for (const isVerticalLayout of [false, true]) {
                test(`${placement} ${type} keeps the value ${isVerticalLayout ? 'inline without a label' : 'below its label'} (icon: ${withIcon})`, () => {
                    const stage = createStage();
                    const configuration = stage.getConfiguration();
                    configuration.globalStats = [{
                        id: 'health', name: 'Health', type: 'number', default: 42, guidance: '',
                        llmSees: { value: true, conditions: [] },
                        llmMaintained: { value: true, conditions: [] },
                    }];
                    configuration.controls = [new Control({
                        placement, type, statId: 'health', label: 'Current health',
                        iconName: withIcon ? 'heart' : '', description: 'Health description',
                    })];
                    const Bar = placement === 'top' ? GlobalStatBar : ControlDock;
                    const html = renderToStaticMarkup(<Bar stage={() => stage} isVerticalLayout={isVerticalLayout} />);
                    assert.match(html, /role="group" aria-label="Current health" title="Health description"/);
                    if (isVerticalLayout) {
                        assert.doesNotMatch(html, />Current health</);
                        assert.match(html, /flex-direction:row;[^}]*align-items:center/);
                    } else {
                        assert.match(html, />Current health</);
                    }
                    const valueIndex = html.indexOf(type === 'statEditor' ? 'value="42"' : '>42<');
                    assert.ok(valueIndex >= 0, 'the stat value is preserved');
                    const iconIndex = html.indexOf('data-testid="FavoriteIcon"');
                    assert.equal(iconIndex >= 0, withIcon);
                    if (withIcon) {
                        assert.ok(iconIndex < valueIndex, 'the icon precedes the value');
                    }
                });
            }
        }
    }
}

// Set CHROME_BIN to run geometric regression checks with an existing Chromium installation.
test('content list displays match ordinary control heights without clipping portraits', { skip: !process.env.CHROME_BIN }, () => {
    const directory = mkdtempSync(join(tmpdir(), 'agenda-list-height-'));
    try {
        const fixtures: string[] = [];
        for (const placement of ['top', 'bottom'] as const) {
            for (const isVerticalLayout of [false, true]) {
                for (const withButtons of placement === 'top' ? [false, true] : [false]) {
                    for (const count of [0, 1, 8]) {
                        const stage = createStage();
                        const configuration = stage.getConfiguration();
                        configuration.dateMode = 'turnBased';
                        configuration.timeMode = 'phase';
                        configuration.globalStats = [
                            { id: 'health', name: 'Health', type: 'number' as const, default: 42, guidance: '' },
                            ...(['actorList', 'itemList', 'locationList'] as const).map(type => ({
                                id: type, name: type, type, default: Array.from({ length: count }, (_, index) => `${index}`), guidance: '',
                            })),
                        ].map(stat => ({
                            ...stat,
                            llmSees: { value: true, conditions: [] },
                            llmMaintained: { value: true, conditions: [] },
                        }));
                        configuration.controls = configuration.globalStats.map(stat => new Control({
                            placement, type: 'statDisplay', statId: stat.id, label: stat.name,
                        }));
                        const save = stage.getSave()!;
                        for (let index = 0; index < count; index++) {
                            const id = `${index}`;
                            save.actors[id] = new Actor({ id, name: `Actor ${index}` });
                            save.inventory.push(new Item({ id, name: `Item ${index}` }));
                            save.atlas[id] = new Location({ id, name: `Location ${index}` });
                        }
                        stage.getSave = () => save;
                        const html = renderToStaticMarkup(placement === 'top'
                            ? <GlobalStatBar stage={() => stage} isVerticalLayout={isVerticalLayout} buttons={withButtons ? <button>Menu</button> : undefined} />
                            : <ControlDock stage={() => stage} isVerticalLayout={isVerticalLayout} />);
                        for (const width of [320, 960]) {
                            fixtures.push(`<main data-compact="${isVerticalLayout}" data-count="${count}" style="width:${width}px">${html}</main>`);
                        }
                    }
                }
            }
        }
        const fixture = join(directory, 'layout.html');
        writeFileSync(fixture, `<!doctype html><style>
            :root { --agenda-highlight: #99f; --agenda-panel-border: #ddd; }
            * { transition: none !important; }
            </style><body style="margin:0;font-size:16px">
            ${fixtures.join('')}
            <pre id="result"></pre>
            <script>
                const errors = [];
                function check(value, message) { if (!value) errors.push(message); }
                document.querySelectorAll('main').forEach((main, index) => {
                    const compact = main.dataset.compact === 'true';
                    const ordinary = main.querySelector('[aria-label="Health"]');
                    const height = ordinary.getBoundingClientRect().height;
                    check(height <= (compact ? 30.1 : 65), index + ': ordinary height is not inflated');
                    const day = main.querySelector('[title^="Current Date:"]');
                    if (day && compact) {
                        check(Math.abs(day.getBoundingClientRect().height - height) < 1, index + ': matches Day height (' + day.getBoundingClientRect().height + ', ' + height + ')');
                    }
                    ['actorList', 'itemList', 'locationList'].forEach(kind => {
                        const control = main.querySelector('[aria-label="' + kind + '"]');
                        // Ordinary values can grow slightly with their container-relative font size.
                        check(Math.abs(control.getBoundingClientRect().height - height) < (compact ? 1 : 2), index + ': ' + kind + ' matches ordinary height (' + control.getBoundingClientRect().height + ', ' + height + ')');
                        const list = control.querySelector('[role="list"]');
                        const portraits = list.querySelectorAll('[role="listitem"]');
                        check(portraits.length === Number(main.dataset.count), index + ': list contents preserved');
                        [portraits[0], portraits[portraits.length - 1]].filter(Boolean).forEach((portrait, end) => {
                            const viewport = list.parentElement;
                            viewport.scrollLeft = end ? viewport.scrollWidth : 0;
                            portrait.focus({ preventScroll: true });
                            const style = getComputedStyle(portrait);
                            const scale = new DOMMatrix(style.transform).a;
                            const outline = (parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)) * scale;
                            const bounds = portrait.getBoundingClientRect();
                            const clip = viewport.getBoundingClientRect();
                            check(bounds.top - outline >= clip.top - 0.1 && bounds.bottom + outline <= clip.bottom + 0.1, index + ': focus outline fits vertically');
                            check(bounds.left - outline >= clip.left - 0.1 && bounds.right + outline <= clip.right + 0.1, index + ': focus outline fits horizontally (' + bounds.left + ', ' + bounds.right + ', ' + outline + ', ' + clip.left + ', ' + clip.right + ')');
                            portrait.blur();
                        });
                    });
                });
                document.getElementById('result').textContent = errors.length ? JSON.stringify(errors) : 'PASS';
            </script>`);
        const output = execFileSync(process.env.CHROME_BIN!, [
            '--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', `file://${fixture}`,
        ], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        assert.equal(output.match(/<pre id="result">([^<]*)<\/pre>/)?.[1], 'PASS');
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('vertical Day phase segments stay beneath the label and match compact control heights', { skip: !process.env.CHROME_BIN }, () => {
    const directory = mkdtempSync(join(tmpdir(), 'agenda-day-segments-'));
    try {
        const fixtures: string[] = [];
        for (const withButtons of [false, true]) {
            for (const day of [1, 12345]) {
                for (const currentTimeOfDay of CALENDAR_TIME_OF_DAY_ORDER) {
                    const stage = createStage();
                    const configuration = stage.getConfiguration();
                    Object.assign(configuration, { dateMode: 'turnBased', timeMode: 'phase' });
                    configuration.globalStats = [{
                        id: 'health', name: 'Health', type: 'number', default: 42, guidance: '',
                        llmSees: { value: true, conditions: [] },
                        llmMaintained: { value: true, conditions: [] },
                    }];
                    configuration.controls = [
                        new Control({ name: 'Action', placement: 'top' }),
                        new Control({ type: 'statDisplay', statId: 'health', label: 'Health', placement: 'top' }),
                    ];
                    const save = { ...stage.getSave()!, currentTimeOfDay };
                    stage.getSave = () => save;
                    stage.getDayNumberForDate = () => day;
                    fixtures.push(renderToStaticMarkup(<GlobalStatBar
                        stage={() => stage}
                        isVerticalLayout
                        buttons={withButtons ? <button>Menu</button> : undefined}
                    />));
                }
            }
        }
        const fixture = join(directory, 'layout.html');
        writeFileSync(fixture, `<!doctype html><body style="margin:0;font-size:16px">
            ${fixtures.map(html => `<main style="width:320px">${html}</main>`).join('')}
            <pre id="result"></pre>
            <script>
                const errors = [];
                function check(value, message) { if (!value) errors.push(message); }
                document.querySelectorAll('main').forEach((main, index) => {
                    const day = main.querySelector('[title^="Current Date:"]');
                    const bounds = day.getBoundingClientRect();
                    const label = day.querySelector('p').getBoundingClientRect();
                    const segments = [...day.querySelectorAll('[role="img"] span')].map(element => element.getBoundingClientRect());
                    check(bounds.height >= 30 && bounds.height <= 32, index + ': compact Day height');
                    main.querySelectorAll('button:not([title]), [role="group"]').forEach(control => {
                        if (control.textContent === 'Menu') return;
                        check(Math.abs(control.getBoundingClientRect().height - bounds.height) <= 2, index + ': aligned control height');
                    });
                    check(segments.length === 4, index + ': four segments');
                    segments.forEach((segment, segmentIndex) => {
                        check(segment.width > 0 && segment.height === 3, index + ': horizontal segment');
                        check(segment.top >= label.bottom && segment.bottom < bounds.bottom, index + ': below label inside badge');
                        check(segment.top === segments[0].top, index + ': segments on one line');
                        if (segmentIndex) check(segment.left > segments[segmentIndex - 1].right, index + ': separated segments');
                    });
                });
                document.getElementById('result').textContent = errors.length ? JSON.stringify(errors) : 'PASS';
            </script>`);
        const output = execFileSync(process.env.CHROME_BIN!, [
            '--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', `file://${fixture}`,
        ], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
        assert.match(output, /<pre id="result">PASS<\/pre>/);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('wrapped stats reclaim the area below the upper-right actions', { skip: !process.env.CHROME_BIN }, () => {
    const directory = mkdtempSync(join(tmpdir(), 'agenda-stat-bar-'));
    try {
        const cases = [
            { width: 520, compact: false, height: 32 },
            { width: 320, compact: true, height: 32 },
            { width: 520, compact: false, height: 120 },
            { width: 2200, compact: false, height: 32 },
        ];
        const fixture = join(directory, 'layout.html');
        writeFileSync(fixture, `<!doctype html><body style="margin:0">
            ${cases.map(({ width, compact, height }) =>
                `<main style="width:${width}px">${renderBar(compact, true, height)}</main>`).join('')}
            <pre id="result"></pre>
            <script>
                const errors = [];
                function check(value, message) { if (!value) errors.push(message); }
                document.querySelectorAll('main').forEach((main, index) => {
                    const bar = main.querySelector('div');
                    const bounds = bar.getBoundingClientRect();
                    const actions = main.querySelector('[data-actions]').getBoundingClientRect();
                    const controls = [...main.querySelectorAll('button:not([data-actions])')]
                        .map(element => element.getBoundingClientRect());
                    const stats = [main.querySelector('[title^="Current Date:"]').getBoundingClientRect(), ...controls];
                    check(Math.abs(actions.top - bounds.top) < 1, index + ': actions are at the top');
                    check(Math.abs(actions.right - bounds.right) < 1, index + ': actions are at the right');
                    stats.forEach((stat, statIndex) => {
                        check(stat.left >= bounds.left && stat.right <= bounds.right + 1, index + ': stat fits ' + statIndex);
                        check(stat.bottom <= bounds.bottom + 1, index + ': bar contains stat ' + statIndex);
                        check(stat.right <= actions.left || stat.left >= actions.right ||
                            stat.top >= actions.bottom || stat.bottom <= actions.top, index + ': no action overlap ' + statIndex);
                        stats.slice(statIndex + 1).forEach(other => check(
                            stat.right <= other.left || stat.left >= other.right ||
                            stat.top >= other.bottom || stat.bottom <= other.top, index + ': no stat overlap'));
                    });
                    check(Math.abs(controls[3].width / controls[0].width - 2) < 0.01, index + ': weighted widths');
                    if (index === 3) {
                        check(stats.every(stat => Math.abs(stat.top - bounds.top) < 1), 'wide: single row');
                    } else {
                        check(stats.some(stat => stat.top >= actions.bottom && stat.right > actions.left),
                            index + ': wrapped stats use space underneath actions');
                    }
                });
                document.getElementById('result').textContent = errors.length ? JSON.stringify(errors) : 'PASS';
            </script>`);
        const output = execFileSync(process.env.CHROME_BIN!, [
            '--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', `file://${fixture}`,
        ], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
        assert.match(output, /<pre id="result">PASS<\/pre>/);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
