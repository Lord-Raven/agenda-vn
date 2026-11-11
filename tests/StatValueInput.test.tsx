import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { StatValueInput } from '../src/components/StatValueInput';
import { SearchableOptionPicker } from '../src/components/SearchableOptionPicker';
import { cloneStat, StatValue } from '../src/content/Stat';
import { functionReference, globalStatReference, valuePickerOptions } from '../src/content/Function';
import { Stage } from '../src/Stage';

const score = cloneStat({
    id: 'score', name: 'Score', type: 'number', default: 0, guidance: '',
    llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
});

test('numeric formula fields offer typed sources and remain editable after selection', () => {
    const stage: Stage = Object.create(Stage.prototype);
    const configuration = {
        globalStats: [score, cloneStat({ ...score, id: 'text', type: 'text' })],
        functions: [
            { id: 'bonus', name: 'Bonus', description: '', returnType: 'number' as const, script: 'return 3;' },
            { id: 'greeting', name: 'Greeting', description: '', returnType: 'text' as const, script: 'return "Hi";' },
        ],
    };
    stage.getConfiguration = () => ({ ...configuration } as ReturnType<Stage['getConfiguration']>);
    stage.getSave = () => ({ globalStatValues: {} } as ReturnType<Stage['getSave']>);
    assert.deepEqual(valuePickerOptions(configuration, 'number').map(option => option.key),
        [functionReference('bonus'), globalStatReference('score')]);

    let value: StatValue = 0;
    const onChange = (next: StatValue) => { value = next; };
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<StatValueInput stat={score} value={value} onChange={onChange} stage={stage} />); });
    try {
        const picker = () => renderer.root.findByType(SearchableOptionPicker);
        assert.equal(picker().props.functionType, 'number');
        for (const reference of [globalStatReference('score'), functionReference('bonus', { amount: 2 })]) {
            act(() => picker().props.onChange(reference));
            assert.equal(value, reference);
            assert.equal(renderer.root.findByType('input').props.value, reference);
            act(() => renderer.update(<StatValueInput stat={score} value={value} onChange={onChange} stage={stage} />));
            assert.equal(picker().props.value, reference);
        }
        act(() => renderer.root.findByType('input').props.onChange({ target: { value: '{{Score}} * 2' } }));
        act(() => renderer.root.findByType('input').props.onBlur());
        assert.equal(value, '{{Score}} * 2');
        act(() => renderer.update(<StatValueInput stat={score} value={value} onChange={onChange} stage={stage} />));
        assert.equal(picker().props.value, undefined);
        act(() => renderer.root.findByType('input').props.onChange({ target: { value: '12' } }));
        act(() => renderer.root.findByType('input').props.onBlur());
        assert.equal(value, 12);
    } finally {
        act(() => renderer.unmount());
    }
});
