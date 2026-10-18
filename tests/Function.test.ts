import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPortableGameConfiguration, GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Actor, getActorLore, resolveActorSchedule, resolveInitialActorStatValue } from '../src/content/Actor';
import { Item } from '../src/content/Item';
import { getLocationDescription, Location } from '../src/content/Location';
import { buildInitialGlobalStatValues, cloneGameAction, cloneStat, cloneStatUpdateRules, normalizeStatValue, resolveAvailableStatOptions, StartSkitAction, Stat, StatType, StatValue } from '../src/content/Stat';
import { generateContext, generateSkitScript, Skit } from '../src/content/Skit';
import { cloneGameFunction, functionPickerOptions, functionReference, globalStatReference, valuePickerOptions, GameFunction } from '../src/content/Function';
import { evaluateCondition } from '../src/content/Condition';
import { CalendarEvent } from '../src/content/CalendarEvent';
import { Control } from '../src/content/Control';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { createLoreEntry, formatLoreEntriesAsContext, processLoreText } from '../src/content/Lore';
import { buildPrompt } from '../src/utils/PromptBuilder';

const stat = (name: string, type: StatType, extra: Partial<Stat> = {}): Stat => cloneStat({
    id: name, name, type, guidance: '', default: [],
    llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    ...extra,
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

const skitAction = (extra: Partial<StartSkitAction> = {}): StartSkitAction => ({
    id: 'skit-action', kind: 'skit', locationId: 'place', actorIds: ['b'], ...extra,
});

test('skit actions survive configuration cloning without sharing participant lists or stat references', () => {
    const action = skitAction({ guidance: { targetType: 'actor', targetId: 'b', statId: 'Directions' } });
    const cloned = cloneStatUpdateRules([{ id: 'rule', conditions: [], updates: [action] }]);
    assert.deepEqual(cloned[0].updates[0], action);
    const copy = cloned[0].updates[0] as StartSkitAction;
    assert.notEqual(copy.actorIds, action.actorIds);
    assert.notEqual(copy.guidance, action.guidance);
    assert.equal(copy.guidance && typeof copy.guidance === 'object' && !Array.isArray(copy.guidance) && copy.guidance.targetId, 'b');
});

test('skit actions resolve literal, typed function, and stat inputs when encountered', () => {
    const { stage, save, configuration } = fixture();
    configuration.functions = [
        typedFunction('destination', 'location', 'return "place";'),
        typedFunction('cast', 'actorList', 'return ["b", "a", "b"];'),
        typedFunction('directions', 'text', 'return "Meet at dusk";'),
    ];
    const actions = [
        skitAction(),
        skitAction({ locationId: functionReference('destination'), actorIds: functionReference('cast'), guidance: functionReference('directions') }),
    ];
    for (const targetType of ['global', 'actor', 'location', 'item'] as const) {
        const definitions = [
            stat('Destination', 'location', { default: functionReference('destination') }),
            stat('Cast', 'actorList', { default: functionReference('cast') }),
            stat('Directions', 'text', { default: functionReference('directions') }),
        ];
        configuration[`${targetType === 'global' ? 'global' : targetType}Stats`].push(...definitions);
        const targetId = targetType === 'actor' ? 'b' : targetType === 'location' ? 'place' : targetType === 'item' ? 'item' : '';
        actions.push(skitAction({
            locationId: { targetType, targetId, statId: 'Destination' },
            actorIds: { targetType, targetId, statId: 'Cast' },
            guidance: { targetType, targetId, statId: 'Directions' },
        }));
    }
    for (const action of actions) {
        const skit = stage['createStatUpdateSkit'](save, action);
        assert.equal(skit.initialLocationId, 'place');
        assert.deepEqual(skit.initialActors, ['b']);
        assert.equal(skit.guidance, action.guidance ? 'Meet at dusk' : '');
        assert.deepEqual(save.timeline, []);
    }
});

test('invalid skit sources fail explicitly rather than silently starting a different scene', () => {
    const { stage, save, configuration } = fixture();
    configuration.functions = [typedFunction('wrong', 'number', 'return 1;')];
    for (const action of [
        skitAction({ locationId: 'missing' }),
        skitAction({ actorIds: ['missing'] }),
        skitAction({ actorIds: ['deleted'] }),
        skitAction({ locationId: functionReference('wrong') }),
        skitAction({ locationId: { targetType: 'global', targetId: '', statId: 'Score' } }),
        skitAction({ guidance: { targetType: 'actor', targetId: 'missing', statId: 'Directions' } }),
    ]) {
        assert.throws(() => stage['createStatUpdateSkit'](save, action));
    }
    assert.deepEqual(save.timeline, []);
});

test('skit guidance resolves text function names at trigger time while preserving ordinary text', () => {
    const { stage, save, configuration } = fixture();
    configuration.functions = [
        { ...typedFunction('directions', 'text', 'return `Score: ${get("Score")}`;'), name: 'Scene guidance' },
        { ...typedFunction('number', 'number', 'return 1;'), name: 'Not text' },
    ];
    save.globalStatValues!.Score = 7;
    for (const guidance of ['Scene guidance', '  SCENE GUIDANCE  ', functionReference('directions')]) {
        const action = skitAction({ guidance });
        assert.equal(stage['createStatUpdateSkit'](save, action).guidance, 'Score: 7');
        assert.equal(action.guidance, guidance);
    }
    save.globalStatValues!.Score = 8;
    assert.equal(stage['createStatUpdateSkit'](save, skitAction({ guidance: 'Scene guidance' })).guidance, 'Score: 8');
    for (const guidance of ['', '  ', 'Ordinary scene directions', 'Not text', 'Mention Scene guidance in the scene']) {
        assert.equal(stage['createStatUpdateSkit'](save, skitAction({ guidance })).guidance, guidance);
    }
});

test('named guidance functions surface invalid returns, script errors, and attempted writes', () => {
    const { stage, save, configuration } = fixture();
    const fn = { ...typedFunction('directions', 'text', ''), name: 'Scene guidance' };
    configuration.functions = [fn];
    for (const script of ['return 42;', 'throw new Error("Guidance failed");', 'set("Score", 9); return "Changed";']) {
        fn.script = script;
        assert.throws(() => stage['createStatUpdateSkit'](save, skitAction({ guidance: 'Scene guidance' })));
    }
    assert.equal(save.globalStatValues?.Score, 2);
    assert.deepEqual(save.timeline, []);
});

const endingSkitFixture = (eventsEnabled = true) => {
    const result = fixture();
    const { stage, save, configuration } = result;
    const current = new Skit({ initialLocationId: 'place', initialActors: ['b'] });
    save.currentDate = '2026-10-15';
    save.currentTimeOfDay = 'morning';
    save.timeline.push({ date: save.currentDate, skit: current });
    configuration.useEvents = eventsEnabled;
    stage['flagLoreForUpdate'] = async () => {};
    stage.summaryCheck = async () => {};
    stage.showPriorityMessage = () => {};
    stage.rebuildUpcomingEvents = () => save.upcomingEvents || [];
    stage.saveGame = () => {};
    return { ...result, current };
};

test('the first rule skit wins over mandatory events after every remaining action has resolved and is saved', () => {
    const { stage, save, configuration, current } = endingSkitFixture();
    save.upcomingEvents = [{
        id: 'mandatory', name: 'Mandatory', date: save.currentDate!, duration: ['afternoon'],
        locationId: 'place', actorIds: ['b'], description: '', guidance: 'Mandatory scene', mandatory: true,
    }];
    configuration.functions = [gameFunction('set("Score", get("Score") + 1);')];
    configuration.statUpdateRules = [
        { id: 'first', conditions: [], updates: [
            skitAction({ guidance: 'First scene' }),
            { id: 'write', targetType: 'global', targetId: '', statId: 'Score', operation: 'adjust', value: 2 },
            { id: 'invoke', kind: 'function', functionId: 'test-function' },
        ] },
        { id: 'second', conditions: [], updates: [
            skitAction({ locationId: functionReference('should-not-evaluate'), guidance: 'Second scene' }),
            { id: 'later', targetType: 'global', targetId: '', statId: 'Score', operation: 'adjust', value: 1 },
        ] },
    ];
    stage.rebuildUpcomingEvents = () => {
        assert.equal(save.globalStatValues?.Score, 6);
        assert.equal(stage.getCurrentSkit(), null);
        return save.upcomingEvents || [];
    };
    let persistedSkit: Skit | null = null;
    stage.saveGame = () => { persistedSkit = stage.getCurrentSkit(); };
    const next = stage.endSkit();
    assert.ok(next);
    assert.equal(next.guidance, 'First scene');
    assert.equal(current.over, true);
    assert.equal(save.currentTimeOfDay, 'afternoon');
    assert.equal(save.timeline.length, 2);
    assert.equal(stage.getCurrentSkit(), next);
    assert.equal(persistedSkit, next);
    assert.equal(save.upcomingEvents.length, 1);
});

test('rule skits run with calendar events disabled, while no match preserves the ordinary end flow', () => {
    const { stage, save, configuration } = endingSkitFixture(false);
    configuration.statUpdateRules = [{ id: 'rule', conditions: [], updates: [skitAction()] }];
    assert.ok(stage.endSkit());
    assert.equal(save.timeline.length, 2);
    configuration.statUpdateRules[0].conditions = [[{ type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'morning' }]];
    assert.equal(stage.endSkit(), null);
    assert.equal(stage.getCurrentSkit(), null);
});

test('mandatory skit fallback is unchanged when no rule skit fires', () => {
    const { stage, save } = endingSkitFixture();
    save.upcomingEvents = [{
        id: 'mandatory', name: 'Mandatory', date: save.currentDate!, duration: ['afternoon'],
        locationId: 'place', actorIds: ['b'], description: '', guidance: 'Mandatory scene', mandatory: true,
    }];
    let startedId = '';
    const mandatory = new Skit({ guidance: 'Mandatory scene' });
    stage.startCalendarEventSkit = id => { startedId = id; return mandatory; };
    assert.equal(stage.endSkit(), mandatory);
    assert.equal(startedId, 'mandatory');
});

test('multi-period event completion keeps only the first rule skit while replaying all stat writes', () => {
    const { stage, save, configuration } = endingSkitFixture(false);
    save.timeline[0].calendarEventId = 'long-event';
    save.timeline[0].calendarEventEndTimeOfDay = 'night';
    configuration.statUpdateRules = [{ id: 'rule', conditions: [], updates: [
        { id: 'write', targetType: 'global', targetId: '', statId: 'Score', operation: 'adjust', value: 1 },
        skitAction({ guidance: functionReference('current-score') }),
    ] }];
    configuration.functions = [typedFunction('current-score', 'text', 'return String(get("Score"));')];
    const next = stage.endSkit();
    assert.equal(next?.guidance, '3');
    assert.equal(save.globalStatValues?.Score, 6);
    assert.equal(save.currentDate, '2026-10-16');
    assert.equal(save.currentTimeOfDay, 'morning');
    assert.equal(save.timeline.length, 2);
});

test('automatic guidance preserves the explicit cast, including unscheduled actors and an empty cast', async () => {
    for (const actorIds of [['b'], []]) {
        const { stage, save } = fixture();
        const skit = stage['createStatUpdateSkit'](save, skitAction({ actorIds }));
        save.timeline.push({ skit, date: '2026-10-15' });
        let guidancePrompt = '';
        stage.pushMessage = () => {};
        stage.generateText = async prompt => {
            if (!guidancePrompt) {
                guidancePrompt = prompt;
                return '<Reasoning>A quiet scene</Reasoning><Guidance>A chance encounter</Guidance><Participants><Participant>Unexpected actor</Participant></Participants>';
            }
            return '<Entry><Speaker>Narrator</Speaker><Message>A quiet moment passes.</Message></Entry>';
        };
        const entries = await generateSkitScript(skit, stage);
        assert.equal(entries.length, 1);
        assert.equal(skit.guidance, 'A chance encounter');
        assert.deepEqual(skit.initialActors, actorIds);
        assert.match(guidancePrompt, /fixed cast/);
    }
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

test('function placeholders evaluate each occurrence by name against current state without changing source text', () => {
    const { stage, save, configuration } = fixture();
    configuration.functions = [
        { ...typedFunction('score-summary', 'text', 'return `Score: ${call("Current score")}`;'), name: 'Score summary' },
        { ...typedFunction('score', 'number', 'return get("Score");'), name: 'Current score' },
    ];
    const entry = createLoreEntry({ content: '{{Score summary}} / {{  sCoRe SuMmArY  }}' });
    assert.equal(processLoreText(entry.content, stage), 'Score: 2 / Score: 2');
    save.globalStatValues!.Score = 8;
    assert.equal(processLoreText(entry.content, stage), 'Score: 8 / Score: 8');
    assert.equal(entry.content, '{{Score summary}} / {{  sCoRe SuMmArY  }}');

    let evaluations = 0;
    const resolveValue = stage.resolveValue.bind(stage);
    stage.resolveValue = (...args) => {
        if (args[0] === functionReference('score-summary')) evaluations += 1;
        return resolveValue(...args);
    };
    processLoreText(entry.content, stage);
    assert.equal(evaluations, 2);
});

test('function placeholders format every non-void return type without normalizing away the result', () => {
    const { stage, configuration } = fixture();
    const cases: [StatType, StatValue, string][] = [
        ['text', 'A label', 'A label'], ['text', '', ''],
        ['number', 0, '0'], ['number', -7.5, '-7.5'],
        ['checkbox', true, 'yes'], ['checkbox', false, 'no'],
        ['actor', 'a', 'Same name'], ['item', 'item', 'Sword'], ['location', 'place', 'Town'],
        ['actorList', ['b', 'a'], 'Same name, Same name'],
        ['itemList', ['item', 'item'], 'Sword, Sword'],
        ['locationList', ['place'], 'Town'], ['actorList', [], ''],
        ['actor', 'missing', 'unknown actor'],
        ['item', 'missing', 'unknown item'], ['location', 'missing', 'unknown location'],
        ['option', 'first', 'first'], ['optionList', ['first', 'second-2'], 'first, second-2'],
        ['optionList', [], ''],
    ];
    for (const [type, value, expected] of cases) {
        configuration.functions = [typedFunction('Value', type, `return ${JSON.stringify(value)};`)];
        assert.equal(processLoreText('Before {{Value}} after', stage), `Before ${expected} after`, `${type}: ${JSON.stringify(value)}`);
    }
});

test('function substitution preserves existing stat and actor tags, unknown tags, and literal returned text', () => {
    const { stage, save, configuration } = fixture();
    configuration.actorStats.push(stat('Relationships', 'number', { perActor: true }));
    save.actors.a.displayName = 'Player display';
    save.actors.b.displayName = 'Friend';
    configuration.functions = [
        typedFunction('user', 'text', 'throw new Error("Reserved tag");'),
        typedFunction('char', 'text', 'throw new Error("Reserved tag");'),
        typedFunction('global:Score', 'text', 'throw new Error("Reserved tag");'),
        typedFunction('Literal', 'text', 'return "{{global:Score}} {{Unknown}} $&";'),
        gameFunction('set("Score", 9);'),
    ];
    const source = '{{user}} / {{char}} / {{global:Score}} / {{ user:score }} / {{CHAR:Choices}} / {{Literal}}';
    assert.equal(processLoreText(source, stage, save.actors.b),
        'Same name / Friend / 2 / 2 / Second, First / {{global:Score}} {{Unknown}} $&');
    const unchanged = '{{Unknown}} {{Test function}} {{global}} {{global:missing}} {{char:Relationships}} {{}} {{  }}';
    assert.equal(processLoreText(unchanged, stage, save.actors.b), unchanged);
    assert.equal(processLoreText('{{char}} {{char:Score}}', stage), '{{char}} {{char:Score}}');
    assert.equal(processLoreText(undefined, stage), '');
    assert.equal(save.globalStatValues!.Score, 2);
});

test('function placeholders propagate invalid results, script errors, and cycles', () => {
    const { stage, save, configuration } = fixture();
    const fn = typedFunction('Value', 'text', '');
    configuration.functions = [fn];
    for (const script of [
        'return 42;',
        'return undefined;',
        'throw new Error("Substitution failed");',
        'return call("Value");',
        'return get("Score");',
    ]) {
        fn.script = script;
        assert.throws(() => processLoreText('{{Value}}', stage));
    }
    fn.returnType = 'number';
    fn.script = 'return get("Score");';
    save.globalStatValues!.Score = functionReference(fn.id);
    assert.throws(() => processLoreText('{{Value}}', stage), /cyclic/);
});

test('function placeholders forbid global/entity writes and metadata writes even through nested calls', () => {
    const { stage, save, configuration } = fixture();
    const before = structuredClone(save);
    const writes = [
        'set("Score", 9);',
        'getActor("Same name").set("Score", 9);',
        'getLocation("Town").set("Score", 9);',
        'getItem("Sword").set("Score", 9);',
        'getActor("Same name").setField("name", "Changed");',
        'getLocation("Town").setField("description", "Changed");',
        'getItem("Sword").setField("description", "Changed");',
    ];
    for (const write of writes) {
        configuration.functions = [
            typedFunction('Value', 'text', 'call("Write"); return "Done";'),
            { ...gameFunction(write), id: 'write', name: 'Write' },
        ];
        assert.throws(() => processLoreText('{{Value}}', stage), /read-only/);
        assert.deepEqual(structuredClone(save), before);
    }
});

test('function substitution reaches world lore, actor lore, locations, and generated scene context', () => {
    const { stage, save, configuration } = fixture();
    configuration.functions = [typedFunction('Value', 'text', 'return `Current score: ${get("Score")}`;')];
    const world = createLoreEntry({ title: 'World', content: 'World {{Value}}', constant: true });
    const actorLore = createLoreEntry({ type: 'character', title: 'Same name', content: 'Actor {{Value}} / {{char:Score}}' });
    save.actors.b.loreId = actorLore.id;
    save.atlas.place.description = 'Location {{Value}}';
    save.lorebook = [world, actorLore];
    assert.equal(formatLoreEntriesAsContext([world], stage), 'World:\nWorld Current score: 2');
    assert.equal(getActorLore('b', stage), 'Actor Current score: 2 / 2');
    assert.equal(getLocationDescription('place', stage), 'Location Current score: 2');

    const skit = new Skit({ initialLocationId: 'place', initialActors: ['b'] });
    const prompt = buildPrompt().addBlock('Context', generateContext(skit, stage, 5)).format();
    assert.match(prompt, /World Current score: 2/);
    assert.match(prompt, /Actor Current score: 2 \/ 2/);
    assert.match(prompt, /Location Current score: 2/);
    assert.doesNotMatch(prompt, /\{\{Value\}\}/);
    assert.equal(world.content, 'World {{Value}}');
    assert.equal(actorLore.content, 'Actor {{Value}} / {{char:Score}}');
    assert.equal(save.atlas.place.description, 'Location {{Value}}');
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

test('global stat picker sources match exact types and remain distinct from functions and literal IDs', () => {
    const { configuration } = fixture();
    configuration.globalStats.push(stat('destination', 'location', { default: 'place', guidance: 'Where to meet' }));
    configuration.functions = [typedFunction('destination', 'location', 'return "place";')];
    assert.deepEqual(valuePickerOptions(configuration, 'location'), [
        { key: functionReference('destination'), label: 'destination()', category: 'Functions', description: '' },
        { key: globalStatReference('destination'), label: 'destination', category: 'Global Stats', description: 'Where to meet' },
    ]);
    assert.deepEqual(valuePickerOptions(configuration, 'actor'), []);
    assert.deepEqual(valuePickerOptions(undefined, 'text'), []);
});

test('all global stat source types preserve references and resolve save, configured, and stat defaults', () => {
    const { stage, configuration, save } = fixture();
    const cases: [StatType, StatValue, StatValue][] = [
        ['number', 3, 4], ['text', 'star', 'favorite'], ['checkbox', false, true],
        ['option', 'first', 'second'], ['optionList', ['first'], ['second']],
        ['actor', 'a', 'b'], ['actorList', ['a'], ['b']],
        ['item', 'item', 'other-item'], ['itemList', ['item'], ['other-item']],
        ['location', 'place', 'other-place'], ['locationList', ['place'], ['other-place']],
    ];
    for (const [type, initial, current] of cases) {
        const source = stat(`source-${type}`, type, { default: initial, options: [
            { id: 'first', name: 'First', description: '' }, { id: 'second', name: 'Second', description: '' },
        ] });
        configuration.globalStats.push(source);
        const reference = globalStatReference(source.id);
        const target = stat(`target-${type}`, type, { default: reference, options: source.options });
        configuration.globalStats.push(target);
        configuration.globalStatValues[target.id] = reference;
        assert.equal(cloneStat(target).default, reference, type);
        assert.equal(normalizeStatValue(undefined, target), reference, type);
        assert.equal(normalizeStatValue(reference, target), reference, type);
        assert.deepEqual(stage.readStatValue(undefined, target), initial, type);
        configuration.globalStatValues[source.id] = current;
        assert.deepEqual(stage.resolveValue(reference, type), current, type);
        save.globalStatValues![source.id] = initial;
        assert.deepEqual(stage.resolveValue(reference, type), initial, type);
        save.globalStatValues![source.id] = current;
        assert.deepEqual(stage.readStatValue(reference, target), current, type);
        assert.equal(target.default, reference, type);
    }
    const portable = JSON.parse(JSON.stringify(buildPortableGameConfiguration(configuration)));
    assert.deepEqual(portable.globalStatValues, configuration.globalStatValues);
});

test('global sources expand scalar and list values alongside functions and literals without mutating storage', () => {
    const { stage, configuration, save } = fixture();
    configuration.functions = [typedFunction('actor', 'actor', 'return "b";')];
    configuration.globalStats.push(stat('leader', 'actor', { default: functionReference('actor') }));
    save.globalStatValues!.Party = ['a', globalStatReference('leader')];
    const stored = ['literal', globalStatReference('Party'), functionReference('actor'), globalStatReference('leader'), 'last'];
    const before = JSON.stringify(stored);
    assert.deepEqual(stage.resolveValue(stored, 'actorList'), ['literal', 'a', 'b', 'b', 'b', 'last']);
    assert.equal(JSON.stringify(stored), before);
    assert.deepEqual(save.globalStatValues!.Party, ['a', globalStatReference('leader')]);
    configuration.functions[0].script = 'return "a";';
    assert.deepEqual(stage.resolveValue(globalStatReference('Party'), 'actorList'), ['a', 'a']);
    const alternateSave = { ...save, globalStatValues: { Party: ['b'] } };
    assert.deepEqual(stage.resolveValue(globalStatReference('Party'), 'actorList', alternateSave), ['b']);
    assert.deepEqual(stage.resolveValue([], 'actorList'), []);
    configuration.functions[0].script = 'set("Score", 9); return "b";';
    assert.throws(() => stage.resolveValue(globalStatReference('leader'), 'actor'), /read-only/);
    assert.equal(save.globalStatValues!.Score, 2);
});

test('option lists preserve global references and use their evaluated IDs as active choices', () => {
    const { stage, configuration, save } = fixture();
    const choices = configuration.globalStats.find(stat => stat.id === 'Choices')!;
    configuration.globalStats.push(
        stat('active', 'optionList', { default: ['second-2'], options: choices.options }),
        stat('selected', 'option', { default: 'first', options: choices.options }),
    );
    const stored = [globalStatReference('active'), globalStatReference('selected')];
    save.globalStatValues!.Choices = stored;
    assert.deepEqual(normalizeStatValue(stored, choices), stored);
    const option = stat('selection', 'option', { optionSourceStatId: 'Choices' });
    const resolveChoices = () => resolveAvailableStatOptions(option, undefined, {
        sourceStats: configuration.globalStats, globalStatValues: save.globalStatValues,
        resolveValue: (value, type) => stage.resolveValue(value, type),
    }).map(option => option.id);
    assert.deepEqual(stage.readStatValue(stored, choices), ['second-2', 'first']);
    assert.deepEqual(resolveChoices(), ['first', 'second-2']);
    save.globalStatValues!.active = [];
    assert.deepEqual(resolveChoices(), ['first']);
    assert.deepEqual(save.globalStatValues!.Choices, stored);
});

test('missing, incompatible, and cyclic global stat references fail explicitly', () => {
    const { stage, configuration, save } = fixture();
    assert.throws(() => stage.resolveValue(globalStatReference('missing'), 'actor'), /Unknown global stat reference/);
    assert.throws(() => stage.resolveValue(globalStatReference('Party'), 'location'), /has type actorList, not location/);
    assert.throws(() => stage.resolveValue([globalStatReference('Score')], 'actorList'), /has type number, not actor/);
    save.globalStatValues!.Score = globalStatReference('Score');
    assert.throws(() => stage.resolveValue(globalStatReference('Score'), 'number'), /cyclic global stat reference/);
    configuration.globalStats.push(stat('other', 'number', { default: globalStatReference('Score') }));
    save.globalStatValues!.Score = globalStatReference('other');
    assert.throws(() => stage.resolveValue(globalStatReference('Score'), 'number'), /cyclic global stat reference/);
    save.globalStatValues!.Party = ['a', globalStatReference('Party')];
    assert.throws(() => stage.resolveValue(globalStatReference('Party'), 'actorList'), /cyclic global stat reference/);
    configuration.functions = [typedFunction('cycle', 'number', 'return get("Score");')];
    save.globalStatValues!.Score = functionReference('cycle');
    assert.throws(() => stage.resolveValue(globalStatReference('Score'), 'number'), /cyclic function reference/);
    save.globalStatValues!.Score = globalStatReference('other');
    assert.throws(() => stage.resolveValue(functionReference('cycle'), 'number'), /cyclic global stat reference/);
    configuration.functions.push(typedFunction('bad-result', 'actor', 'return "globalStat:Party";'));
    assert.throws(() => stage.resolveValue(functionReference('bad-result'), 'actor'), /Expected a actor function result/);
    for (let index = 0; index < 9; index++) {
        configuration.globalStats.push(stat(`chain-${index}`, 'actor', { default: index < 8 ? globalStatReference(`chain-${index + 1}`) : 'a' }));
    }
    assert.throws(() => stage.resolveValue(globalStatReference('chain-0'), 'actor'), /Maximum value reference depth exceeded/);
});

test('global references survive writes and initialization and resolve through script reads', () => {
    const { stage, configuration, save } = fixture();
    configuration.globalStats.push(stat('base', 'number', { default: 3 }));
    const source = globalStatReference('base');
    const target = stat('target', 'number', { default: source });
    assert.equal(buildInitialGlobalStatValues([target], {}, stage.getScheduleContext(save)).target, source);
    assert.equal(resolveInitialActorStatValue(target, { value: source, modifiers: [] }, stage.getScheduleContext(save)), source);
    stage.saveGame = () => {};
    stage.runControlActions(new Control({ actions: [{
        id: 'write', targetType: 'global', targetId: '', statId: 'Score', operation: 'set', value: source,
    }] }));
    assert.equal(save.globalStatValues!.Score, source);
    assert.deepEqual(stage.testFunction(gameFunction('return get("Score");')), { value: 3, errors: [] });
    stage.runControlActions(new Control({ actions: [{
        id: 'adjust', targetType: 'global', targetId: '', statId: 'Score', operation: 'adjust', value: source,
    }] }));
    assert.equal(save.globalStatValues!.Score, 6);
});

test('conditions, schedules, skits, and calendar events read global references at use time', () => {
    const { stage, configuration, save } = fixture();
    configuration.globalStats.push(
        stat('destination', 'location', { default: 'place' }),
        stat('leader', 'actor', { default: 'a' }),
        stat('cast', 'actorList', { default: ['b'] }),
        stat('directions', 'text', { default: 'Meet at dusk' }),
    );
    const context = { ...stage.getScheduleContext(save), currentActor: save.actors.a };
    assert.equal(evaluateCondition({ type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: globalStatReference('leader') }, context), true);
    const actor = new Actor({ id: 'scheduled', schedule: { [globalStatReference('destination')]: [] } });
    assert.equal(resolveActorSchedule(actor, context), 'place');
    const skit = stage['createStatUpdateSkit'](save, skitAction({
        locationId: globalStatReference('destination'), actorIds: [globalStatReference('cast')], guidance: globalStatReference('directions'),
    }));
    assert.equal(skit.initialLocationId, 'place');
    assert.deepEqual(skit.initialActors, ['b']);
    assert.equal(skit.guidance, 'Meet at dusk');
    const event: CalendarEvent = {
        id: 'event', name: 'Event', date: '2026-10-08', duration: ['morning'],
        locationId: globalStatReference('destination'), actorIds: [globalStatReference('leader'), globalStatReference('cast')],
        description: 'Description', guidance: 'Guidance', mandatory: false,
    };
    const stored = stage['normalizeCalendarEventForSave'](event, save);
    assert.equal(stored.locationId, event.locationId);
    assert.deepEqual(stored.actorIds, event.actorIds);
    assert.deepEqual(stage.resolveCalendarEvent(stored).actorIds, ['a', 'b']);
    save.globalStatValues!.leader = 'b';
    assert.deepEqual(stage.resolveCalendarEvent(stored).actorIds, ['b', 'b']);
    assert.equal(stage.resolveCalendarEvent(stored).locationId, 'place');
});
