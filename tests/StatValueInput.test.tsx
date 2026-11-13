import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import ReactDOM from 'react-dom';
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

test('numeric formula picker combines value editing and source insertion without closing', () => {
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => ({
        globalStats: [score],
        functions: [{
            id: 'bonus', name: 'Bonus', description: '', returnType: 'number', script: 'return arg("Amount");',
            parameters: [cloneStat({ ...score, id: 'amount', name: 'Amount', default: 3 })],
        }],
    } as ReturnType<Stage['getConfiguration']>);
    stage.getSave = () => ({ globalStatValues: {} } as ReturnType<Stage['getSave']>);
    const portalMock = mock.method(ReactDOM, 'createPortal', (children: React.ReactNode) => children);
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: {} } });
    let renderer: ReturnType<typeof create> | undefined;
    let value: StatValue = 5;
    const changes: StatValue[] = [];
    const onChange = (next: StatValue) => { value = next; changes.push(next); };
    try {
        act(() => { renderer = create(<StatValueInput stat={score} value={value} onChange={onChange} stage={stage} />); });
        const root = renderer!.root;
        const button = (label: string) => root.findAllByType('button').find(node =>
            node.props['aria-label'] === label || node.children.includes(label)
            || node.findAllByType('span').some(span => span.children.includes(label)))!;
        assert.equal(root.findAllByType('input').length, 0);
        assert.ok(button('Edit formula value').findAllByType('span').some(span => span.children.includes('5')));
        act(() => button('Edit formula value').props.onClick());
        const input = () => root.findAllByType('input').find(node => node.props['aria-label'] === 'Formula value')!;
        assert.equal(root.findAllByType('input').length, 2);
        act(() => input().props.onChange({ target: { value: '5 +  * 2' } }));
        act(() => input().props.onSelect({ currentTarget: { selectionStart: 4, selectionEnd: 4 } }));
        act(() => button('Score').props.onClick());
        assert.equal(input().props.value, '5 + {{"globalStat:score"}} * 2');
        assert.ok(button('Close'));
        act(() => input().props.onBlur());
        assert.equal(value, '5 + {{"globalStat:score"}} * 2');
        act(() => input().props.onChange({ target: { value: '5 + ' } }));
        act(() => input().props.onSelect({ currentTarget: { selectionStart: 4, selectionEnd: 4 } }));
        act(() => button('Bonus(Amount)').props.onClick());
        assert.ok(button('Confirm'));
        act(() => button('Confirm').props.onClick());
        assert.equal(input().props.value, `5 + {{${JSON.stringify(functionReference('bonus', { amount: 3 }))}}}`);
        act(() => input().props.onBlur());
        assert.equal(value, input().props.value);
        const errors = mock.method(console, 'error', () => {});
        try {
            act(() => input().props.onChange({ target: { value: '5 +' } }));
            act(() => input().props.onBlur());
            assert.equal(changes.length, 2);
            assert.ok(root.findByProps({ role: 'alert' }));
        } finally {
            errors.mock.restore();
        }
    } finally {
        if (renderer) act(() => renderer!.unmount());
        portalMock.mock.restore();
        if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
        else Reflect.deleteProperty(globalThis, 'document');
    }
});

test('numeric formula fields render as a picker button only, offering typed sources', () => {
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

    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<StatValueInput stat={score} value={'{{Score}} * 2'} onChange={() => {}} stage={stage} />); });
    try {
        const picker = renderer.root.findByType(SearchableOptionPicker);
        assert.equal(picker.props.functionType, 'number');
        // Closed state is a single button showing the current formula; no inline blank.
        assert.equal(renderer.root.findAllByType('input').length, 0);
        const button = renderer.root.findAllByType('button').find(node => node.props['aria-label'] === 'Edit formula value')!;
        assert.ok(button.findAllByType('span').some(span => span.children.includes('{{Score}} * 2')));
    } finally {
        act(() => renderer.unmount());
    }
});
