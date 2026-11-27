import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { ReactNode } from 'react';
import { Popper, Tooltip } from '@mui/material';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { HoverCardProvider, HoverCardTooltip } from '../src/components/HoverCardTooltip';

test('hover cards delay dismissal, stay open on re-entry, and replace one another', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { addEventListener() {}, removeEventListener() {} },
    });
    let renderer: ReactTestRenderer | undefined;
    try {
        act(() => {
            renderer = create(<HoverCardProvider>
                <HoverCardTooltip title="First"><button>First</button></HoverCardTooltip>
                <HoverCardTooltip title="Second"><button>Second</button></HoverCardTooltip>
            </HoverCardProvider>);
        });
        const tooltips = () => renderer!.root.findAllByType(Tooltip);
        const button = (index: number) => tooltips()[index].findByType('button');
        const hover = (index: number) => act(() => button(index).props.onMouseOver({ type: 'mouseover' }));
        const leave = (index: number) => act(() => button(index).props.onMouseLeave({ type: 'mouseleave' }));
        const tick = (ms: number) => act(() => t.mock.timers.tick(ms));

        assert.equal(tooltips()[0].props.leaveDelay, 1000);
        hover(0);
        assert.equal(tooltips()[0].props.open, true);
        leave(0);
        tick(999);
        assert.equal(tooltips()[0].props.open, true);
        act(() => tooltips()[0].findByType(Popper).props.onMouseOver({ type: 'mouseover' }));
        tick(1);
        assert.equal(tooltips()[0].props.open, true);
        tick(1000);
        assert.equal(tooltips()[0].props.open, true);
        act(() => tooltips()[0].findByType(Popper).props.onMouseLeave({ type: 'mouseleave' }));
        hover(1);
        assert.equal(tooltips()[0].props.open, false);
        assert.equal(tooltips()[1].props.open, true);
        tick(1000);
        assert.equal(tooltips()[1].props.open, true);
        leave(1);
        tick(1000);
        assert.equal(tooltips()[1].props.open, false);
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
        else Reflect.deleteProperty(globalThis, 'document');
    }
});

test('nested hover cards keep their anchor open and dismiss pending ancestors', () => {
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { addEventListener() {}, removeEventListener() {} },
    });
    let renderer: ReactTestRenderer | undefined;
    const render = (mirror?: ReactNode) => <HoverCardProvider>
        <HoverCardTooltip title={<HoverCardTooltip title="Nested"><button>Nested</button></HoverCardTooltip>}>
            <button>Parent</button>
        </HoverCardTooltip>
        {mirror}
    </HoverCardProvider>;
    try {
        act(() => { renderer = create(render()); });
        const parentTitle = renderer!.root.findByType(Tooltip).props.title;
        act(() => renderer!.update(render(parentTitle)));
        const tooltips = () => renderer!.root.findAllByType(Tooltip);
        act(() => tooltips()[0].props.onOpen());
        act(() => tooltips()[1].props.onOpen());
        act(() => tooltips()[0].props.onClose());
        assert.equal(tooltips()[0].props.open, true);
        assert.equal(tooltips()[1].props.open, true);
        act(() => tooltips()[1].props.onClose());
        assert.equal(tooltips()[0].props.open, false);
        assert.equal(tooltips()[1].props.open, false);

        act(() => tooltips()[0].props.onOpen());
        act(() => tooltips()[1].props.onOpen());
        act(() => tooltips()[0].props.onClose());
        act(() => tooltips()[0].props.title.props.children.props.onMouseEnter());
        act(() => tooltips()[1].props.onClose());
        assert.equal(tooltips()[0].props.open, true);
        assert.equal(tooltips()[1].props.open, false);
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
        else Reflect.deleteProperty(globalThis, 'document');
    }
});
