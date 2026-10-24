import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildPortableGameConfiguration, GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Actor } from '../src/content/Actor';
import { CalendarEvent, getActiveTimeMode } from '../src/content/CalendarEvent';
import { Control } from '../src/content/Control';
import { Item } from '../src/content/Item';
import { Location } from '../src/content/Location';
import { Map as GameMap } from '../src/content/Map';
import { createLoreEntry } from '../src/content/Lore';
import { cloneStat } from '../src/content/Stat';
import { TooltipProvider } from '../src/components/TooltipContext';
import { SaveLoadScreen } from '../src/screens/SaveLoadScreen';
import { MenuScreen } from '../src/screens/MenuScreen';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { ContentManagementScreen } from '../src/screens/ContentManagementScreen';

const numberStat = (id: string, value: number) => cloneStat({
    id, name: id, type: 'number', default: value, guidance: '',
    llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
});

const event = (id: string, name = id): CalendarEvent => ({
    id, name, date: '2026-10-25', duration: ['morning'], locationId: 'place',
    actorIds: ['actor'], participantActorIds: ['actor'], description: name, guidance: name,
});

const lore = (id: string, content = '') => ({ ...createLoreEntry({ content }), id });

const fixture = () => {
    const stage: Stage = Object.create(Stage.prototype);
    const configuration = stage['createDefaultNewGameConfiguration']();
    Object.assign(configuration, {
        versionId: 'old-version', title: 'Old title', versionNotes: 'Old notes',
        actors: [new Actor({ id: 'actor', name: 'Old actor', statMap: { health: 1 } })],
        locations: [new Location({ id: 'place', name: 'Old place' })],
        items: [new Item({ id: 'item', name: 'Old item' })],
        maps: [new GameMap({ id: 'map', name: 'Old map' })],
        globalStats: [numberStat('score', 1)], actorStats: [numberStat('health', 1)],
        globalStatValues: { score: 1 },
    });
    const source: SaveType = {
        playerId: 'player',
        actors: {
            player: new Actor({ id: 'player', name: 'My player', statMap: { health: 8 } }),
            actor: new Actor({ id: 'actor', name: 'Old actor', statMap: { health: 9 } }),
            extra: new Actor({ id: 'extra', name: 'Save-only actor' }),
        },
        atlas: { place: new Location({ id: 'place', name: 'Old place' }), extra: new Location({ id: 'extra' }) },
        inventory: [new Item({ id: 'item', name: 'Old item' }), new Item({ id: 'extra' })],
        maps: [new GameMap({ id: 'map', name: 'Old map' }), new GameMap({ id: 'extra' })],
        universalSchedule: {}, timeline: [{ date: '2026-10-23', calendarEventId: 'completed' }],
        lorebook: [lore('lore', 'Old lore'), lore('extra')],
        upcomingEvents: [event('event', 'Old event'), event('extra')],
        timestamp: 123, currentDate: '2026-10-24', currentTimeOfDay: 'afternoon',
        globalStatValues: { score: 7 }, language: 'French', enableTextToSpeech: false,
    };
    const persisted: Stage['saveData'][] = [];
    Object.assign(stage, {
        SAVE_SLOT_COUNT: 10,
        isOwner: false,
        primaryUser: { anonymizedId: 'player', name: 'Player', chatProfile: '' },
        primaryCharacter: { anonymizedId: 'character' },
        saveData: { configuration, saves: [source, ...Array(9).fill(undefined)], lastSaveSlot: 0 },
        messenger: { updateChatState: async (state: Stage['saveData']) => {
            persisted.push(state);
            return { success: true, error: null };
        } },
    });
    stage.getConfiguration();
    return { stage, source, configuration, persisted };
};

const publishUpdate = (stage: Stage) => {
    const configuration: GameConfiguration = {
        ...stage.getPublishedConfiguration(),
        versionId: 'new-version', title: 'New title', versionNotes: 'New notes',
        timeMode: 'phase', dateMode: 'turnBased', useEvents: false, artStyle: 'New art style',
        universalSchedule: { place: [[]] },
        uiSettings: { ...stage.getPublishedConfiguration().uiSettings, primaryFontFamily: 'Published font' },
        actors: [
            new Actor({ id: 'player', name: 'Do not replace player' }),
            new Actor({ id: 'actor', name: 'Updated actor', statMap: { health: 2 } }),
            new Actor({ id: 'added', name: 'Added actor' }),
        ],
        locations: [new Location({ id: 'place', name: 'Updated place' }), new Location({ id: 'added' })],
        items: [new Item({ id: 'item', name: 'Updated item' }), new Item({ id: 'added' })],
        maps: [new GameMap({ id: 'map', name: 'Updated map' }), new GameMap({ id: 'added' })],
        lorebook: [lore('lore', 'Updated lore'), lore('added')],
        calendarEvents: [event('event', 'Updated event'), event('added'), event('completed')],
        globalStats: [numberStat('score', 1), numberStat('new-stat', 3)],
        functions: [{ id: 'fn', name: 'New function', description: '', script: 'return 42;', returnType: 'number' }],
        controls: [new Control({ id: 'new-control' })],
    };
    stage.updateConfiguration(configuration, true);
    return configuration;
};

test('clone and update replaces published content, preserves progress, and persists into the first free slot', async () => {
    const { stage, source, persisted } = fixture();
    publishUpdate(stage);
    const original = JSON.stringify(source);
    assert.equal(await stage.cloneAndUpdateSave(0), 1);
    const copy = stage.getSave();
    assert.equal(stage.saveData.lastSaveSlot, 1);
    assert.equal(stage.saveData.saves[0], source);
    assert.ok(copy.timestamp > source.timestamp);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].saves[1], copy);
    assert.equal(JSON.stringify(source), original);
    assert.equal(copy.actors.player.name, 'My player');
    assert.equal(copy.actors.player.statMap.health, 8);
    assert.equal(copy.actors.actor.name, 'Updated actor');
    assert.equal(copy.actors.actor.statMap.health, 2);
    assert.ok(copy.actors.extra && copy.actors.added);
    assert.equal(copy.atlas.place.name, 'Updated place');
    assert.ok(copy.atlas.extra && copy.atlas.added);
    assert.deepEqual(copy.inventory.map(item => item.id), ['item', 'extra', 'added']);
    assert.equal(copy.inventory[0].name, 'Updated item');
    assert.deepEqual(copy.maps.map(map => map.id), ['map', 'extra', 'added']);
    assert.ok(copy.maps.every(map => map instanceof GameMap));
    assert.equal(copy.maps[0].name, 'Updated map');
    assert.equal(copy.lorebook?.find(entry => entry.id === 'lore')?.content, 'Updated lore');
    assert.ok(copy.lorebook?.some(entry => entry.id === 'extra'));
    assert.equal(copy.upcomingEvents?.find(entry => entry.id === 'event')?.name, 'Updated event');
    assert.ok(copy.upcomingEvents?.some(entry => entry.id === 'extra'));
    assert.equal(copy.upcomingEvents?.some(entry => entry.id === 'completed'), false);
    assert.deepEqual(copy.timeline, source.timeline);
    assert.equal(copy.currentDate, source.currentDate);
    assert.equal(copy.currentTimeOfDay, source.currentTimeOfDay);
    assert.equal(copy.language, 'French');
    assert.equal(copy.enableTextToSpeech, false);
    assert.deepEqual(copy.universalSchedule, { place: [[]] });
    assert.deepEqual(source.universalSchedule, {});
    assert.equal(copy.uiSettings?.primaryFontFamily, 'Published font');
    assert.deepEqual(copy.globalStatValues, { score: 7, 'new-stat': 3 });
    assert.equal(stage.getConfiguration().versionId, 'new-version');
    assert.equal(stage.getConfiguration().functions[0].id, 'fn');
    assert.equal(stage.getConfiguration().controls[0].id, 'new-control');
    assert.equal(stage.getConfiguration().artStyle, 'New art style');
    assert.equal(stage.getDateMode(), 'turnBased');
    assert.equal(stage.areEventsEnabled(), false);
    assert.equal(getActiveTimeMode(), 'phase');
    assert.equal(stage.canUpdateSave(1), false);
    assert.equal(stage.canUpdateSave(0), true);
    copy.actors.actor.name = 'Changed copy';
    copy.configuration!.actors[1].name = 'Changed snapshot';
    assert.equal(source.actors.actor.name, 'Old actor');
    assert.equal(stage.getPublishedConfiguration().actors[1].name, 'Updated actor');
    stage.loadSave(0);
    assert.equal(stage.getConfiguration().title, 'Old title');
    assert.equal(stage.getConfiguration().functions.length, 0);
    assert.equal(stage.getDateMode(), 'calendar');
    assert.equal(stage.areEventsEnabled(), true);
    assert.equal(getActiveTimeMode(), 'timeOfDay');
});

test('legacy saves are snapshotted before a storage refresh, and new games use the published rules', async () => {
    const { stage, source, persisted } = fixture();
    const published = publishUpdate(stage);
    delete source.configuration;
    stage.saveData.configuration = stage['createDefaultNewGameConfiguration']();
    stage.saveData.configuration.title = 'Legacy title';
    Object.assign(stage, { storage: { get: () => ({ forCharacters: async () => ({
        data: [{ key: 'agenda_configuration', value: buildPortableGameConfiguration(published) }],
    }) }) } });
    await stage.readStageConfiguration();
    assert.equal(source.configuration?.title, 'Legacy title');
    assert.equal(source.configuration?.versionId, undefined);
    assert.equal(stage.getConfiguration().title, 'Legacy title');
    assert.equal(stage.getPublishedConfiguration().title, 'New title');
    assert.ok(stage.canUpdateSave(0));
    assert.equal(persisted.length, 1);
    const fresh = stage.generateFreshSave({ name: 'New player', personality: '' });
    assert.equal(fresh.configuration?.versionId, 'new-version');
    assert.ok(fresh.actors.added);
    assert.equal(stage.getConfiguration(fresh).timeMode, 'phase');
    assert.deepEqual(fresh.globalStatValues, { score: 1, 'new-stat': 3 });
    assert.equal(stage.getConfiguration().title, 'Legacy title');
});

test('creator rules remain live and publication stamps a new GUID only after a successful storage write', async () => {
    const { stage, source, configuration } = fixture();
    stage.isOwner = true;
    const versions: string[] = [];
    let fail = false;
    Object.assign(stage, { storage: { set: (_key: string, value: GameConfiguration) => {
        versions.push(value.versionId!);
        return { forCharacterSensitive: async () => ({ data: [], status: fail ? 403 : 200, error: fail ? 'Denied' : '' }) };
    } } });
    stage.updateConfiguration({ title: 'Creator draft' });
    assert.equal(stage.getConfiguration().title, 'Creator draft');
    assert.equal(source.configuration?.title, 'Creator draft');
    assert.equal(configuration.versionId, 'old-version');
    assert.equal(await stage.publishStageConfiguration(), true);
    const firstVersion = stage.getConfiguration().versionId;
    assert.match(firstVersion!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    fail = true;
    assert.equal(await stage.publishStageConfiguration(), false);
    assert.equal(stage.getConfiguration().versionId, firstVersion);
    fail = false;
    assert.equal(await stage.publishStageConfiguration(), true);
    assert.notEqual(stage.getConfiguration().versionId, firstVersion);
    assert.equal(new Set(versions).size, 3);
});

test('updates reject empty slots, current versions, and full save lists without changes', async () => {
    const { stage, source, persisted } = fixture();
    assert.equal(stage.canUpdateSave(0), false);
    assert.equal(stage.canUpdateSave(1), false);
    await assert.rejects(stage.cloneAndUpdateSave(0), /no published update/);
    publishUpdate(stage);
    stage.saveData.saves.fill(source);
    const before = JSON.stringify(stage.saveData);
    await assert.rejects(stage.cloneAndUpdateSave(0), /empty save slot/);
    assert.equal(JSON.stringify(stage.saveData), before);
    assert.equal(persisted.length, 0);
});

test('an outdated non-current save can be updated independently of the active playthrough', async () => {
    const { stage, source } = fixture();
    publishUpdate(stage);
    await stage.cloneAndUpdateSave(0);
    stage.getSave().globalStatValues!.score = 99;
    const original = JSON.stringify(source);
    assert.equal(await stage.cloneAndUpdateSave(0), 2);
    assert.equal(stage.getSave().globalStatValues!.score, 7);
    assert.equal(stage.saveData.saves[1]?.globalStatValues?.score, 99);
    assert.equal(JSON.stringify(source), original);
});

test('recurring published events are applied once per series without replaying completed instances', async () => {
    const { stage, source } = fixture();
    publishUpdate(stage);
    const first = { ...event('series'), recurrence: { frequency: 'daily' as const, interval: 1, untilDate: '2026-10-27' } };
    stage.getPublishedConfiguration().calendarEvents = stage['expandRecurringEvent'](first);
    source.timeline.push({ calendarEventId: 'series-r1', date: '2026-10-26' });
    await stage.cloneAndUpdateSave(0);
    const ids = stage.getSave().upcomingEvents?.filter(entry => entry.recurrenceParentId === 'series').map(entry => entry.id);
    assert.deepEqual(ids, ['series', 'series-r2']);
});

test('failed storage reads report errors and never alter the saved configuration', async () => {
    for (const response of [
        { data: [], status: 403, error: 'Denied' },
        { data: [], errors: ['Denied'] },
    ]) {
        const { stage, source } = fixture();
        const before = JSON.stringify(source);
        Object.assign(stage, { storage: { get: () => ({ forCharacters: async () => response }) } });
        await assert.rejects(stage.readStageConfiguration(), /Failed to read.*Denied/);
        assert.equal(JSON.stringify(source), before);
        assert.equal(stage.getPublishedConfiguration().versionId, 'old-version');
    }
});

test('application and persistence errors leave the source and destination slots untouched', async () => {
    for (const failure of ['application', 'rejected-write', 'failed-response']) {
        const { stage, source } = fixture();
        publishUpdate(stage);
        if (failure === 'application') {
            stage.getPublishedConfiguration().globalStats.push(numberStat('bad', 0));
            stage.getPublishedConfiguration().globalStatValues.bad = 'function:missing';
        } else {
            Object.assign(stage, { messenger: { updateChatState: async () => {
                if (failure === 'rejected-write') throw new Error('Write rejected');
                return { success: false, error: 'Write rejected' };
            } } });
        }
        const before = JSON.stringify(source);
        await assert.rejects(stage.cloneAndUpdateSave(0), failure === 'application' ? /Unknown function/ : /Write rejected/);
        assert.equal(JSON.stringify(source), before);
        assert.equal(stage.saveData.saves[1], undefined);
        assert.equal(stage.saveData.lastSaveSlot, 0);
    }
});

test('clone operations are serialized while persistence is pending', async () => {
    const { stage } = fixture();
    publishUpdate(stage);
    let finish!: () => void;
    Object.assign(stage, { messenger: { updateChatState: () => new Promise(resolve => {
        finish = () => resolve({ success: true, error: null });
    }) } });
    const pending = stage.cloneAndUpdateSave(0);
    await assert.rejects(stage.cloneAndUpdateSave(0), /already in progress/);
    finish();
    assert.equal(await pending, 1);
});

test('snapshots survive JSON reload, and menu and new-game settings use the latest configuration', async () => {
    const { stage } = fixture();
    publishUpdate(stage);
    stage.saveData = JSON.parse(JSON.stringify(stage.saveData));
    assert.equal(stage.getConfiguration().title, 'Old title');
    const html = renderToStaticMarkup(<TooltipProvider>
        <MenuScreen stage={() => stage} setScreenType={() => {}} />
    </TooltipProvider>);
    assert.match(html, /New title/);
    assert.doesNotMatch(html, /Old title/);
    assert.equal(stage.getConfiguration().title, 'Old title');
    stage.getPublishedConfiguration().controls = [new Control({ id: 'new-setting', type: 'settings', statId: 'new-stat' })];
    stage.getPublishedConfiguration().functions.push({
        id: 'label', name: 'Published label', description: '', script: 'return "Latest setting label";', returnType: 'text',
    });
    stage.getPublishedConfiguration().controls[0].label = '{{Published label}}';
    const settings = renderToStaticMarkup(<TooltipProvider>
        <SettingsScreen stage={() => stage} isNewGame onCancel={() => {}} onConfirm={() => {}} setScreenType={() => {}} />
    </TooltipProvider>);
    assert.match(settings, /Latest setting label/);
});

test('SaveLoadScreen offers clone and update for outdated player and creator saves in both modes', () => {
    const { stage, source } = fixture();
    publishUpdate(stage);
    const render = (mode: 'save' | 'load') => renderToStaticMarkup(<TooltipProvider>
        <SaveLoadScreen stage={() => stage} mode={mode} onClose={() => {}} />
    </TooltipProvider>);
    const updateButtons = (html: string) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
        .filter(match => match[2].includes('Clone and Update'));
    for (const mode of ['save', 'load'] as const) {
        const buttons = updateButtons(render(mode));
        assert.equal(buttons.length, 1);
        assert.doesNotMatch(buttons[0][1], /disabled/);
        stage.isOwner = true;
        assert.equal(updateButtons(render(mode)).length, 1);
        stage.isOwner = false;
    }
    stage.saveData.saves.fill(source);
    const fullSlotButtons = updateButtons(render('load'));
    assert.equal(fullSlotButtons.length, 10);
    fullSlotButtons.forEach(button => {
        assert.match(button[1], /disabled=""/);
        assert.match(button[2], /empty slot required/);
    });
    stage.saveData.saves[9] = undefined;
    const openSlotButtons = updateButtons(render('load'));
    assert.equal(openSlotButtons.length, 9);
    openSlotButtons.forEach(button => assert.doesNotMatch(button[1], /disabled/));
    source.configuration!.versionId = 'new-version';
    assert.doesNotMatch(render('load'), /Clone and Update/);
});

test('creator draft rule edits update only the active snapshot and do not apply content', () => {
    const { stage, source } = fixture();
    stage.saveData.saves[1] = JSON.parse(JSON.stringify(source));
    stage.isOwner = true;
    const other = JSON.stringify(stage.saveData.saves[1]);
    const actor = source.actors.actor;
    stage.updateConfiguration({
        title: 'Unpublished title', timeMode: 'phase', dateMode: 'turnBased', useEvents: false,
        universalSchedule: { place: [[]] },
        functions: [{ id: 'fn', name: 'Draft function', description: '', script: 'return 42;', returnType: 'number' }],
        controls: [new Control({ id: 'draft-control' })],
        actors: [new Actor({ id: 'actor', name: 'Unapplied actor' })],
        globalStats: [numberStat('score', 1), numberStat('added-stat', 2)],
    });
    assert.equal(stage.getConfiguration().title, 'Unpublished title');
    assert.equal(source.configuration?.title, 'Unpublished title');
    assert.equal(source.configuration?.functions[0].id, 'fn');
    assert.equal(source.configuration?.controls[0].id, 'draft-control');
    assert.equal(source.configuration?.timeMode, 'phase');
    assert.equal(source.configuration?.useEvents, false);
    assert.deepEqual(source.universalSchedule, { place: [[]] });
    assert.equal(source.globalStatValues?.['added-stat'], 2);
    assert.equal(source.actors.actor, actor);
    assert.equal(source.actors.actor.name, 'Old actor');
    assert.equal(source.configuration?.actors[0].name, 'Old actor');
    assert.equal(JSON.stringify(stage.saveData.saves[1]), other);
    assert.equal(stage.getConfiguration(stage.saveData.saves[1]!).title, 'Old title');
    assert.ok(stage.canUpdateSave(0));
});

test('creators clone and update from unpublished drafts without changing the source save', async () => {
    const { stage, source } = fixture();
    publishUpdate(stage);
    stage.saveData.saves[9] = JSON.parse(JSON.stringify(source));
    stage.isOwner = true;
    stage.getPublishedConfiguration().versionId = undefined;
    stage.updateConfiguration({ title: 'Unpublished draft' });
    stage.getSave();
    const original = JSON.stringify(source);
    assert.ok(stage.canUpdateSave(0));
    assert.equal(await stage.cloneAndUpdateSave(0), 1);
    const copy = stage.getSave();
    assert.equal(copy.configuration?.title, 'Unpublished draft');
    assert.equal(copy.configuration?.versionId, undefined);
    assert.equal(copy.actors.actor.name, 'Updated actor');
    assert.equal(copy.globalStatValues?.score, 7);
    assert.equal(stage.canUpdateSave(1), false);
    assert.equal(stage.canUpdateSave(0), true);
    assert.equal(JSON.stringify(source), original);
    stage.updateConfiguration({ title: 'Next edit' });
    assert.equal(copy.configuration?.title, 'Next edit');
    assert.equal(JSON.stringify(source), original);
    stage.loadSave(9);
    assert.equal(stage.getDateMode(), 'calendar');
    assert.equal(stage.areEventsEnabled(), true);
    assert.equal(stage.getTimeMode(), 'timeOfDay');
    assert.equal(getActiveTimeMode(), 'timeOfDay');
    assert.equal(stage.getConfiguration(stage.getSave()).functions.length, 0);
    assert.equal(stage.getConfiguration().functions[0].id, 'fn');
    assert.throws(() => stage.resolveValue('function:fn', 'number'), /Unknown function/);
    assert.equal(stage.getVisibleControls('actorCard').length, 0);
    assert.equal(JSON.stringify(source), original);
});

test('global apply replaces the current slot with all draft content even with no free slots and no version GUID', async () => {
    const { stage, source, persisted } = fixture();
    publishUpdate(stage);
    stage.isOwner = true;
    stage.getPublishedConfiguration().versionId = undefined;
    stage.saveData.saves.fill(source);
    const original = JSON.stringify(source);
    await stage.applyConfigurationToSave();
    const applied = stage.getSave();
    assert.equal(stage.saveData.lastSaveSlot, 0);
    assert.equal(stage.saveData.saves.filter(Boolean).length, 10);
    assert.equal(persisted.length, 1);
    assert.equal(applied.actors.actor.name, 'Updated actor');
    assert.equal(applied.actors.player.name, 'My player');
    assert.equal(applied.atlas.place.name, 'Updated place');
    assert.equal(applied.inventory[0].name, 'Updated item');
    assert.equal(applied.maps[0].name, 'Updated map');
    assert.equal(applied.lorebook?.find(entry => entry.id === 'lore')?.content, 'Updated lore');
    assert.equal(applied.configuration?.functions[0].id, 'fn');
    assert.equal(applied.configuration?.controls[0].id, 'new-control');
    assert.equal(applied.configuration?.versionId, undefined);
    assert.equal(applied.globalStatValues?.score, 7);
    assert.equal(applied.currentDate, source.currentDate);
    assert.deepEqual(applied.timeline, source.timeline);
    assert.equal(stage.canUpdateSave(0), false);
    assert.equal(JSON.stringify(source), original);
    stage.saveData.saves.slice(1).forEach(save => assert.equal(save, source));
    await stage.applyConfigurationToSave();
    assert.equal(stage.getSave().actors.actor.name, 'Updated actor');
});

test('only creators with an existing current save can use global apply', async () => {
    const { stage } = fixture();
    await assert.rejects(stage.applyConfigurationToSave(), /Only creators/);
    stage.isOwner = true;
    stage.saveData.saves[0] = undefined;
    await assert.rejects(stage.applyConfigurationToSave(), /existing save/);
});

test('failed global apply leaves the original current slot untouched and is retryable', async () => {
    const { stage, source } = fixture();
    publishUpdate(stage);
    stage.isOwner = true;
    let fail = true;
    Object.assign(stage, { messenger: { updateChatState: async () => ({ success: !fail, error: 'Write rejected' }) } });
    const before = JSON.stringify(source);
    await assert.rejects(stage.applyConfigurationToSave(), /Write rejected/);
    assert.equal(stage.saveData.saves[0], source);
    assert.equal(JSON.stringify(source), before);
    assert.equal(stage.saveData.saves[1], undefined);
    fail = false;
    await stage.applyConfigurationToSave();
    assert.equal(stage.getSave().actors.actor.name, 'Updated actor');
});

test('global apply and clone cannot overlap', async () => {
    const { stage } = fixture();
    publishUpdate(stage);
    stage.isOwner = true;
    let finish!: () => void;
    Object.assign(stage, { messenger: { updateChatState: () => new Promise(resolve => {
        finish = () => resolve({ success: true, error: null });
    }) } });
    const pending = stage.applyConfigurationToSave();
    await assert.rejects(stage.cloneAndUpdateSave(0), /already in progress/);
    await assert.rejects(stage.applyConfigurationToSave(), /already in progress/);
    finish();
    await pending;
    assert.equal(stage.saveData.lastSaveSlot, 0);
    assert.equal(stage.saveData.saves[1], undefined);
});

test('Content Management places Apply beside Publish only for creators and requires a current save', () => {
    const previousStorage = globalThis.sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true, value: { getItem: () => null },
    });
    try {
        const { stage } = fixture();
        const render = () => renderToStaticMarkup(<TooltipProvider>
            <ContentManagementScreen stage={() => stage} onClose={() => {}} />
        </TooltipProvider>);
        assert.doesNotMatch(render(), />Publish<\/button>|>Apply<\/button>/);
        stage.isOwner = true;
        const html = render();
        const buttons = [...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)];
        const publishIndex = buttons.findIndex(button => button[2] === 'Publish');
        assert.ok(publishIndex >= 0);
        assert.equal(buttons[publishIndex + 1][2], 'Apply');
        assert.doesNotMatch(buttons[publishIndex + 1][1], /disabled/);
        stage.saveData.saves[0] = undefined;
        const noSaveHtml = render();
        const apply = [...noSaveHtml.matchAll(/<button\b([^>]*)>Apply<\/button>/g)][0];
        assert.match(apply[1], /disabled=""/);
    } finally {
        if (previousStorage === undefined) Reflect.deleteProperty(globalThis, 'sessionStorage');
        else Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: previousStorage });
    }
});
