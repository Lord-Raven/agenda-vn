import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPortableGameConfiguration, GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Actor, resolveActorSchedule, resolveInitialActorStatValue } from '../src/content/Actor';
import { Item } from '../src/content/Item';
import { Location } from '../src/content/Location';
import { buildInitialGlobalStatValues, cloneGameAction, cloneStat, cloneStatUpdateRules, normalizeStatValue, resolveAvailableStatOptions, Stat, StatType, StatValue } from '../src/content/Stat';
import { cloneGameFunction, functionPickerOptions, functionReference, GameFunction } from '../src/content/Function';
import { evaluateCondition } from '../src/content/Condition';
import { CalendarEvent } from '../src/content/CalendarEvent';
import { Control } from '../src/content/Control';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';

const stat = (name: string, type: StatType, extra: Partial<Stat> = {}): Stat => cloneStat({
    id: name, name, type, description: '', guidance: '', default: [],
    llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    setByPlayer: false, ...extra,
});

const fixture = () => {
    const stats = [
        stat('Party', 'actorList'),
        stat('Inventory', 'itemList'),
        stat('Places', 'locationList', { default: ['place'] }),
        stat('Choices', 'optionList', { options: [
            { id: 'first', name: 'First', description: 'First description' },
            { name: 'Second', description: 'Second description' },
        ] }),
        stat('Empty', 'actorList'),
        stat('Score', 'number', { default: 1, min: 0, max: 10 }),
    ];
    const values = {
        Party: ['b', 'deleted', 'missing', 'a'],
        Inventory: ['item', 'missing'],
        Choices: ['second-2', 'first'],
        Score: 2,
    };
    const actors = [
        new Actor({ id: 'a', name: 'Same name', role: 'Leader', statMap: { ...values } }),
        new Actor({ id: 'b', name: 'Same name', role: 'Friend', statMap: { ...values } }),
        new Actor({ id: 'deleted', name: 'Deleted', active: false }),
    ];
    const item = new Item({ id: 'item', name: 'Sword', description: 'Sharp', statMap: { ...values } });
    const location = new Location({ id: 'place', name: 'Town', description: 'Busy', statMap: { ...values } });
    const save: SaveType = {
        playerId: 'a', actors: Object.fromEntries(actors.map(actor => [actor.id, actor])),
        atlas: { place: location }, inventory: [item], maps: [], universalSchedule: {},
        timeline: [], timestamp: 0, globalStatValues: { ...values },
    };
    const configuration: GameConfiguration = {
        actors, items: [item], locations: [location], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: stats, itemStats: stats,
        locationStats: stats, globalStats: stats, globalStatValues: {}, statUpdateRules: [],
        functions: [],
        controls: [], uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-08',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    return { stage, save, configuration };
};

const gameFunction = (script: string): GameFunction => ({
    id: 'test-function', name: 'Test function', description: '', script, returnType: 'void',
});

test('global content lists resolve IDs in order, skip missing/inactive entries, and preserve get()', () => {
    const { stage } = fixture();
    const result = stage.testFunction(gameFunction(`
        return {
            ids: get('Party'),
            party: getObjects(' party ').map(a => [a.id, a.name, a.kind, a.getField('role')]),
            items: getObjects('Inventory').map(i => [i.id, i.getField('description')]),
            places: getObjects('Places').map(l => [l.id, l.getField('description')]),
            empty: getObjects('Empty')
        };
    `));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.value, {
        ids: ['b', 'deleted', 'missing', 'a'],
        party: [['b', 'Same name', 'actor', 'Friend'], ['a', 'Same name', 'actor', 'Leader']],
        items: [['item', 'Sharp']], places: [['place', 'Busy']], empty: [],
    });
});

test('option lists return selected option copies with canonical IDs and properties', () => {
    const { stage, configuration } = fixture();
    const result = stage.testFunction(gameFunction(`
        const options = getObjects('Choices');
        const original = options.map(o => ({...o}));
        options[0].description = 'Changed';
        return [get('Choices'), original, getObjects('Choices')[0].description];
    `));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.value, [
        ['second-2', 'first'],
        [
            { id: 'second-2', name: 'Second', description: 'Second description' },
            { id: 'first', name: 'First', description: 'First description' },
        ],
        'Second description',
    ]);
    assert.equal(configuration.globalStats[3].options?.[1].description, 'Second description');
});

test('global functions resolve each entity kind through named and nested accessors', () => {
    const { stage } = fixture();
    const result = stage.testFunction(gameFunction(`
            return [
                getActor('Same name').getObjects('Party').map(a => a.id),
                getItem('Sword').getObjects('Inventory')[0].getObjects('Places')[0].name,
                getLocation('Town').getObjects('Choices').map(o => o.description),
                getActor('Same name').getObjects('Inventory')[0].id,
                getItem('Sword').getObjects('Party')[0].id,
                getLocation('Town').getObjects('Inventory')[0].id,
                actors()[0].getObjects('Party')[0].id,
                items()[0].getObjects('Party')[0].id,
                locations()[0].getObjects('Party')[0].id
            ];
    `));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.value, [
        ['b', 'a'], 'Town', ['Second description', 'First description'],
        'item', 'b', 'item', 'b', 'b', 'b',
    ]);
});

test('resolved content writes use normalization and tests do not mutate the real save', () => {
    const { stage, save } = fixture();
    const result = stage.testFunction(gameFunction(`
        const actor = getObjects('Party')[0];
        actor.set('Score', 100);
        actor.setField('role', 'Trusted');
        set('Party', ['a']);
        actor.set('Party', ['a']);
        return [actor.get('Score'), actor.getField('role'), getObjects('Party')[0].id,
            actor.getObjects('Party')[0].id];
    `));
    assert.deepEqual(result, { value: [10, 'Trusted', 'a', 'a'], errors: [] });
    assert.equal(save.actors.b.statMap.Score, 2);
    assert.equal(save.actors.b.role, 'Friend');
    assert.deepEqual(save.globalStatValues?.Party, ['b', 'deleted', 'missing', 'a']);
});

test('nested function calls receive the object resolver', () => {
    const { stage, configuration } = fixture();
    configuration.functions.push({
        id: 'nested', name: 'Nested', description: '',
        script: 'return getObjects("Inventory")[0].getField("description");', returnType: 'void',
    });
    assert.deepEqual(stage.testFunction(gameFunction('return call(" nested ");')), {
        value: 'Sharp', errors: [],
    });
});

test('unknown and non-list stats report explicit errors through global and entity accessors', () => {
    const { stage } = fixture();
    for (const scope of ['', 'getActor("Same name").']) {
        for (const name of ['Unknown', 'Score']) {
            const result = stage.testFunction(gameFunction(`return ${scope}getObjects('${name}');`));
            assert.equal(result.value, undefined);
            assert.equal(result.errors.length, 1);
            assert.match(result.errors[0], /requires an option list or content list stat/);
        }
    }
});

test('function cloning and portable JSON keep definitions separate from stats', () => {
    const { configuration } = fixture();
    const fn = { ...gameFunction('return 42;'), description: 'Answer' };
    configuration.functions.push(fn);
    const portable = buildPortableGameConfiguration(configuration);
    assert.deepEqual(portable.functions, [fn]);
    assert.notEqual(portable.functions?.[0], fn);
    assert.deepEqual(JSON.parse(JSON.stringify(portable)).functions, [fn]);
    assert.equal(portable.globalStats.some(stat => stat.id === fn.id), false);
    assert.deepEqual(Object.keys(cloneGameFunction(fn)), ['id', 'name', 'description', 'script', 'returnType']);
});

test('function actions clone with only a function reference and survive rules and controls', () => {
    const invocation = { id: 'invoke', kind: 'function', functionId: 'test-function' } as const;
    assert.deepEqual(cloneGameAction({ ...invocation, statId: 'unused', targetType: 'actor' }), invocation);
    const rules = cloneStatUpdateRules([{ id: 'rule', conditions: [], updates: [invocation] }]);
    assert.deepEqual(rules[0].updates, [invocation]);
    assert.deepEqual(new Control(JSON.parse(JSON.stringify({ actions: [invocation] }))).actions, [invocation]);
});

test('button actions execute global functions once, retain stat writes, and save', () => {
    const { stage, save, configuration } = fixture();
    configuration.functions = [gameFunction('set("Score", get("Score") + 1); getActor("Same name").set("Score", 9);')];
    let saves = 0;
    stage.saveGame = () => { saves++; };
    stage.runControlActions(new Control({ actions: [
        { id: 'invoke', kind: 'function', functionId: 'test-function' },
        { id: 'write', kind: 'stat', targetType: 'global', targetId: 'any', statId: 'Score', operation: 'adjust', value: 2 },
    ] }));
    assert.equal(save.globalStatValues?.Score, 5);
    assert.equal(save.actors.a.statMap.Score, 9);
    assert.equal(saves, 1);
});

test('unsaved functions can call other drafts without mutating configuration or state', () => {
    const { stage, configuration, save } = fixture();
    const fn = gameFunction('return call("Draft");');
    const draft = { ...gameFunction('set("Score", 9); return get("Score");'), id: 'draft', name: 'Draft' };
    assert.deepEqual(stage.testFunction(fn, [fn, draft]), { value: 9, errors: [] });
    assert.deepEqual(configuration.functions, []);
    assert.equal(save.globalStatValues?.Score, 2);
});

test('syntax, runtime, unknown function, and recursive calls report errors', () => {
    const { stage } = fixture();
    for (const script of ['return (;', 'throw new Error("Broken");', 'call("Missing");', 'call("Test function");']) {
        const result = stage.testFunction(gameFunction(script));
        assert.equal(result.errors.length, 1);
    }
    assert.match(stage.testFunction(gameFunction('call("Missing");')).errors[0], /Unknown function/);
    assert.match(stage.testFunction(gameFunction('call("Test function");')).errors[0], /Maximum function invocation depth/);
    assert.deepEqual(stage.testFunction(gameFunction('return typeof target;')), { value: 'undefined', errors: [] });
});

test('recurring rules invoke a global function once for each matching time period', () => {
    const { stage, save, configuration } = fixture();
    save.currentDate = '2026-10-15';
    save.currentTimeOfDay = 'night';
    configuration.functions = [gameFunction('set("Score", get("Score") + 1);')];
    configuration.statUpdateRules = [{
        id: 'rule',
        conditions: [[{ type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'evening' }]],
        updates: [{ id: 'invoke', kind: 'function', functionId: 'test-function' }],
    }];
    stage['applyStatUpdateRules'](save, '2026-10-15', 'morning');
    assert.equal(save.globalStatValues?.Score, 3);
});

test('configuration updates retain functions independently of stat changes', () => {
    const { stage, configuration, save } = fixture();
    stage.saveData = { configuration, saves: [save], lastSaveSlot: 0 };
    const fn = gameFunction('return 42;');
    stage.updateConfiguration({ functions: [fn] });
    stage.updateConfiguration({ globalStats: configuration.globalStats });
    const stored = Stage.prototype.getConfiguration.call(stage);
    assert.deepEqual(stored.functions, [fn]);
    assert.equal(stored.globalStats.some(stat => stat.id === fn.id), false);
});

const typedFunction = (id: string, returnType: StatType, script: string): GameFunction => ({
    id, name: id, description: '', returnType, script,
});

test('every declared value type resolves its primitive or ID result and survives portable JSON', () => {
    const { stage, configuration } = fixture();
    const cases: [StatType, StatValue][] = [
        ['number', 7], ['text', 'A label'], ['checkbox', false], ['option', 'first'],
        ['actor', 'a'], ['item', 'item'], ['location', 'place'], ['optionList', ['first']],
        ['actorList', ['a', 'b']], ['itemList', ['item']], ['locationList', ['place']],
    ];
    for (const [type, value] of cases) {
        const fn = typedFunction(type, type, `return ${JSON.stringify(value)};`);
        configuration.functions.push(fn);
        assert.deepEqual(stage.resolveValue(functionReference(fn.id), type), value, type);
        const dynamicStat = stat(type, type, { default: functionReference(fn.id), options: [{ id: 'first', name: 'First', description: '' }] });
        assert.equal(normalizeStatValue(undefined, dynamicStat), functionReference(fn.id), type);
        assert.equal(cloneStat(dynamicStat).default, functionReference(fn.id), type);
        assert.deepEqual(stage.readStatValue(undefined, dynamicStat), value, type);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(buildPortableGameConfiguration(configuration))).functions, configuration.functions);
});

test('mixed lists expand scalar and list functions in order without changing their stored references', () => {
    const { stage, configuration } = fixture();
    configuration.functions = [
        typedFunction('one', 'actor', 'return "a";'),
        typedFunction('many', 'actorList', 'return ["b", "a"];'),
    ];
    const stored = ['literal', functionReference('one'), functionReference('many'), 'last'];
    assert.deepEqual(stage.resolveValue(stored, 'actorList'), ['literal', 'a', 'b', 'a', 'last']);
    assert.deepEqual(stored, ['literal', 'function:one', 'function:many', 'last']);
    assert.deepEqual(stage.resolveValue([], 'actorList'), []);
});

test('stat reads reevaluate against current state, including entity stats and object lists', () => {
    const { stage, save, configuration } = fixture();
    const score = configuration.globalStats.find(stat => stat.id === 'Score')!;
    configuration.functions = [
        typedFunction('score', 'number', 'return get("Choices").length;'),
        typedFunction('party', 'actorList', 'return get("Score") > 1 ? ["a"] : ["b"];'),
    ];
    save.globalStatValues!.Party = functionReference('party');
    save.actors.a.statMap.Score = functionReference('score');
    assert.deepEqual(stage.testFunction(gameFunction('return getObjects("Party").map(a => a.id);')).value, ['a']);
    assert.equal(stage.readStatValue(save.actors.a.statMap.Score, score), 2);
    save.globalStatValues!.Score = 1;
    save.globalStatValues!.Choices = ['first'];
    assert.deepEqual(stage.testFunction(gameFunction('return getObjects("Party").map(a => a.id);')).value, ['b']);
    assert.equal(stage.readStatValue(save.actors.a.statMap.Score, score), 1);
    assert.equal(save.globalStatValues!.Party, functionReference('party'));
    assert.equal(save.actors.a.statMap.Score, functionReference('score'));
});

test('read-only values reject writes through every accessor and nested call', () => {
    const { stage, save, configuration } = fixture();
    const writes = [
        'set("Score", 9);',
        'getActor("Same name").set("Score", 9);',
        'getLocation("Town").set("Score", 9);',
        'getItem("Sword").set("Score", 9);',
        'getActor("Same name").setField("name", "Changed");',
        'getLocation("Town").setField("description", "Changed");',
        'getItem("Sword").setField("description", "Changed");',
        'actors()[0].set("Score", 9);',
        'locations()[0].set("Score", 9);',
        'items()[0].set("Score", 9);',
        'getObjects("Party")[0].set("Score", 9);',
        'getActor("Same name").getObjects("Party")[0].setField("name", "Changed");',
        'call("writer");',
    ];
    configuration.functions = [{ ...gameFunction('set("Score", 9);'), id: 'writer', name: 'writer' }];
    const before = JSON.stringify(save);
    for (const write of writes) {
        const result = stage.testFunction(typedFunction('reader', 'number', `${write} return 3;`));
        assert.equal(result.errors.length, 1, write);
        assert.match(result.errors[0], /read-only/, write);
        assert.equal(JSON.stringify(save), before, write);
    }
    configuration.functions.push(typedFunction('value', 'number', 'set("Score", 9); return 3;'));
    assert.throws(() => stage.resolveValue(functionReference('value'), 'number'), /read-only/);
    assert.equal(JSON.stringify(save), before);
});

test('explicit actions can invoke typed functions with writes while reads cannot', () => {
    const { stage, save, configuration } = fixture();
    configuration.functions = [typedFunction('writer', 'number', 'set("Score", 8); return 8;')];
    stage.saveGame = () => {};
    stage.runControlActions(new Control({ actions: [{ id: 'invoke', kind: 'function', functionId: 'writer' }] }));
    assert.equal(save.globalStatValues!.Score, 8);
});

test('missing functions, mismatched types, invalid results, and cyclic stat reads fail explicitly', () => {
    const { stage, save, configuration } = fixture();
    assert.throws(() => stage.resolveValue(functionReference('missing'), 'location'), /Unknown function reference/);
    configuration.functions = [
        typedFunction('wrong-type', 'actor', 'return "a";'),
        typedFunction('invalid', 'number', 'return "3";'),
        typedFunction('object', 'location', 'return getLocation("Town");'),
        typedFunction('invalid-list', 'actorList', 'return ["a", 3];'),
        typedFunction('reference-result', 'actor', 'return "function:wrong-type";'),
        typedFunction('cycle', 'number', 'return get("Score");'),
        typedFunction('entity-cycle', 'number', 'return getActor("Same name").get("Score");'),
        typedFunction('list-cycle', 'actorList', 'return get("Party");'),
    ];
    assert.throws(() => stage.resolveValue(functionReference('wrong-type'), 'location'), /returns actor, not location/);
    for (const [id, type] of [['invalid', 'number'], ['object', 'location'], ['invalid-list', 'actorList'], ['reference-result', 'actor']] as const) {
        assert.throws(() => stage.resolveValue(functionReference(id), type), /Expected a .* function result/);
    }
    save.globalStatValues!.Score = functionReference('cycle');
    save.actors.a.statMap.Score = functionReference('entity-cycle');
    save.globalStatValues!.Party = ['a', functionReference('list-cycle')];
    for (const [id, type] of [['cycle', 'number'], ['entity-cycle', 'number'], ['list-cycle', 'actorList']] as const) {
        assert.throws(() => stage.resolveValue(functionReference(id), type), /cyclic function reference/);
    }
    for (const result of ['undefined', 'null', 'NaN', 'Infinity']) {
        assert.equal(stage.testFunction(typedFunction('bad', 'number', `return ${result};`)).errors.length, 1);
    }
    assert.equal(stage.testFunction(typedFunction('bad', 'number', 'throw new Error("Broken");')).errors.length, 1);
});

test('literal writes preserve references and adjustments resolve operands without evaluating unused defaults', () => {
    const { stage, configuration, save } = fixture();
    configuration.functions = [
        typedFunction('score', 'number', 'return 4;'),
        typedFunction('amount', 'number', 'return 2;'),
        typedFunction('option', 'option', 'return "first";'),
        typedFunction('options', 'optionList', 'return ["first"];'),
    ];
    const score = configuration.globalStats.find(stat => stat.id === 'Score')!;
    score.default = functionReference('missing-default');
    stage.saveGame = () => {};
    const update = (statId: string, operation: 'set' | 'adjust' | 'remove', value: StatValue) =>
        stage.runControlActions(new Control({ actions: [{ id: 'update', targetType: 'global', targetId: 'any', statId, operation, value }] }));
    update('Score', 'set', functionReference('score'));
    assert.equal(save.globalStatValues!.Score, functionReference('score'));
    update('Score', 'adjust', functionReference('amount'));
    assert.equal(save.globalStatValues!.Score, 6);
    update('Score', 'set', '1d1+2');
    assert.equal(save.globalStatValues!.Score, 3);
    update('Choices', 'set', functionReference('options'));
    assert.equal(save.globalStatValues!.Choices, functionReference('options'));
    update('Choices', 'remove', functionReference('option'));
    assert.deepEqual(save.globalStatValues!.Choices, []);
    update('Choices', 'adjust', [functionReference('option')]);
    assert.deepEqual(save.globalStatValues!.Choices, ['first']);
    update('Choices', 'adjust', functionReference('options'));
    assert.deepEqual(save.globalStatValues!.Choices, ['first']);
});

test('function-backed defaults survive initialization and literal values do not evaluate unused defaults', () => {
    const { stage, save } = fixture();
    for (const type of ['number', 'checkbox', 'locationList', 'optionList'] as const) {
        const dynamic = stat(type, type, { default: functionReference('missing') });
        assert.equal(buildInitialGlobalStatValues([dynamic])[type], functionReference('missing'));
        assert.equal(resolveInitialActorStatValue(dynamic, undefined, stage.getScheduleContext(save)), functionReference('missing'));
    }
    assert.equal(stage.readStatValue(3, stat('number', 'number', { default: functionReference('missing') })), 3);
});

test('initial value rules can read previously initialized function-backed globals', () => {
    const { stage, configuration, save } = fixture();
    configuration.functions = [typedFunction('value', 'number', 'return get("Base") + 1;')];
    configuration.globalStats = [
        stat('Base', 'number', { default: 4 }),
        stat('Dynamic', 'number', { default: functionReference('value') }),
        stat('Result', 'text', { default: 'miss', defaultValueRules: [{
            id: 'rule', value: 'match',
            conditions: [[{ type: 'globalStat', statId: 'Dynamic', comparison: 'equals', value: 5 }]],
        }] }),
    ];
    save.globalStatValues = {};
    const initialized = buildInitialGlobalStatValues(configuration.globalStats, {}, stage.getScheduleContext(save), save.globalStatValues);
    assert.equal(initialized.Result, 'match');
    assert.equal(initialized.Dynamic, functionReference('value'));
});

test('initial numeric modifiers resolve only matching function values', () => {
    const { stage, configuration, save } = fixture();
    configuration.functions = [typedFunction('amount', 'number', 'return 3;')];
    const score = configuration.globalStats.find(stat => stat.id === 'Score')!;
    const initial = {
        value: 2,
        modifiers: [
            { id: 'yes', amount: functionReference('amount'), conditions: [] },
            { id: 'no', amount: functionReference('missing'), conditions: [[{
                type: 'globalStat' as const, statId: 'Score', comparison: 'equals' as const, value: 99,
            }]] },
        ],
    };
    assert.equal(resolveInitialActorStatValue(score, initial, stage.getScheduleContext(save)), 5);
});

test('conditions resolve actual values, comparison values, identity, and content targets', () => {
    const { stage, configuration, save } = fixture();
    configuration.functions = [
        typedFunction('score', 'number', 'return 6;'), typedFunction('expected', 'number', 'return 6;'),
        typedFunction('actor', 'actor', 'return "a";'), typedFunction('day', 'number', 'return 8;'),
        typedFunction('weekday', 'text', 'return "thursday";'),
    ];
    save.globalStatValues!.Score = functionReference('score');
    save.actors.a.statMap.Score = functionReference('score');
    save.currentDate = '2026-10-08';
    const context = { ...stage.getScheduleContext(save), currentActor: save.actors.a };
    assert.equal(evaluateCondition({ type: 'globalStat', statId: 'Score', comparison: 'equals', value: functionReference('expected') }, context), true);
    assert.equal(evaluateCondition({ type: 'contentStat', contentType: 'actor', targetId: functionReference('actor'), statId: 'Score', comparison: 'equals', value: 6 }, context), true);
    assert.equal(evaluateCondition({ type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: functionReference('actor') }, context), true);
    assert.equal(evaluateCondition({ type: 'calendar', field: 'day', comparison: 'equals', value: functionReference('day') }, context), true);
    assert.equal(evaluateCondition({ type: 'calendar', field: 'dayOfWeek', comparison: 'equals', value: functionReference('weekday') }, context), true);
});

test('schedules resolve direct functions, scalar stats, and mixed list stats', () => {
    const { stage, save, configuration } = fixture();
    configuration.functions = [typedFunction('destination', 'location', 'return "place";')];
    const scalar = stat('destination', 'location', { default: functionReference('destination') });
    const list = stat('destinations', 'locationList', { default: [functionReference('destination')] });
    configuration.globalStats.push(scalar, list);
    for (const destination of [functionReference('destination'), 'globalStat:destination', 'globalStat:destinations']) {
        const actor = new Actor({ id: 'scheduled', name: 'Scheduled', schedule: { [destination]: [] } });
        assert.equal(resolveActorSchedule(actor, stage.getScheduleContext(save)), 'place', destination);
    }
});

test('calendar storage preserves references while event use resolves locations and mixed participants', () => {
    const { stage, save, configuration } = fixture();
    configuration.functions = [
        typedFunction('location', 'location', 'return "place";'),
        typedFunction('participant', 'actor', 'return "a";'),
        typedFunction('participants', 'actorList', 'return ["b"];'),
    ];
    const event: CalendarEvent = {
        id: 'event', name: 'Event', date: '2026-10-08', duration: ['morning'],
        locationId: functionReference('location'), actorIds: [functionReference('participant'), functionReference('participants')],
        description: 'Description', guidance: 'Guidance', mandatory: false,
    };
    const stored = stage['normalizeCalendarEventForSave'](event, save);
    assert.equal(stored.locationId, functionReference('location'));
    assert.deepEqual(stored.actorIds, event.actorIds);
    const resolved = stage.resolveCalendarEvent(stored);
    assert.equal(resolved.locationId, 'place');
    assert.deepEqual(resolved.actorIds, ['a', 'b']);
    assert.deepEqual(stored.actorIds, event.actorIds);
});

test('sourced option choices use evaluated active lists and pickers include only matching return types', () => {
    const { stage, configuration } = fixture();
    configuration.functions = [
        typedFunction('choices', 'optionList', 'return ["first"];'),
        typedFunction('place', 'location', 'return "place";'),
        { ...gameFunction(''), id: 'action' },
    ];
    const list = configuration.globalStats.find(stat => stat.id === 'Choices')!;
    const option = stat('selection', 'option', { optionSourceStatId: 'Choices' });
    const choices = resolveAvailableStatOptions(option, undefined, {
        sourceStats: [list], globalStatValues: { Choices: functionReference('choices') },
        resolveValue: (value, type) => stage.resolveValue(value, type),
    });
    assert.deepEqual(choices.map(option => option.id), ['first']);
    assert.deepEqual(functionPickerOptions(configuration.functions, 'location').map(option => option.key), [functionReference('place')]);
    assert.deepEqual(functionPickerOptions(configuration.functions, 'actor'), []);
});
