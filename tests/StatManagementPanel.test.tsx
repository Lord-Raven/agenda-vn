import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { cloneStat } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { StatManagementPanel } from '../src/screens/StatManagementPanel';
import { StatsDetailPanel } from '../src/screens/StatsDetailPanel';
import { RulesManagementPanel } from '../src/screens/RulesManagementPanel';
import { ContentManagementScreen } from '../src/screens/ContentManagementScreen';
import { TooltipProvider } from '../src/components/TooltipContext';

const fixture = () => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [],
        globalStats: [cloneStat({ id: 'weather', name: 'Weather', type: 'text', default: 'Sunny' })],
        actorStats: [cloneStat({ id: 'health', name: 'Health', type: 'number', default: 50 })],
        locationStats: [cloneStat({ id: 'danger', name: 'Danger', type: 'number', default: 0 })],
        itemStats: [cloneStat({ id: 'weight', name: 'Weight', type: 'number', default: 1 })],
        globalStatValues: { weather: 'Rainy' }, statUpdateRules: [], controls: [], functions: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-21',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: false,
    };
    const save: SaveType = {
        playerId: '', actors: {}, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: { weather: 'Rainy' },
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.areEventsEnabled = () => configuration.useEvents;
    stage.getManagedCalendarEvents = () => [];
    stage.isOwner = true;
    return { stage, configuration };
};

test('creator stats show four categorized lists and a selection prompt, not inline editors or rules', () => {
    const { stage } = fixture();
    const html = renderToStaticMarkup(<StatManagementPanel stage={() => stage} isCreatorMode />);
    for (const category of ['Global', 'Actor', 'Location', 'Item']) {
        assert.match(html, new RegExp(`${category} \\(1\\)`));
    }
    for (const name of ['Weather', 'Health', 'Danger', 'Weight']) {
        assert.match(html, new RegExp(name));
    }
    assert.equal((html.match(/aria-pressed="false"/g) || []).length, 4);
    assert.equal((html.match(/ New<\/button>/g) || []).length, 4);
    assert.match(html, /Select a stat to view and edit details/);
    assert.match(html, /grid-template-columns:minmax\(280px, 360px\) minmax\(0, 1fr\)/);
    assert.doesNotMatch(html, /Universal Schedule|Stat Update Events|Setting name|Stat name|>Expand</);
});

test('empty stat categories remain available for creating stats', () => {
    const { stage, configuration } = fixture();
    configuration.globalStats = [];
    configuration.actorStats = [];
    configuration.locationStats = [];
    configuration.itemStats = [];
    const html = renderToStaticMarkup(<StatManagementPanel stage={() => stage} isCreatorMode />);
    assert.equal((html.match(/No stats\./g) || []).length, 4);
    assert.equal((html.match(/ New<\/button>/g) || []).length, 4);
});

for (const category of ['global', 'actor', 'location', 'item'] as const) {
    test(`${category} stat details retain editing, reordering and removal without a collapse toggle`, () => {
        const { stage, configuration } = fixture();
        const stat = configuration[`${category}Stats`][0];
        const html = renderToStaticMarkup(
            <TooltipProvider>
                <StatsDetailPanel
                    stat={stat} category={category} index={0} total={2} typeLabel={`${category} Stat`}
                    selfStats={[stat]} globalStats={configuration.globalStats} actorStats={configuration.actorStats}
                    conditionActors={[]} valueActors={[]} items={[]} locations={[]} stage={() => stage}
                    onMove={() => {}} onRemove={() => {}} onPatch={() => {}}
                />
            </TooltipProvider>,
        );
        assert.match(html, new RegExp(`value="${stat.name}"`));
        assert.match(html, /Send to LLM/);
        assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Move stat up"/);
        assert.match(html, /aria-label="Move stat down"/);
        assert.match(html, new RegExp(`Remove ${category} Stat`));
        assert.doesNotMatch(html, />Expand<|>Collapse</);
        if (category === 'global') {
            assert.match(html, /Default Value Rules/);
        }
    });
}

test('rules contain the existing schedule and recurring updates with configured stat context', () => {
    const { stage, configuration } = fixture();
    configuration.statUpdateRules = [{
        id: 'tick', conditions: [], updates: [
            { id: 'heal', targetType: 'actor', targetId: 'any', statId: 'health', operation: 'adjust', value: 2 },
            { id: 'risk', targetType: 'location', targetId: 'any', statId: 'danger', operation: 'adjust', value: 1 },
            { id: 'load', targetType: 'item', targetId: 'any', statId: 'weight', operation: 'set', value: 5 },
        ],
    }];
    const html = renderToStaticMarkup(<RulesManagementPanel stage={() => stage} />);
    assert.match(html, /Universal Schedule/);
    assert.match(html, /No universal schedule entries/);
    assert.match(html, /Stat Update Events/);
    assert.match(html, /Health adjust by 2; Danger adjust by 1; Weight set to 5/);
    assert.match(html, /Every time period/);
    assert.doesNotMatch(html, /Select a stat/);
});

test('manage-mode stats retain the global-value editor and do not expose creator rules', () => {
    const { stage } = fixture();
    const html = renderToStaticMarkup(
        <TooltipProvider><StatManagementPanel stage={() => stage} isCreatorMode={false} /></TooltipProvider>,
    );
    assert.match(html, /Weather/);
    assert.match(html, /Rainy/);
    assert.doesNotMatch(html, /Select a stat|Health|Universal Schedule|Stat Update Events/);
});

test('Rules is a creator-only content tab, independent of calendar events, with a saved-tab fallback', () => {
    const { stage } = fixture();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: { getItem: () => 'rules', setItem: () => {} },
    });
    try {
        const render = () => renderToStaticMarkup(
            <TooltipProvider><ContentManagementScreen stage={() => stage} onClose={() => {}} /></TooltipProvider>,
        );
        const creatorHtml = render();
        assert.match(creatorHtml, /> Rules<\/button>/);
        assert.match(creatorHtml, /Universal Schedule|Stat Update Events/);
        assert.doesNotMatch(creatorHtml, /Events \(0\)/);

        stage.isOwner = false;
        const manageHtml = render();
        assert.doesNotMatch(manageHtml, /> Rules<\/button>|Universal Schedule|Stat Update Events/);
        assert.match(manageHtml, /No actors|Create Actor|Select an actor/);
    } finally {
        if (descriptor) {
            Object.defineProperty(globalThis, 'sessionStorage', descriptor);
        } else {
            Reflect.deleteProperty(globalThis, 'sessionStorage');
        }
    }
});
