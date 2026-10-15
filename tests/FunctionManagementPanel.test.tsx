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
import { StatValueInput } from '../src/components/StatValueInput';
import { LocationSelect, ReferenceMultiSelect } from '../src/components/UiComponents';
import { IconPicker, resolveIcon } from '../src/components/StatRating';
import { cloneStat, StatType } from '../src/content/Stat';
import { functionReference, FUNCTION_RETURN_TYPES, GameFunction } from '../src/content/Function';
import { ControlRenderer } from '../src/components/ControlRenderer';

const fixture = () => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], globalStatValues: {}, statUpdateRules: [], controls: [],
        functions: [{ id: 'reward', name: 'Reward player', description: 'Give gold', script: 'set("Gold", 10);', returnType: 'void' }],
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

const valueStat = (type: StatType) => cloneStat({
    id: type, name: type, type, description: '', guidance: '', default: 0,
    llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
    setByPlayer: false,
});

test('every stat input offers matching typed functions and preserves the selected reference without evaluating it', () => {
    const { stage, configuration } = fixture();
    configuration.functions = FUNCTION_RETURN_TYPES.map(returnType => ({
        id: returnType, name: `${returnType} function`, description: '', returnType, script: 'throw new Error("Do not evaluate while editing");',
    }));
    for (const returnType of FUNCTION_RETURN_TYPES) {
        if (returnType === 'void') continue;
        const html = renderToStaticMarkup(<StatValueInput stat={valueStat(returnType)} value={functionReference(returnType)} onChange={() => {}} stage={stage} />);
        assert.match(html, /aria-label="Value source"/, returnType);
        assert.ok(html.includes(`value="function:${returnType}" selected=""`), returnType);
        assert.doesNotMatch(html, /value="function:void"/);
        assert.equal((html.match(/selected=""/g) || []).length, 1, returnType);
    }
});

test('content pickers show named scalar and list functions, and identify incompatible selections', () => {
    const { stage, configuration } = fixture();
    configuration.functions = [
        { id: 'destination', name: 'Destination', description: '', returnType: 'location', script: 'return "place";' },
        { id: 'destinations', name: 'Destinations', description: '', returnType: 'locationList', script: 'return ["place"];' },
        { id: 'actor', name: 'Actor', description: '', returnType: 'actor', script: 'return "a";' },
    ];
    const scalar = renderToStaticMarkup(<LocationSelect value={functionReference('destination')} onChange={() => {}} locations={[]} stage={stage} />);
    assert.match(scalar, /Destination\(\)/);
    assert.doesNotMatch(scalar, /Unknown location/);
    const list = renderToStaticMarkup(<ReferenceMultiSelect kind="location" values={['place', functionReference('destination'), functionReference('destinations')]}
        onChange={() => {}} locations={[{ id: 'place', name: 'Town' }]} stage={stage} />);
    assert.match(list, /Destination\(\)/);
    assert.match(list, /Destinations\(\)/);
    assert.match(list, /Town/);
    const incompatible = renderToStaticMarkup(<LocationSelect value={functionReference('actor')} onChange={() => {}} locations={[]} stage={stage} />);
    assert.match(incompatible, /Missing or incompatible function/);
});

test('text functions drive control label icons and are not evaluated for picker previews', () => {
    const { stage, configuration } = fixture();
    const fn: GameFunction = { id: 'icon', name: 'Dynamic icon', description: '', returnType: 'text', script: 'return "favorite";' };
    configuration.functions = [fn];
    assert.equal(resolveIcon(functionReference('icon'), stage), resolveIcon('favorite'));
    const control = new Control({ type: 'button', label: 'Dynamic label', iconName: functionReference('icon') });
    const html = renderToStaticMarkup(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />);
    assert.match(html, /Dynamic label/);
    assert.match(html, /FavoriteBorderIcon/);
    fn.script = 'throw new Error("No preview evaluation");';
    assert.doesNotThrow(() => renderToStaticMarkup(<IconPicker value={functionReference('icon')} onChange={() => {}} stage={stage} />));
});

test('stat controls display evaluated values while editors keep their function bindings', () => {
    const { stage, configuration } = fixture();
    const stat = valueStat('number');
    configuration.globalStats = [stat];
    configuration.globalStatValues = { number: functionReference('value') };
    configuration.functions = [{ id: 'value', name: 'Dynamic score', description: '', returnType: 'number', script: 'return 7;' }];
    const display = renderToStaticMarkup(<ControlRenderer control={new Control({ type: 'statDisplay', statId: stat.id })}
        stage={() => stage} onActivate={() => {}} />);
    assert.match(display, />7</);
    const editor = renderToStaticMarkup(<ControlRenderer control={new Control({ type: 'statEditor', statId: stat.id })}
        stage={() => stage} onActivate={() => {}} />);
    assert.match(editor, /value="function:value" selected=""/);
    assert.match(editor, /Dynamic score\(\)/);
    assert.equal(configuration.globalStatValues.number, functionReference('value'));
    configuration.functions[0].script = 'throw new Error("An editor must not snapshot the value");';
    assert.doesNotThrow(() => renderToStaticMarkup(<ControlRenderer control={new Control({ type: 'statEditor', statId: stat.id })}
        stage={() => stage} onActivate={() => {}} />));
});

test('list stat editors retain function entries rather than substituting evaluated IDs', () => {
    const { stage, configuration } = fixture();
    const stat = valueStat('actorList');
    configuration.globalStats = [stat];
    configuration.globalStatValues = { actorList: ['literal', functionReference('member')] };
    configuration.functions = [{ id: 'member', name: 'Dynamic member', description: '', returnType: 'actor', script: 'return "a";' }];
    const html = renderToStaticMarkup(<ControlRenderer control={new Control({ type: 'statEditor', statId: stat.id, contentListDisplay: 'abbreviated' })}
        stage={() => stage} onActivate={() => {}} />);
    assert.match(html, /Dynamic member\(\)/);
    assert.deepEqual(configuration.globalStatValues.actorList, ['literal', functionReference('member')]);
});
