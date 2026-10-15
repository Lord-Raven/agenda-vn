import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Control } from '../src/content/Control';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { FunctionEditor } from '../src/components/FunctionEditor';
import { renderStatTypeOptions } from '../src/components/StatEntryEditor';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';
import { FunctionManagementPanel } from '../src/screens/FunctionManagementPanel';
import { StatUpdateRuleEditor } from '../src/components/StatUpdateRuleEditor';

const fixture = () => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], globalStatValues: {}, statUpdateRules: [], controls: [],
        functions: [{ id: 'reward', name: 'Reward player', description: 'Give gold', script: 'set("Gold", 10);' }],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-15',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: '', actors: {}, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    return { stage, configuration };
};

test('functions have a dedicated management panel with add, reorder, and delete controls', () => {
    const { stage } = fixture();
    const html = renderToStaticMarkup(<FunctionManagementPanel stage={() => stage} />);
    assert.match(html, /Functions/);
    assert.match(html, /Reward player/);
    assert.match(html, /Add Function/);
    assert.match(html, /aria-label="Move function up"/);
    assert.match(html, /aria-label="Move function down"/);
    assert.match(html, /aria-label="Delete function"/);
});

test('function management shows an empty state without definitions', () => {
    const { stage, configuration } = fixture();
    configuration.functions = [];
    const html = renderToStaticMarkup(<FunctionManagementPanel stage={() => stage} />);
    assert.match(html, /No functions defined/);
    assert.match(html, /Add Function/);
});

test('function editor offers isolated testing without scoped target selectors', () => {
    const html = renderToStaticMarkup(<FunctionEditor script="return 42;" onScriptChange={() => {}} onTest={() => ({ value: 42, errors: [] })} />);
    assert.match(html, /return 42;/);
    assert.match(html, /Test/);
    assert.doesNotMatch(html, /Function test target|<select/);
});

test('stats no longer offer a function type', () => {
    const html = renderToStaticMarkup(<select>{renderStatTypeOptions()}</select>);
    assert.match(html, /value="number"/);
    assert.doesNotMatch(html, /value="function"/);
});

test('button function actions select separate definitions without stat or entity targets', () => {
    const { stage } = fixture();
    const control = new Control({ actions: [{ id: 'action', kind: 'function', functionId: 'reward' }] });
    const html = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
    assert.match(html, /Invoke a function/);
    assert.match(html, /value="reward" selected="">Reward player/);
    assert.doesNotMatch(html, /Choose actor target|Choose item target|Choose location target|value="global"/);
});

test('recurring rules describe global function invocations by their separate definitions', () => {
    const { stage } = fixture();
    const html = renderToStaticMarkup(<StatUpdateRuleEditor stage={stage} globalStats={[]} actorStats={[]} actors={[]} locations={[]}
        rules={[{ id: 'rule', conditions: [], updates: [{ id: 'action', kind: 'function', functionId: 'reward' }] }]} onChange={() => {}} />);
    assert.match(html, /Invoke Reward player/);
    assert.doesNotMatch(html, /Unassigned function/);
});
