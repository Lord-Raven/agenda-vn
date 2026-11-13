import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidElement, ReactElement } from 'react';
import { renderLoreIcons } from '../src/components/LoreIconText';

test('renderLoreIcons splits icon tokens into inline icon elements and passes plain text through', () => {
    assert.equal(renderLoreIcons('plain text'), 'plain text');
    assert.equal(renderLoreIcons(''), '');
    const parts = renderLoreIcons('Gold \uE000paid\uE001!') as (string | ReactElement)[];
    assert.equal(Array.isArray(parts), true);
    assert.equal(parts.length, 3);
    assert.equal(parts[0], 'Gold ');
    assert.equal(isValidElement(parts[1]), true);
    assert.equal((parts[1] as ReactElement<{ titleAccess: string }>).props.titleAccess, 'paid');
    assert.equal(parts[2], '!');
    const colored = renderLoreIcons('\uE000paid\uE002#ff0000\uE001') as ReactElement<{ titleAccess: string; sx: { color?: string } }>[];
    assert.equal(colored[0].props.titleAccess, 'paid');
    assert.equal(colored[0].props.sx.color, '#ff0000');
});
