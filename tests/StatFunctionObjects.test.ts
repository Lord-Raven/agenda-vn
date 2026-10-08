import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Actor } from '../src/content/Actor';
import { Item } from '../src/content/Item';
import { Location } from '../src/content/Location';
import { cloneStat, Stat, StatType } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';

const stat = (name: string, type: StatType, extra: Partial<Stat> = {}): Stat => cloneStat({
    id: name, name, type, description: '', guidance: '', default: [],
    llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    exposed: { value: false, conditions: [] }, setByPlayer: false, ...extra,
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

const scriptStat = (script: string) => stat('Test function', 'function', { script });

test('global content lists resolve IDs in order, skip missing/inactive entries, and preserve get()', () => {
    const { stage } = fixture();
    const result = stage.testFunctionStat(scriptStat(`
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
    const result = stage.testFunctionStat(scriptStat(`
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

test('every target kind resolves its own lists, including nested entity accessors', () => {
    const { stage } = fixture();
    for (const [kind, id] of [['actor', 'a'], ['item', 'item'], ['location', 'place']] as const) {
        const result = stage.testFunctionStat(scriptStat(`
            return [
                target.getObjects('Party').map(a => a.id),
                target.getObjects('Inventory')[0].getObjects('Places')[0].name,
                target.getObjects('Choices').map(o => o.description),
                getActor('Same name').getObjects('Inventory')[0].id,
                getItem('Sword').getObjects('Party')[0].id,
                getLocation('Town').getObjects('Inventory')[0].id,
                actors()[0].getObjects('Party')[0].id,
                items()[0].getObjects('Party')[0].id,
                locations()[0].getObjects('Party')[0].id
            ];
        `), kind, id);
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.value, [
            ['b', 'a'], 'Town', ['Second description', 'First description'],
            'item', 'b', 'item', 'b', 'b', 'b',
        ]);
    }
});

test('resolved content writes use normalization and tests do not mutate the real save', () => {
    const { stage, save } = fixture();
    const result = stage.testFunctionStat(scriptStat(`
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
    configuration.globalStats.push(stat('Nested', 'function', {
        script: 'return getObjects("Inventory")[0].getField("description");',
    }));
    assert.deepEqual(stage.testFunctionStat(scriptStat('return call("Nested");')), {
        value: 'Sharp', errors: [],
    });
});

test('unknown and non-list stats report explicit errors in global and target scopes', () => {
    const { stage } = fixture();
    for (const scope of ['', 'target.']) {
        for (const name of ['Unknown', 'Score']) {
            const result = stage.testFunctionStat(scriptStat(`return ${scope}getObjects('${name}');`), 'actor', 'a');
            assert.equal(result.value, undefined);
            assert.equal(result.errors.length, 1);
            assert.match(result.errors[0], /requires an option list or content list stat/);
        }
    }
});
