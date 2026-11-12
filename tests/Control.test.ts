import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareControlPriority, Control, controlReference, isControlAvailable } from '../src/content/Control';
import { cloneStat } from '../src/content/Stat';

test('new and legacy controls default to equal width weights', () => {
    assert.equal(new Control({}).widthWeight, 1);
    assert.equal(new Control({ widthWeight: undefined }).widthWeight, 1);
});

test('width weight accepts positive finite numbers and normalizes invalid configuration values', () => {
    for (const widthWeight of [0.1, 0.5, 1, 2, 100]) {
        assert.equal(new Control({ widthWeight }).widthWeight, widthWeight);
    }
    for (const widthWeight of [0, -1, NaN, Infinity, -Infinity, null, '2']) {
        assert.equal(new Control({ widthWeight }).widthWeight, 1);
    }
});

test('width weight survives cloning and JSON export/import', () => {
    const original = new Control({ widthWeight: 2.5 });
    assert.equal(new Control({ ...original }).widthWeight, 2.5);
    assert.equal(new Control(JSON.parse(JSON.stringify(original))).widthWeight, 2.5);
});

test('picker sources preserve an empty restriction and dynamic references through export', () => {
    assert.equal(new Control({}).pickerSource, undefined);
    for (const pickerSource of [[], ['crew', 'globalStat:crew-list', 'function:available']]) {
        const original = new Control({ pickerSource });
        const restored = new Control(JSON.parse(JSON.stringify(original)));
        assert.deepEqual(restored.pickerSource, pickerSource);
        assert.notEqual(restored.pickerSource, pickerSource);
    }
});

test('new and legacy controls default to priority zero', () => {
    assert.equal(new Control({}).priority, 0);
    assert.equal(new Control({ name: 'Legacy control' }).priority, 0);
    assert.equal(new Control({ priority: undefined }).priority, 0);
});

test('priority accepts finite numbers and normalizes malformed configuration values', () => {
    for (const priority of [-10, 0, 1.5, 100]) {
        assert.equal(new Control({ priority }).priority, priority);
    }
    for (const priority of [NaN, Infinity, -Infinity, null, '2']) {
        assert.equal(new Control({ priority }).priority, 0);
    }
});

test('priority survives cloning and JSON export/import', () => {
    const original = new Control({ name: 'Control', priority: -3.5 });
    assert.equal(new Control({ ...original }).priority, original.priority);
    assert.equal(new Control(JSON.parse(JSON.stringify(original))).priority, original.priority);
});

test('controls sort by ascending priority with stable configuration order for ties', () => {
    const controls = [
        new Control({ name: 'Zulu', priority: 0 }),
        new Control({ name: 'Last', priority: 10 }),
        new Control({ name: 'Alpha', priority: 0 }),
        new Control({ name: 'First', priority: -1 }),
    ];
    const originalOrder = controls.map((control) => control.id);
    const sorted = [...controls].sort(compareControlPriority);
    assert.deepEqual(sorted.map((control) => control.name), ['First', 'Zulu', 'Alpha', 'Last']);
    assert.deepEqual(controls.map((control) => control.id), originalOrder);
});

test('priority ordering preserves placement and availability filtering', () => {
    const controls = [
        new Control({ name: 'Bottom', placement: 'bottom', priority: -100 }),
        new Control({ name: 'Inactive', placement: 'top', active: false, priority: -10 }),
        new Control({ name: 'Zulu', placement: 'top', priority: 0 }),
        new Control({ name: 'Alpha', placement: 'top', priority: 0 }),
        new Control({ name: 'First', placement: 'top', priority: -1 }),
    ];
    const visible = controls
        .filter((control) => control.placement === 'top' && isControlAvailable(control, {}))
        .sort(compareControlPriority);
    assert.deepEqual(visible.map((control) => control.name), ['First', 'Zulu', 'Alpha']);
});

test('cards always use standalone placement and survive export/import', () => {
    for (const placement of [undefined, 'top', 'bottom', 'standalone'] as const) {
        const control = new Control({ type: 'card', placement, contentType: 'actor', cardDetails: [controlReference('health')] });
        const imported = new Control(JSON.parse(JSON.stringify(control)));
        assert.equal(imported.type, 'card');
        assert.equal(imported.placement, 'standalone');
        assert.deepEqual(imported.cardDetails, [controlReference('health')]);
    }
});

test('card availability binds identity and stat rules to the displayed actor', () => {
    const control = new Control({
        type: 'card',
        availabilityConditions: [[
            { type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: 'alice' },
            { type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'health', comparison: 'greaterThan', value: 5 },
        ]],
    });

    assert.equal(isControlAvailable(control, { currentActor: { id: 'alice', statMap: { health: 6 } } }), true);
    assert.equal(isControlAvailable(control, { currentActor: { id: 'bob', statMap: { health: 6 } } }), false);
    assert.equal(isControlAvailable(control, { currentActor: { id: 'alice', statMap: { health: 5 } } }), false);
    control.active = false;
    assert.equal(isControlAvailable(control, { currentActor: { id: 'alice', statMap: { health: 6 } } }), false);
});

test('pop-up controls preserve their map selection and always use pop-up placement', () => {
    for (const placement of [undefined, 'top', 'bottom', 'popup']) {
        const control = new Control({ type: 'popup', placement, screenId: 'map', priority: -2 });
        const restored = new Control(JSON.parse(JSON.stringify(control)));
        assert.equal(restored.type, 'popup');
        assert.equal(restored.placement, 'popup');
        assert.equal(restored.screenId, 'map');
        assert.equal(restored.priority, -2);
    }
    assert.equal(new Control({ type: 'button', placement: 'popup' }).placement, 'bottom');
    assert.equal(new Control({}).screenId, '');
});

test('stat badges always use standalone placement and preserve content type and source through export', () => {
    for (const placement of [undefined, 'top', 'bottom', 'standalone']) {
        const control = new Control({ type: 'statBadge', placement, contentType: 'item', badgeSource: 'itemStat:quality' });
        const restored = new Control(JSON.parse(JSON.stringify(control)));
        assert.equal(restored.type, 'statBadge');
        assert.equal(restored.placement, 'standalone');
        assert.equal(restored.contentType, 'item');
        assert.equal(restored.badgeSource, 'itemStat:quality');
    }
    assert.equal(new Control({ type: 'button', placement: 'standalone' }).placement, 'bottom');
});

test('stat badges normalize malformed content types and reject self-referential sources', () => {
    assert.equal(new Control({}).contentType, 'actor');
    assert.equal(new Control({ contentType: 'bogus' }).contentType, 'actor');
    assert.equal(new Control({}).badgeSource, '');
    assert.equal(new Control({ badgeSource: 7 }).badgeSource, '');
    assert.equal(new Control({ type: 'statBadge', badgeSource: controlReference('other') }).badgeSource, '');
});

test('stat badge availability binds variable rules to the attached entity for any content type', () => {
    const itemStats = [cloneStat({
        id: 'quality', name: 'Quality', type: 'number', default: 0, guidance: '',
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    })];
    const control = new Control({
        type: 'statBadge',
        contentType: 'item',
        availabilityConditions: [[
            { type: 'contentStat', contentType: 'item', targetId: 'variable', statId: 'quality', comparison: 'greaterThan', value: 2 },
        ]],
    });
    assert.equal(isControlAvailable(control, { itemStats, currentItem: { id: 'sword', statMap: { quality: 3 } } }), true);
    assert.equal(isControlAvailable(control, { itemStats, currentItem: { id: 'stick', statMap: { quality: 1 } } }), false);
});
