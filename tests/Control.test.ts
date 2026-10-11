import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareControlPriority, Control, isControlAvailable } from '../src/content/Control';

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

test('actor stat displays always use actor-card placement and survive export/import', () => {
    for (const placement of [undefined, 'top', 'bottom', 'actorCard']) {
        const control = new Control({ type: 'actorStatDisplay', placement, statId: 'health' });
        const imported = new Control(JSON.parse(JSON.stringify(control)));
        assert.equal(imported.type, 'actorStatDisplay');
        assert.equal(imported.placement, 'actorCard');
        assert.equal(imported.statId, 'health');
    }
    assert.equal(new Control({ type: 'button', placement: 'actorCard' }).placement, 'bottom');
});

test('actor-card availability binds identity and stat rules to the displayed actor', () => {
    const control = new Control({
        type: 'actorStatDisplay',
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
