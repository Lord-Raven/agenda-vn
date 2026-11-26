import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareControlPriority, Control, controlReference, isBarContentControl, isControlAvailable } from '../src/content/Control';
import { cloneStat, StatUpdateAction } from '../src/content/Stat';
import { ConditionCollection, variableContentValue } from '../src/content/Condition';
import { movedContentValue } from '../src/content/Function';

test('drag/drop action lists clone and serialize all action types and discard legacy functions', () => {
    const onDragActions: StatUpdateAction[] = [{
        id: 'clear', kind: 'stat', targetType: 'actor', targetId: variableContentValue('actor'),
        statId: 'Contents', operation: 'set', value: [],
    }];
    const onDropActions: StatUpdateAction[] = [
        { id: 'invoke', kind: 'function', functionId: 'drop', args: { Party: [movedContentValue('actor')] } },
        { id: 'scene', kind: 'skit', locationId: 'park', actorIds: [variableContentValue('actor'), movedContentValue('actor')] },
    ];
    const original = new Control({ type: 'dragDropDisplay', onDragActions, onDropActions });
    const restored = new Control(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(restored.onDragActions, onDragActions);
    assert.deepEqual(restored.onDropActions, onDropActions);
    assert.notEqual(original.onDragActions[0], onDragActions[0]);
    assert.notEqual(original.onDropActions[0], onDropActions[0]);
    assert.notEqual(original.onDropActions[1], onDropActions[1]);
    const legacy = new Control(JSON.parse(JSON.stringify({ onDragFunction: 'function:drag', onDropFunction: 'function:drop' })));
    assert.deepEqual(legacy.onDragActions, []);
    assert.deepEqual(legacy.onDropActions, []);
    assert.equal('onDragFunction' in legacy, false);
    assert.equal('onDropFunction' in legacy, false);
});

test('drop validity conditions survive cloning and export without the legacy validator', () => {
    const dropValidityConditions: ConditionCollection[] = [[{
        type: 'globalStat', statId: 'enabled', comparison: 'equals', value: true,
    }]];
    const original = new Control({ type: 'dragDropDisplay', dropValidityConditions });
    const restored = new Control(JSON.parse(JSON.stringify({ ...original, dropValidationFunction: 'function:old' })));
    assert.deepEqual(restored.dropValidityConditions, dropValidityConditions);
    assert.notEqual(restored.dropValidityConditions[0][0], dropValidityConditions[0][0]);
    assert.equal('dropValidationFunction' in restored, false);
    assert.deepEqual(new Control().dropValidityConditions, []);
});

test('drag/drop appearance defaults and explicit empty text survive import and export', () => {
    const legacy = new Control(JSON.parse('{}'));
    assert.equal(legacy.emptyText, 'None');
    assert.equal(legacy.showBorder, false);
    assert.equal(legacy.showBackground, false);
    const original = new Control({ type: 'dragDropDisplay', emptyText: '', showBorder: true,
        borderColor: '#123456', showBackground: true, backgroundColor: '#abcdef' });
    const restored = new Control(JSON.parse(JSON.stringify(original)));
    assert.equal(restored.emptyText, '');
    assert.equal(restored.showBorder, true);
    assert.equal(restored.borderColor, '#123456');
    assert.equal(restored.showBackground, true);
    assert.equal(restored.backgroundColor, '#abcdef');
    assert.equal(new Control({ emptyText: undefined }).emptyText, 'None');
});

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

test('marker content lists normalize legacy kinds to mixed without losing their values', () => {
    for (const kind of ['actor', 'item', 'location', 'string', 'mixed'] as const) {
        const values = ['actor-id', 'item-id', 'location-id', 'function:contents'];
        const control = new Control({ type: 'marker', contentList: { kind, values } });
        const restored = new Control(JSON.parse(JSON.stringify(control)));
        assert.deepEqual(restored.contentList, { kind: 'mixed', values });
        assert.equal(new Control({ type: 'button', contentList: { kind, values } }).contentList.kind, kind);
    }
});

test('marker card selection survives serialization and discards the obsolete pop-up property', () => {
    const restored = new Control(JSON.parse(JSON.stringify({
        type: 'marker', cardControlId: 'card', popupControlId: 'old-popup',
    })));
    assert.equal(restored.cardControlId, 'card');
    assert.equal('popupControlId' in restored, false);
    assert.equal(new Control({ type: 'marker' }).cardControlId, '');
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

test('portrait scales default to full size, clamp to 50–100%, and survive export/import', () => {
    assert.equal(new Control({ type: 'card' }).portraitScale, 100);
    for (const [portraitScale, expected] of [[25, 50], [50, 50], [75, 75], [100, 100], [150, 100], [NaN, 100], [Infinity, 100]]) {
        const control = new Control({ type: 'card', portraitScale });
        assert.equal(control.portraitScale, expected);
        assert.equal(new Control(JSON.parse(JSON.stringify(control))).portraitScale, expected);
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

test('content-bound stat displays use standalone placement and preserve scope and source through export', () => {
    for (const placement of [undefined, 'top', 'bottom', 'standalone']) {
        const control = new Control({ type: 'statDisplay', placement, contentType: 'item', displaySource: 'itemStat:quality' });
        const restored = new Control(JSON.parse(JSON.stringify(control)));
        assert.equal(restored.type, 'statDisplay');
        assert.equal(restored.placement, 'standalone');
        assert.equal(restored.contentType, 'item');
        assert.equal(restored.displaySource, 'itemStat:quality');
    }
});

test('stat displays normalize content types and reject self-referential sources', () => {
    assert.equal(new Control({}).contentType, 'actor');
    assert.equal(new Control({ type: 'statDisplay' }).contentType, undefined);
    assert.equal(new Control({ type: 'dragDropDisplay' }).contentType, undefined);
    assert.equal(new Control({ type: 'dragDropDisplay', contentType: 'item' }).contentType, 'item');
    assert.equal(new Control(JSON.parse(JSON.stringify(new Control({ type: 'dragDropDisplay' })))).contentType, undefined);
    assert.equal(new Control({ contentType: 'bogus' }).contentType, 'actor');
    assert.equal(new Control({}).displaySource, '');
    assert.equal(new Control({ displaySource: 7 }).displaySource, '');
    assert.equal(new Control({ type: 'statDisplay', displaySource: controlReference('other') }).displaySource, '');
});

test('content-bound stat display availability binds variable rules to the attached entity', () => {
    const itemStats = [cloneStat({
        id: 'quality', name: 'Quality', type: 'number', default: 0, guidance: '',
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    })];
    const control = new Control({
        type: 'statDisplay',
        contentType: 'item',
        availabilityConditions: [[
            { type: 'contentStat', contentType: 'item', targetId: 'variable', statId: 'quality', comparison: 'greaterThan', value: 2 },
        ]],
    });
    assert.equal(isControlAvailable(control, { itemStats, currentItem: { id: 'sword', statMap: { quality: 3 } } }), true);
    assert.equal(isControlAvailable(control, { itemStats, currentItem: { id: 'stick', statMap: { quality: 1 } } }), false);
});

test('bars accept standalone displays and editors but not containers', () => {
    assert.equal(new Control({ type: 'time' }).type, 'time');
    assert.equal(isBarContentControl(new Control({ type: 'time' })), true);
    assert.equal(isBarContentControl(new Control({ type: 'statDisplay' })), true);
    assert.equal(isBarContentControl(new Control({ type: 'statDisplay', contentType: 'actor' })), true);
    assert.equal(isBarContentControl(new Control({ type: 'statEditor' })), true);
    assert.equal(isBarContentControl(new Control({ type: 'dragDropDisplay' })), true);
    assert.equal(isBarContentControl(new Control({ type: 'bar' })), false);
});
