import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPortableGameConfiguration, GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Actor } from '../src/content/Actor';
import { Item } from '../src/content/Item';
import { Location } from '../src/content/Location';
import { cloneGameAction, cloneStat, cloneStatUpdateRules, Stat, StatType } from '../src/content/Stat';
import { cloneGameFunction, GameFunction } from '../src/content/Function';
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
    id: 'test-function', name: 'Test function', description: '', script,
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
        script: 'return getObjects("Inventory")[0].getField("description");',
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
    assert.deepEqual(Object.keys(cloneGameFunction(fn)), ['id', 'name', 'description', 'script']);
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
