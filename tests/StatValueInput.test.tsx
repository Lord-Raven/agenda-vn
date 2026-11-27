import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import ReactDOM from 'react-dom';
import { act, create } from 'react-test-renderer';
import { StatValueInput } from '../src/components/StatValueInput';
import { SearchableOptionPicker } from '../src/components/SearchableOptionPicker';
import { cloneStat, StatValue } from '../src/content/Stat';
import { boundStatReference, functionReference, globalStatReference, valuePickerOptions } from '../src/content/Function';
import { MovedContentContext, VariableContentContext } from '../src/components/VariableContentContext';
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

test('bound boolean, option-list, and text stats are available through value pickers', () => {
    const stage: Stage = Object.create(Stage.prototype);
    const flag = cloneStat({ ...score, id: 'flag', name: 'Flag', type: 'boolean', default: false });
    const choices = cloneStat({ ...score, id: 'choices', name: 'Choices', type: 'optionList', default: [], options: [
        { id: 'one', name: 'One', description: '' },
    ] });
    const text = cloneStat({ ...score, id: 'text', name: 'Text', type: 'text', default: '' });
    stage.getConfiguration = () => ({ globalStats: [], actorStats: [flag, choices, text], functions: [] } as ReturnType<Stage['getConfiguration']>);
    stage.getSave = () => ({ globalStatValues: {} } as ReturnType<Stage['getSave']>);
    for (const stat of [flag, choices, text]) {
        const source = boundStatReference('actor', stat.id, 'moved');
        let changed: StatValue | undefined;
        let renderer: ReturnType<typeof create>;
        act(() => { renderer = create(
            <MovedContentContext.Provider value={{ kinds: ['actor'], label: 'Dropped Element' }}>
                <StatValueInput stat={stat} value={stat.default} onChange={value => { changed = value; }} stage={stage} />
            </MovedContentContext.Provider>,
        ); });
        try {
            const picker = renderer!.root.findByType(SearchableOptionPicker);
            act(() => picker.props.onChange(stat.type === 'optionList' ? [source] : source));
            assert.deepEqual(changed, stat.type === 'optionList' ? [source] : source);
        } finally {
            act(() => renderer!.unmount());
        }
    }
});

test('numeric picker inserts Variable and Dropped Element stat references into the formula', () => {
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => ({ globalStats: [score], actorStats: [score], functions: [] } as ReturnType<Stage['getConfiguration']>);
    stage.getSave = () => ({ globalStatValues: {} } as ReturnType<Stage['getSave']>);
    let changed: StatValue | undefined;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(
        <VariableContentContext.Provider value="actor">
            <MovedContentContext.Provider value={{ kinds: ['actor'], label: 'Dropped Element' }}>
                <StatValueInput stat={score} value="" onChange={value => { changed = value; }} stage={stage} />
            </MovedContentContext.Provider>
        </VariableContentContext.Provider>,
    ); });
    try {
        const picker = renderer!.root.findByType(SearchableOptionPicker);
        const input = () => renderer!.root.findByType(SearchableOptionPicker).props.valueEditor.props.children[0];
        act(() => picker.props.onChange(boundStatReference('actor', 'score')));
        act(() => input().props.onBlur());
        assert.equal(changed, '{{"variableStat:actor:score"}}');
        act(() => input().props.onChange({ target: { value: '' } }));
        act(() => input().props.onSelect({ currentTarget: { selectionStart: 0, selectionEnd: 0 } }));
        act(() => picker.props.onChange(boundStatReference('actor', 'score', 'moved')));
        act(() => input().props.onBlur());
        assert.equal(changed, '{{"movedStat:actor:score"}}');
    } finally {
        act(() => renderer!.unmount());
    }
});
