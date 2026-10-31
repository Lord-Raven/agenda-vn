import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Actor, getLinkedActorLore, supplementActorLoreTriggers, upsertActorLoreEntry } from '../src/content/Actor';
import { createLoreEntry, Lore } from '../src/content/Lore';
import { Stage, GameConfiguration, SaveType } from '../src/Stage';

const fixture = (lorebook: Lore[] = [], actorProps: Partial<Actor> = {}) => {
    const actor = new Actor({ id: 'actor', name: 'Alexandra Smith', displayName: '', profile: 'Profile text.', ...actorProps });
    const save: SaveType = {
        playerId: '', actors: { [actor.id]: actor }, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {}, lorebook,
    } as SaveType;
    const configuration = { actors: [actor], lorebook: [] } as unknown as GameConfiguration;
    const stage: Stage = Object.create(Stage.prototype);
    stage.getSave = () => save;
    stage.getConfiguration = () => configuration;
    stage.saveGame = mock.fn();
    return { actor, save, stage };
};

const characterEntry = (title: string, content: string = 'Existing lore.', triggers: string[] = []) =>
    createLoreEntry({ type: 'character', title, content, triggers });

test('upsertActorLoreEntry reuses the entry titled with the old canonical name instead of creating a duplicate', () => {
    const entry = characterEntry('Alexandra Smith', 'Existing lore.', ['Alexandra', 'Smith']);
    const { actor, save, stage } = fixture([entry]);

    actor.name = 'Zara Vex';
    actor.profile = 'Updated profile.';
    upsertActorLoreEntry(actor, 'Alexandra Smith', stage);

    assert.equal(save.lorebook?.length, 1);
    assert.equal(entry.title, 'Zara Vex');
    assert.equal(entry.content, 'Updated profile.');
    assert.equal(actor.loreId, entry.id);
    assert.ok(entry.triggers.includes('Zara'));
    assert.ok(entry.triggers.includes('Vex'));
    assert.ok(!entry.triggers.includes('Alexandra'));
});

test('upsertActorLoreEntry links the actor to a newly created entry and includes display name triggers', () => {
    const { actor, save, stage } = fixture([], { displayName: 'Mysterious Stranger' });

    actor.name = 'Zara Vex';
    upsertActorLoreEntry(actor, 'Alexandra Smith', stage);

    assert.equal(save.lorebook?.length, 1);
    const entry = save.lorebook![0];
    assert.equal(entry.title, 'Zara Vex');
    assert.equal(actor.loreId, entry.id);
    assert.ok(entry.triggers.includes('Zara'));
    assert.ok(entry.triggers.includes('Mysterious'));
    assert.ok(entry.triggers.includes('Stranger'));

    // A repeat upsert must reuse the linked entry rather than create another.
    upsertActorLoreEntry(actor, 'Zara Vex', stage);
    assert.equal(save.lorebook?.length, 1);
});

test('supplementActorLoreTriggers adds display name triggers without retitling or rewriting the entry', () => {
    const entry = characterEntry('Alexandra Smith', 'Existing lore.', ['Alexandra', 'Smith']);
    const { actor, save, stage } = fixture([entry], { loreId: entry.id });

    actor.displayName = 'Mysterious Stranger';
    supplementActorLoreTriggers(actor, stage);

    assert.equal(save.lorebook?.length, 1);
    assert.equal(entry.title, 'Alexandra Smith');
    assert.equal(entry.content, 'Existing lore.');
    assert.deepEqual(entry.triggers, ['Alexandra', 'Smith', 'Mysterious', 'Stranger']);
});

test('supplementActorLoreTriggers never creates a lore entry when none is linked', () => {
    const { actor, save, stage } = fixture([]);

    actor.displayName = 'Mysterious Stranger';
    supplementActorLoreTriggers(actor, stage);

    assert.equal(save.lorebook?.length, 0);
});

test('getLinkedActorLore falls back to the provided old name when the current name no longer matches', () => {
    const entry = characterEntry('Alexandra Smith');
    const { actor, stage } = fixture([entry]);

    actor.name = 'Zara Vex';
    const linked = getLinkedActorLore(actor, stage, false, 'Alexandra Smith');

    assert.equal(linked, entry);
    assert.equal(actor.loreId, entry.id);
});
