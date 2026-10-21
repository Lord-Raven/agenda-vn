import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React, { ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchableOptionPicker, SearchableOptionPickerProps } from '../src/components/SearchableOptionPicker';

const renderOpenPicker = (props: SearchableOptionPickerProps, inspectPortal?: (children: ReactNode) => void) => {
    const useState = React.useState;
    const stateMock = mock.method(React, 'useState', (initial: unknown) =>
        useState(typeof initial === 'boolean' ? true : initial));
    const portalMock = mock.method(ReactDOM, 'createPortal', (children: ReactNode) => {
        inspectPortal?.(children);
        return children;
    });
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: {} } });
    try {
        return renderToStaticMarkup(<SearchableOptionPicker {...props} />);
    } finally {
        stateMock.mock.restore();
        portalMock.mock.restore();
        if (documentDescriptor) {
            Object.defineProperty(globalThis, 'document', documentDescriptor);
        } else {
            Reflect.deleteProperty(globalThis, 'document');
        }
    }
};

test('list picker shows every current element in selection order above search, independently of filtering', () => {
    const options = Array.from({ length: 8 }, (_, index) => ({
        key: `option-${index}`, label: `Element ${index}`, imageUrl: `portrait-${index}.png`,
    }));
    const values = [...options].reverse().map(option => option.key);
    const html = renderOpenPicker({
        multiple: true, options, values, initialSearch: 'no matching results', onChange: () => {},
    });
    const currentElementsStart = html.indexOf('aria-label="Current elements"');
    const searchStart = html.indexOf('<input');
    assert.ok(currentElementsStart >= 0 && searchStart > currentElementsStart);
    const currentElements = html.slice(currentElementsStart, searchStart);
    assert.match(currentElements, /Current elements \(8\)/);
    assert.equal((currentElements.match(/<button/g) || []).length, 8);
    assert.equal((currentElements.match(/<img/g) || []).length, 8);
    assert.doesNotMatch(currentElements, /Selection \d|>Element \d<\/span>/);
    assert.match(currentElements, /display:flex;flex-wrap:wrap/);
    values.forEach((key, index) => {
        assert.match(currentElements, new RegExp(`aria-label="Remove Element ${7 - index}" title="Element ${7 - index}"`));
        assert.match(currentElements, /width:22px;height:22px/);
        if (index > 0) {
            assert.ok(currentElements.indexOf(`src="portrait-${7 - index}.png"`)
                > currentElements.indexOf(`src="portrait-${8 - index}.png"`));
        }
    });
    assert.match(html.slice(searchStart), /0 results/);
    assert.doesNotMatch(html.slice(searchStart), /Selection \d/);
});

test('current elements use compact initials and custom avatars without visible names', () => {
    const html = renderOpenPicker({
        multiple: true, values: ['initials', 'custom'],
        options: [
            { key: 'initials', label: 'Alice' },
            { key: 'custom', label: 'Bob', renderAvatar: size => <img src="custom.png" width={size} height={size} alt="Bob" /> },
        ],
        onChange: () => {},
    });
    const currentElements = html.slice(html.indexOf('aria-label="Current elements"'), html.indexOf('<input'));
    assert.match(currentElements, />AL<\/span>/);
    assert.match(currentElements, /src="custom.png" width="22" height="22"/);
    assert.doesNotMatch(currentElements, />Alice<|>Bob<|Selection \d/);
});

test('empty list picker shows its empty label above search', () => {
    const html = renderOpenPicker({
        multiple: true, options: [], values: [], emptyLabel: 'No actors', onChange: () => {},
    });
    const currentElements = html.slice(html.indexOf('aria-label="Current elements"'), html.indexOf('<input'));
    assert.match(currentElements, /Current elements \(0\)/);
    assert.match(currentElements, /No actors/);
});

test('clicking a current element removes only that element', () => {
    const changes: Array<string | string[] | undefined> = [];
    let remove: (() => void) | undefined;
    const findCurrentButton = (children: ReactNode, inCurrentElements = false) => {
        React.Children.forEach(children, child => {
            if (!React.isValidElement<{
                children?: ReactNode;
                'aria-label'?: string;
                onClick?: () => void;
            }>(child)) return;
            const current = inCurrentElements || child.props['aria-label'] === 'Current elements';
            if (current && child.type === 'button' && !remove) remove = child.props.onClick;
            findCurrentButton(child.props.children, current);
        });
    };
    renderOpenPicker({
        multiple: true, values: ['second', 'first'],
        options: [{ key: 'first', label: 'First' }, { key: 'second', label: 'Second' }],
        onChange: value => changes.push(value),
    }, findCurrentButton);
    assert.ok(remove);
    remove();
    assert.deepEqual(changes, [['first']]);
});

test('single-value picker does not show a current-elements section', () => {
    const html = renderOpenPicker({
        options: [{ key: 'one', label: 'One' }], value: 'one', onChange: () => {},
    });
    assert.doesNotMatch(html, /Current elements/);
    assert.match(html, /<input/);
});
