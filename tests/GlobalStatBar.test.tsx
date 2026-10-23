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
