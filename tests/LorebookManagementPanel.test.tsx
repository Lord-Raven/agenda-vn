import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stage, GameConfiguration, SaveType } from '../src/Stage';
import { createLoreEntry } from '../src/content/Lore';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { LorebookManagementPanel } from '../src/screens/LorebookManagementPanel';
import { LorebookDetailPanel } from '../src/screens/LorebookDetailPanel';

const fixture = () => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [createLoreEntry({ title: 'Configured lore', content: 'Configuration content' })],
        calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], globalStatValues: {}, statUpdateRules: [], controls: [], functions: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-23',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: '', actors: {}, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
        lorebook: [createLoreEntry({ title: 'Saved lore', content: 'Save content' })],
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    return { stage, configuration, save };
};

test('lorebook management renders the selected detail from the appropriate source', () => {
    const { stage } = fixture();
    for (const isCreatorMode of [false, true]) {
        const html = renderToStaticMarkup(<LorebookManagementPanel stage={() => stage} isCreatorMode={isCreatorMode} />);
        assert.match(html, isCreatorMode ? /Configuration content/ : /Save content/);
        assert.doesNotMatch(html, isCreatorMode ? /Save content/ : /Configuration content/);
        assert.match(html, /overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;min-height:0;min-width:0;max-height:100%/);
        assert.match(html, /grid-template-columns:minmax\(280px, 360px\) minmax\(0, 1fr\)/);
        assert.match(html, />Clone<\/button>/);
        assert.match(html, />Delete<\/button>/);
        assert.equal(html.includes('>Apply</button>'), isCreatorMode);
    }
});

test('empty lorebooks retain the selection prompt', () => {
    const { stage, configuration, save } = fixture();
    configuration.lorebook = [];
    save.lorebook = [];
    for (const isCreatorMode of [false, true]) {
        const html = renderToStaticMarkup(<LorebookManagementPanel stage={() => stage} isCreatorMode={isCreatorMode} />);
        assert.match(html, /Select a lore entry to view and edit details/);
        assert.doesNotMatch(html, /<textarea/);
    }
});

test('lore detail retains the editor fields and allows controls to reflow without shrinking content', () => {
    const { stage } = fixture();
    const html = renderToStaticMarkup(<LorebookDetailPanel
        lore={createLoreEntry({ title: 'Entry', content: 'Editable content', triggers: ['first', 'second'] })}
        stage={() => stage}
        isCreatorMode={false}
        categories={[{ value: 'world', label: 'World' }, { value: 'Actor name', label: 'Actor name' }]}
        matchesExistingActor
        matchesExistingLocation
        onChange={() => {}}
        onTitleChange={() => {}}
        onClone={() => {}}
        onDelete={() => {}}
    />);
    for (const label of ['Title', 'Category', 'Availability', 'Triggering Conditions', 'Order', 'Priority', 'Probability', 'Scan Depth', 'Generatively Maintained', 'Triggers', 'Constant', 'Content']) {
        assert.ok(html.includes(label), `Missing ${label}`);
    }
    assert.match(html, /providing the lore for a matching character/);
    assert.match(html, /providing the description for a matching location/);
    assert.match(html, /value="Actor name"/);
    assert.match(html, /repeat\(auto-fit, minmax\(min\(100%, 120px\), 1fr\)\)/);
    assert.match(html, /<textarea(?=[^>]*rows="10")(?=[^>]*min-height:200px;resize:vertical)/);
    assert.match(html, /display:flex;flex-wrap:wrap;justify-content:flex-end/);
    assert.match(html, />first<\/span>/);
    assert.match(html, />second<\/span>/);
    assert.match(html, /Add trigger/);
});

test('constant lore disables scan depth and trigger controls', () => {
    const { stage } = fixture();
    const html = renderToStaticMarkup(<LorebookDetailPanel
        lore={createLoreEntry({ constant: true, triggers: ['disabled trigger'] })}
        stage={() => stage}
        isCreatorMode={false}
        categories={[]}
        matchesExistingActor={false}
        matchesExistingLocation={false}
        onChange={() => {}}
        onTitleChange={() => {}}
        onClone={() => {}}
        onDelete={() => {}}
    />);
    assert.match(html, /<input[^>]*disabled=""[^>]*aria-label="Lore scan depth"/);
    assert.match(html, /opacity:0.5;pointer-events:none/);
    assert.match(html, /MuiChip-root[^"]*Mui-disabled/);
    assert.match(html, />disabled trigger<\/span>/);
});
