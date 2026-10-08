import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Stage } from '../src/Stage';
import { Actor } from '../src/content/Actor';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { buildCreatorNotesHtml } from '../src/screens/CreatorNotesHtml';

const player = new Actor({ name: 'Player' });
const stage = {
    getPlayerActor: () => player,
    getUiSettings: () => DEFAULT_UI_SETTINGS,
} as Stage;

const makeActors = (count: number) => Array.from({ length: count }, (_, index) =>
    new Actor({ id: `actor-${index}`, name: `Character ${index}` }));

const buildHtml = (activeActors: Actor[], castActorIds?: string[]) => buildCreatorNotesHtml({
    stage,
    activeActors,
    activeLocations: [],
    castActorIds,
});

const portraitSize = (html: string) => {
    const match = html.match(/--cast-portrait-size: (\d+)px;/);
    assert.ok(match, 'cast grid must define its portrait size');
    return Number(match[1]);
};

test('portraits shrink with cast size and stay at 128px for casts of 30 or more', () => {
    assert.equal(portraitSize(buildHtml(makeActors(1))), 256);
    assert.equal(portraitSize(buildHtml(makeActors(15))), 194);
    assert.equal(portraitSize(buildHtml(makeActors(29))), 132);
    for (const count of [30, 31, 100, 101]) {
        assert.equal(portraitSize(buildHtml(makeActors(count))), 128);
    }
    let previous = 257;
    for (let count = 1; count <= 30; count++) {
        const size = portraitSize(buildHtml(makeActors(count)));
        assert.ok(size < previous && size >= 128 && size <= 256);
        previous = size;
    }
});

test('scaling counts selected, named, non-player actors actually rendered', () => {
    const actors = makeActors(40);
    const selectedIds = actors.slice(0, 2).map(actor => actor.id);
    const html = buildHtml([...actors, player, new Actor({ name: '' })], [...selectedIds, player.id]);
    assert.equal(portraitSize(html), 252);
    assert.equal((html.match(/data-cast-item/g) || []).length, 2);
    assert.equal(portraitSize(buildHtml([actors[0], player, new Actor({ name: '' })])), 256);
    assert.equal(portraitSize(buildHtml(actors, [])), 128);
});

test('empty casts keep the empty-state message and large casts keep the 100-actor limit', () => {
    const emptyHtml = buildHtml([]);
    assert.equal(portraitSize(emptyHtml), 256);
    assert.ok(emptyHtml.includes('No active actors are configured for this game yet.'));
    assert.equal((buildHtml(makeActors(110)).match(/data-cast-item/g) || []).length, 100);
});

test('the grid and square portraits share responsive sizing without a fixed mobile override', () => {
    const html = buildHtml(makeActors(2));
    assert.ok(html.includes('minmax(min(100%, calc(var(--cast-portrait-size) + 10px)), 1fr)'));
    assert.ok(html.includes('width: min(var(--cast-portrait-size), calc(100% - 2px)); height: auto; aspect-ratio: 1;'));
    assert.equal((html.match(/\.creator-notes \.cast-portrait \{/g) || []).length, 1);
});

test('exported tooltips fit their text, wrap at 360px, and include edge-aware placement', () => {
    const html = buildHtml(makeActors(2));
    assert.ok(html.includes('width: max-content;'));
    assert.ok(html.includes('max-width: min(360px,'));
    assert.ok(html.includes('overflow-wrap: anywhere;'));
    assert.ok(html.includes('position-anchor: var(--cast-anchor);'));
    assert.ok(html.includes('anchor-scope: all;'));
    assert.ok(html.includes('position-try-fallbacks: --cast-top-right, --cast-top-left, bottom, --cast-bottom-right, --cast-bottom-left;'));
    assert.ok(html.includes('max-height: min(320px, calc(100% - 24px));'));
    assert.ok(html.includes('anchor-name: --cast-0;'));
    assert.ok(html.includes('anchor-name: --cast-1;'));
    assert.ok(!html.includes('900px'));
});
