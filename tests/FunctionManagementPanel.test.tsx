import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidElement } from 'react';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Control } from '../src/content/Control';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { FunctionEditor } from '../src/components/FunctionEditor';
import { renderStatTypeOptions } from '../src/components/StatEntryEditor';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';
import { FunctionManagementPanel } from '../src/screens/FunctionManagementPanel';
import { GlobalStatManagementPanel } from '../src/screens/GlobalStatManagementPanel';
import { FunctionDetailPanel, FUNCTION_RETURN_TYPE_LABELS } from '../src/screens/FunctionDetailPanel';
import { SkitActionInput, StatUpdateRuleEditor } from '../src/components/StatUpdateRuleEditor';
import { StatValueInput } from '../src/components/StatValueInput';
import { LocationSelect, ReferenceMultiSelect } from '../src/components/UiComponents';
import { IconPicker, resolveIcon } from '../src/components/StatRating';
import { cloneStat, StatType } from '../src/content/Stat';
import { functionReference, FUNCTION_RETURN_TYPES, GameFunction } from '../src/content/Function';
import { ControlRenderer } from '../src/components/ControlRenderer';
import { ConditionEditor } from '../src/components/ConditionEditor';
import { OutcomeEditor } from '../src/components/OutcomeEditor';
import { Map as GameMap } from '../src/content/Map';
import { MapDetailPanel } from '../src/screens/MapDetailPanel';
import { DefinedMapView } from '../src/screens/DefinedMapView';
import { TooltipProvider } from '../src/components/TooltipContext';
import { Location } from '../src/content/Location';
import { globalStatReference } from '../src/content/Function';
import { Skit } from '../src/content/Skit';

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

test('shared outcomes expose stat, function and skit actions with context-specific timing', () => {
    const { stage } = fixture();
    const context = { stage, globalStats: [], actorStats: [], actors: [], locations: [] };
    const actions = [
        { id: 'stat', targetType: 'global' as const, targetId: 'any', statId: '', operation: 'adjust' as const, value: 0 },
        { id: 'fn', kind: 'function' as const, functionId: 'reward' },
        { id: 'skit', kind: 'skit' as const, locationId: '', actorIds: [] },
    ];
    const html = renderToStaticMarkup(<OutcomeEditor {...context} actions={actions} onChange={() => {}} />);
    assert.match(html, /Update a stat/);
    assert.match(html, /Invoke a function/);
    assert.match(html, /Start a skit/);
    assert.match(html, /Reward player/);
    assert.match(html, /Participants/);
    assert.match(html, /Guidance \(optional\)/);
    assert.match(html, /Starts after all stat and function actions finish/);
    const eventHtml = renderToStaticMarkup(<OutcomeEditor {...context} actions={actions} onChange={() => {}} skitTiming="afterPeriod" />);
    assert.match(eventHtml, /Starts after all post-skit actions finish, ahead of mandatory events/);
    const control = new Control({ actions });
    const controlHtml = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
    assert.match(controlHtml, /Start a skit/);
    assert.match(controlHtml, /Participants/);
    assert.match(controlHtml, /Starts after all stat and function actions finish/);
});

test('control clicks forward the newly started skit to their screen callback', () => {
    const { stage } = fixture();
    stage.getSave().atlas.place = new Location({ id: 'place', name: 'Town' });
    stage.getSave().currentDate = '2026-10-19';
    stage.saveGame = () => {};
    const control = new Control({ actions: [{ id: 'skit', kind: 'skit', locationId: 'place', actorIds: [] }] });
    let started: Skit | null | undefined;
    const button = ControlRenderer({ control, stage: () => stage, onActivate: skit => { started = skit; } });
    assert.ok(isValidElement<{ onClick: () => void }>(button));
    button.props.onClick();
    assert.ok(started);
    assert.equal(started, stage.getSave().timeline[0].skit);
});

test('maps can offer action buttons even without another map or location', () => {
    const { stage } = fixture();
    const map = new GameMap({ links: [{
        type: 'button', parentId: '', childId: '', name: 'Rest', iconName: 'hotel', coordinates: { x: .5, y: .5 }, actions: [],
    }] });
    const html = renderToStaticMarkup(<MapDetailPanel map={map} stage={() => stage} isCreatorMode onChange={() => {}} onDeactivate={() => {}} />);
    assert.match(html, /Add Button/);
    assert.match(html, /Drag Rest marker/);
    assert.match(html, /data-testid="HotelIcon"/);
    assert.doesNotMatch(html, /Drag Missing target marker/);
});

test('defined maps show named action icons, fallback icons, disabled conditions and resolved content portraits', () => {
    const { stage, configuration } = fixture();
    configuration.useEvents = false;
    configuration.globalStats = [cloneStat({ id: 'places', name: 'Places', type: 'locationList', default: ['place'] })];
    stage.getSave().atlas.place = new Location({ id: 'place', name: 'Town' });
    const map = new GameMap({ id: 'map', name: 'World', links: [
        { type: 'button', parentId: 'map', childId: 'function:missing', name: 'Rest', iconName: 'hotel', coordinates: { x: .5, y: .5 },
            contentList: { kind: 'location', values: [globalStatReference('places')] } },
        { type: 'button', parentId: 'map', childId: '', name: 'Unavailable', coordinates: { x: .3, y: .3 },
            conditionCollections: [[{ type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'night' }]] },
    ] });
    const render = () => renderToStaticMarkup(<TooltipProvider><DefinedMapView stage={() => stage} maps={[map]} setScreenType={() => {}} isVerticalLayout={false} /></TooltipProvider>);
    const html = render();
    assert.match(html, /aria-label="Rest"/);
    assert.match(html, /data-testid="HotelIcon"/);
    assert.match(html, /data-testid="TouchAppIcon"/);
    assert.match(html, /aria-label="Unavailable" disabled=""/);
    assert.match(html, /aria-label="Rest contents"/);
    assert.match(html, /aria-label="Town"/);
    assert.doesNotMatch(html, /data-testid="ArrowOutwardIcon"|data-testid="PlayArrowIcon"/);
    stage.getSave().globalStatValues!.places = [];
    assert.doesNotMatch(render(), /aria-label="Rest contents"/);
});

test('function management shows a return-type sidebar and a selection prompt instead of inline editors', () => {
    const { stage } = fixture();
    const html = renderToStaticMarkup(<FunctionManagementPanel stage={() => stage} />);
    assert.match(html, /Reward player/);
    assert.match(html, /Void \(action only\) \(1\)/);
    assert.match(html, /Location \(0\)/);
    assert.match(html, /Select a function to view and edit details/);
    assert.match(html, /aria-pressed="false"/);
    assert.doesNotMatch(html, /aria-label="Delete function"|<textarea/);
});

test('function management shows an empty state without definitions', () => {
    const { stage, configuration } = fixture();
    configuration.functions = [];
    const html = renderToStaticMarkup(<FunctionManagementPanel stage={() => stage} />);
    assert.match(html, /No functions defined/);
});

test('sidebar groups each function under its declared return type, including list types', () => {
    const { stage, configuration } = fixture();
    configuration.functions = FUNCTION_RETURN_TYPES.map(returnType => ({
        id: returnType, name: `${returnType} example`, description: '', script: '', returnType,
    }));
    const html = renderToStaticMarkup(<FunctionManagementPanel stage={() => stage} />);
    let previousEntryIndex = -1;
    for (const type of FUNCTION_RETURN_TYPES) {
        const titleIndex = html.indexOf(`${FUNCTION_RETURN_TYPE_LABELS[type]} (1)`);
        const entryIndex = html.indexOf(`${type} example`);
        assert.ok(titleIndex > previousEntryIndex, `${type} category follows the previous category`);
        assert.ok(entryIndex > titleIndex, `${type} function is inside its category`);
        previousEntryIndex = entryIndex;
    }
    assert.equal((html.match(/aria-pressed="false"/g) || []).length, FUNCTION_RETURN_TYPES.length);
});

test('selected function details include all editable fields, script testing, reorder and delete controls', () => {
    const { stage, configuration } = fixture();
    const html = renderToStaticMarkup(<FunctionDetailPanel fn={configuration.functions[0]} functions={configuration.functions} stage={stage}
        onChange={() => {}} onMove={() => {}} onDelete={() => {}} />);
    assert.match(html, /Function: Reward player/);
    assert.match(html, /value="Reward player"/);
    assert.match(html, /Return Type/);
    assert.match(html, /value="void" selected=""/);
    assert.match(html, /Give gold/);
    assert.match(html, /set\(&quot;Gold&quot;, 10\);/);
    assert.match(html, /\{\{Function name\}\}/);
    assert.match(html, /Each occurrence is evaluated read-only/);
    assert.match(html, /Test/);
    assert.match(html, /<button(?=[^>]*aria-label="Move function up")(?=[^>]*disabled="")[^>]*>/);
    assert.match(html, /<button(?=[^>]*aria-label="Move function down")(?=[^>]*disabled="")[^>]*>/);
    assert.match(html, /aria-label="Delete function"/);
    for (const type of FUNCTION_RETURN_TYPES) assert.ok(html.includes(`value="${type}"`));
});

test('details show the current function only and preserve reorder availability', () => {
    const { stage, configuration } = fixture();
    const fn: GameFunction = { id: 'destination', name: 'Destination', description: 'Choose a place', script: 'return "place";', returnType: 'location' };
    configuration.functions.push(fn);
    const html = renderToStaticMarkup(<FunctionDetailPanel fn={fn} functions={configuration.functions} stage={stage}
        onChange={() => {}} onMove={() => {}} onDelete={() => {}} />);
    assert.match(html, /Function: Destination/);
    assert.match(html, /value="location" selected=""/);
    assert.match(html, /Choose a place/);
    assert.doesNotMatch(html, /Reward player|Give gold/);
    assert.doesNotMatch(html, /<button(?=[^>]*aria-label="Move function up")(?=[^>]*disabled="")[^>]*>/);
    assert.match(html, /<button(?=[^>]*aria-label="Move function down")(?=[^>]*disabled="")[^>]*>/);
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

test('recurring rule summaries identify skit actions, and actions can be added without stat definitions', () => {
    const { stage } = fixture();
    const html = renderToStaticMarkup(<StatUpdateRuleEditor stage={stage} globalStats={[]} actorStats={[]} actors={[]} locations={[]}
        rules={[{ id: 'rule', conditions: [], updates: [{ id: 'action', kind: 'skit', locationId: 'place', actorIds: [] }] }]} onChange={() => {}} />);
    assert.match(html, /Start a skit/);
    assert.doesNotMatch(html, /Unassigned stat/);
    const addRule = renderToStaticMarkup(<StatUpdateRuleEditor stage={stage} globalStats={[]} actorStats={[]} actors={[]} locations={[]}
        rules={[]} onChange={() => {}} />);
    assert.match(addRule, /Add stat update event/);
    assert.doesNotMatch(addRule, /disabled/);
});

test('skit inputs use function-aware pickers and a plain guidance field without source dropdowns', () => {
    const { stage, configuration } = fixture();
    for (const type of ['location', 'actorList', 'text'] as const) {
        configuration.functions = [{
            id: 'source', name: 'Typed source', description: '', returnType: type,
            script: 'throw new Error("Do not evaluate while editing");',
        }];
        const props = {
            type, label: type, stage,
            globalStats: [valueStat(type), valueStat('number')],
            actorStats: [valueStat(type)], locationStats: [valueStat(type)], itemStats: [valueStat(type)],
            actors: [{ id: 'actor', name: 'Actor' }], locations: [{ id: 'place', name: 'Place' }], items: [{ id: 'item', name: 'Item' }],
            onChange: () => {},
        };
        const literal = renderToStaticMarkup(<SkitActionInput {...props} value={functionReference('source')} />);
        assert.doesNotMatch(literal, /<select/);
        if (type === 'text') {
            assert.match(literal, /<input[^>]*value="function:source"/);
            const guidance = renderToStaticMarkup(<SkitActionInput {...props} value="Typed source" />);
            assert.match(guidance, /<input[^>]*value="Typed source"/);
            const blank = renderToStaticMarkup(<SkitActionInput {...props} value="" />);
            assert.match(blank, /<input[^>]*value=""/);
        } else {
            assert.match(literal, /Typed source\(\)/);
        }
        for (const targetType of ['global', 'actor', 'location', 'item'] as const) {
            const html = renderToStaticMarkup(<SkitActionInput {...props} value={{ targetType, targetId: targetType === 'actor' ? 'actor' : targetType === 'location' ? 'place' : 'item', statId: type }} />);
            assert.match(html, /Existing stat binding:/);
            assert.match(html, /Replace/);
            assert.doesNotMatch(html, /<select|<input/);
        }
        const missing = renderToStaticMarkup(<SkitActionInput {...props} value={{ targetType: 'global', targetId: '', statId: 'missing' }} />);
        assert.match(missing, /missing or incompatible stat/);
    }
});

test('skit pickers retain literal locations and mixed actor/function lists without source dropdowns', () => {
    const { stage, configuration } = fixture();
    configuration.functions = [
        { id: 'cast', name: 'Cast', description: '', returnType: 'actorList', script: 'throw new Error("No preview");' },
        { id: 'guest', name: 'Guest', description: '', returnType: 'actor', script: 'throw new Error("No preview");' },
    ];
    const props = {
        stage, globalStats: [], actorStats: [],
        actors: [{ id: 'actor', name: 'Alice' }], locations: [{ id: 'place', name: 'Town' }],
        onChange: () => {},
    };
    const location = renderToStaticMarkup(<SkitActionInput {...props} type="location" label="Location" value="place" />);
    assert.match(location, /Town/);
    assert.doesNotMatch(location, /<select/);
    const actors = renderToStaticMarkup(<SkitActionInput {...props} type="actorList" label="Participants"
        value={['actor', functionReference('cast'), functionReference('guest')]} />);
    assert.match(actors, /Alice/);
    assert.match(actors, /Cast\(\)/);
    assert.match(actors, /Guest\(\)/);
    assert.doesNotMatch(actors, /<select/);
});

const valueStat = (type: StatType) => cloneStat({
    id: type, name: type, type, guidance: '', default: 0,
    llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
});

test('every stat input uses a single input or picker and preserves references without evaluating them', () => {
    const { stage, configuration } = fixture();
    configuration.functions = FUNCTION_RETURN_TYPES.map(returnType => ({
        id: returnType, name: `${returnType} function`, description: '', returnType, script: 'throw new Error("Do not evaluate while editing");',
    }));
    for (const returnType of FUNCTION_RETURN_TYPES) {
        if (returnType === 'void') continue;
        const html = renderToStaticMarkup(<StatValueInput stat={valueStat(returnType)} value={functionReference(returnType)} onChange={() => {}} stage={stage} />);
        assert.doesNotMatch(html, /aria-label="Value source"|<select/, returnType);
        if (returnType === 'number' || returnType === 'text') {
            assert.ok(html.includes(`value="function:${returnType}"`), returnType);
            assert.doesNotMatch(html, /type="number"/);
        } else {
            assert.match(html, new RegExp(`${returnType} function\\(\\)`), returnType);
        }
    }
});

test('list stat values use their picker for function selection instead of a separate source selector', () => {
    const { stage, configuration } = fixture();
    configuration.functions = [
        { id: 'members', name: 'Members', description: '', returnType: 'actorList', script: 'return ["a"];' },
        { id: 'options', name: 'Options', description: '', returnType: 'optionList', script: 'return ["first"];' },
    ];

    const actorList = renderToStaticMarkup(<StatValueInput stat={valueStat('actorList')} value={functionReference('members')} onChange={() => {}} stage={stage} />);
    assert.doesNotMatch(actorList, /aria-label="Value source"/);
    assert.match(actorList, /aria-label="Selected options: Members\(\)"/);

    const optionList = renderToStaticMarkup(<StatValueInput stat={valueStat('optionList')} value={functionReference('options')} onChange={() => {}} stage={stage} />);
    assert.doesNotMatch(optionList, /aria-label="Value source"/);
    assert.match(optionList, /aria-label="Selected options: Options\(\)"/);
});

test('checkbox and option inputs combine literals and sources in one picker', () => {
    const { stage, configuration } = fixture();
    configuration.globalStats = [valueStat('checkbox'), valueStat('option')];
    configuration.functions = [
        { id: 'choice', name: 'Choice', description: '', returnType: 'option', script: 'throw new Error("No preview");' },
    ];
    const yes = renderToStaticMarkup(<StatValueInput stat={valueStat('checkbox')} value={true} onChange={() => {}} stage={stage} />);
    const no = renderToStaticMarkup(<StatValueInput stat={valueStat('checkbox')} value={false} onChange={() => {}} stage={stage} />);
    assert.match(yes, />True</);
    assert.match(no, />False</);
    assert.doesNotMatch(yes, /<select|type="checkbox"|Value source/);
    const sourced = renderToStaticMarkup(<StatValueInput stat={valueStat('checkbox')} value="globalStat:checkbox" onChange={() => {}} stage={stage} />);
    assert.match(sourced, />checkbox</);
    const choice = renderToStaticMarkup(<StatValueInput stat={valueStat('option')} value="function:choice" onChange={() => {}} stage={stage} />);
    assert.match(choice, /Choice\(\)/);
    assert.doesNotMatch(choice, /<select|Value source/);
    const missing = renderToStaticMarkup(<StatValueInput stat={valueStat('option')} value="function:missing" onChange={() => {}} stage={stage} />);
    assert.match(missing, /Missing or incompatible function/);
});

test('numeric and text formula inputs retain formulas without evaluating them on render', () => {
    const { stage, configuration } = fixture();
    configuration.functions = [
        { id: 'score', name: 'Score', description: '', returnType: 'number', script: 'throw new Error("No preview");' },
    ];
    for (const type of ['number', 'text'] as const) {
        const formula = type === 'number' ? 'Score() * 2 + get("Bonus")' : '{{Greeting}}, world';
        const html = renderToStaticMarkup(<StatValueInput stat={valueStat(type)} value={formula} onChange={() => {}} stage={stage} />);
        assert.match(html, /<input/);
        assert.doesNotMatch(html, /<select|Value source|type="number"/);
        assert.ok(html.includes(type === 'number' ? 'Score() * 2 + get(&quot;Bonus&quot;)' : '{{Greeting}}, world'));
    }
});

test('global stat management and conditions use the shared formula input', () => {
    const { stage, configuration } = fixture();
    configuration.globalStats = [valueStat('number')];
    configuration.globalStatValues = { number: 'Score() * 2' };
    configuration.functions = [
        { id: 'score', name: 'Score', description: '', returnType: 'number', script: 'throw new Error("No editor evaluation");' },
    ];
    const globalPanel = renderToStaticMarkup(<GlobalStatManagementPanel stage={() => stage} />);
    assert.match(globalPanel, /value="Score\(\) \* 2"/);
    assert.doesNotMatch(globalPanel, /Value source|type="number"/);
    const conditions = renderToStaticMarkup(<ConditionEditor globalStats={configuration.globalStats} stage={stage}
        conditionCollections={[[
            { type: 'globalStat', statId: 'number', comparison: 'equals', value: 'Score() + 1' },
            { type: 'calendar', field: 'day', comparison: 'equals', value: 'Score() + 2' },
        ]]} onChange={() => {}} />);
    assert.match(conditions, /value="Score\(\) \+ 1"/);
    assert.match(conditions, /value="Score\(\) \+ 2"/);
    assert.doesNotMatch(conditions, /Value source/);
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
    assert.match(editor, /value="function:value"/);
    assert.doesNotMatch(editor, /aria-label="Value source"/);
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
