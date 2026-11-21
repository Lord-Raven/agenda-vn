import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Children, ComponentProps, isValidElement, ReactElement, ReactNode, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { BoxProps, PaperProps, Tooltip } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { GameConfiguration, Stage } from '../src/Stage';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { cloneStat } from '../src/content/Stat';
import { Control } from '../src/content/Control';
import { Screen as GameMap } from '../src/content/Screen';
import { Location } from '../src/content/Location';
import { Actor } from '../src/content/Actor';
import { PopupControl } from '../src/components/PopupControl';
import { TooltipProvider } from '../src/components/TooltipContext';
import { DefinedMapView } from '../src/screens/DefinedMapView';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';
import { createListSection } from '../src/content/Screen';
import { globalStatReference } from '../src/content/Function';
import { ListScreenView } from '../src/screens/ListScreenView';
import { ScreenDetailPanel } from '../src/screens/ScreenDetailPanel';
import { SearchableOptionPicker } from '../src/components/SearchableOptionPicker';
import { ContentCardControl } from '../src/components/ContentCardControl';
import { ControlManagementPanel } from '../src/screens/ControlManagementPanel';
import { CategorizedEntrySidebar } from '../src/components/CategorizedEntrySidebar';

const makeStage = () => {
    const configuration: GameConfiguration = {
        controls: [], screens: [],
        actors: [], locations: [], items: [], globalStats: [cloneStat({
            id: 'visible', name: 'Visible', type: 'boolean', default: true, guidance: '',
            llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
        })], actorStats: [],
        locationStats: [], itemStats: [], functions: [], backgroundImageUrl: '',
        universalSchedule: {}, lorebook: [], calendarEvents: [], globalStatValues: {}, statUpdateRules: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImagePrompt: '', startingDate: '2026-11-06', artStyle: '', creatorNotes: '',
        versionNotes: '', castActorIds: [], slideshowLocationIds: [], dateMode: 'calendar',
        timeMode: 'timeOfDay', useEvents: true,
    };
    const atlas: Record<string, Location> = {};
    const actors: Record<string, Actor> = {};
    const save = {
        screens: configuration.screens, atlas, actors, timeline: [],
        globalStatValues: { visible: true }, playerId: '', inventory: [],
        universalSchedule: {}, timestamp: 0,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.getScheduleContext = () => ({ globalStats: configuration.globalStats, globalStatValues: save.globalStatValues });
    stage.getSkitConditionState = () => undefined;
    return { stage, configuration, save };
};

const overlayElement = (stage: Stage) => {
    const result = PopupControl({ stage: () => stage, isVerticalLayout: false, onAction: () => {}, setScreenType: () => {} });
    assert.ok(isValidElement<ComponentProps<typeof AnimatePresence>>(result));
    assert.equal(result.type, AnimatePresence);
    return result.props.children;
};

const popupElement = (stage: Stage) => {
    const overlay = overlayElement(stage);
    if (!isValidElement<BoxProps>(overlay) || !isValidElement<PaperProps>(overlay.props.children)) {
        throw new Error('Expected a pop-up dialog');
    }
    return overlay.props.children;
};

const popupContent = (dialog: ReactElement<PaperProps>) => {
    const presence = dialog.props.children;
    assert.ok(isValidElement<ComponentProps<typeof AnimatePresence>>(presence));
    assert.equal(presence.type, AnimatePresence);
    assert.equal(presence.props.initial, false);
    assert.equal(presence.props.mode, 'wait');
    const content = presence.props.children;
    assert.ok(isValidElement<ComponentProps<typeof motion.div>>(content));
    return content;
};

const mapElement = <T extends object = ComponentProps<typeof DefinedMapView>,>(dialog: ReactElement<PaperProps>) => {
    const content = Children.toArray(popupContent(dialog).props.children)[1];
    if (!isValidElement<{ children: ReactNode }>(content) || !isValidElement<T>(content.props.children)) {
        throw new Error('Expected pop-up content');
    }
    return content.props.children;
};

test('popup uses an in-place, content-bounded overlay without a modal or focus trap', () => {
    const { stage, configuration } = makeStage();
    configuration.controls.push(new Control({ type: 'popup' }));
    const overlay = overlayElement(stage);
    assert.ok(isValidElement<BoxProps>(overlay));
    const html = renderToStaticMarkup(overlay);
    assert.match(html, /position:absolute;inset:0/);
    assert.match(html, /role="dialog" aria-modal="false"/);
    assert.doesNotMatch(html, /MuiModal|MuiBackdrop|aria-hidden|tabindex="-1"|position:fixed/);
});

test('shell visibility animates independently of keyed, fade-only content changes', () => {
    const { stage, configuration } = makeStage();
    const first = new Control({ type: 'popup', screenId: 'first' });
    const second = new Control({ type: 'popup', screenId: 'second' });
    configuration.controls.push(first);
    const overlay = overlayElement(stage);
    assert.ok(isValidElement<ComponentProps<typeof motion.div>>(overlay));
    assert.deepEqual(overlay.props.initial, { opacity: 0 });
    assert.deepEqual(overlay.props.animate, { opacity: 1 });
    assert.deepEqual(overlay.props.exit, { opacity: 0 });
    const firstContent = popupContent(popupElement(stage));
    assert.equal(firstContent.type, motion.div);
    assert.deepEqual(firstContent.props.initial, { opacity: 0 });
    assert.deepEqual(firstContent.props.animate, { opacity: 1 });
    assert.deepEqual(firstContent.props.exit, { opacity: 0 });

    configuration.controls.splice(0, 1, second);
    const nextOverlay = overlayElement(stage);
    assert.ok(isValidElement(nextOverlay));
    assert.equal(nextOverlay.key, overlay.key);
    const secondContent = popupContent(popupElement(stage));
    assert.notEqual(secondContent.key, firstContent.key);
    second.screenId = 'changed-map';
    assert.notEqual(popupContent(popupElement(stage)).key, secondContent.key);

    configuration.controls.length = 0;
    assert.equal(overlayElement(stage), undefined);
});

test('changing popup controls preserves the mounted dialog shell', () => {
    const { stage, configuration } = makeStage();
    configuration.controls.push(new Control({ type: 'popup', name: 'First' }));
    const render = () => <PopupControl stage={() => stage} isVerticalLayout={false} onAction={() => {}} setScreenType={() => {}} />;
    let renderer: ReturnType<typeof create> | undefined;
    act(() => { renderer = create(render()); });
    const mounted = renderer;
    if (!mounted) {
        throw new Error('Expected mounted popup');
    }
    const shell = mounted.root.findByProps({ role: 'dialog' });
    try {
        configuration.controls.splice(0, 1, new Control({ type: 'popup', name: 'Second' }));
        act(() => mounted.update(render()));
        assert.equal(mounted.root.findByProps({ role: 'dialog' }), shell);
    } finally {
        act(() => mounted.unmount());
    }
});

test('only the first eligible pop-up appears, with stable priority ties and live visibility changes', () => {
    const { stage, configuration, save } = makeStage();
    const map = new GameMap({ id: 'map' });
    configuration.screens.push(map);
    const conditional = new Control({
        name: 'Conditional', type: 'popup', screenId: 'map', priority: -1,
        availabilityConditions: [[{ type: 'globalStat', statId: 'visible', comparison: 'equals', value: true }]],
    });
    const first = new Control({ name: 'First tie', type: 'popup', screenId: 'map' });
    configuration.controls.push(
        new Control({ type: 'popup', screenId: 'map', active: false, priority: -100 }),
        new Control({ type: 'button', priority: -100 }),
        first, new Control({ name: 'Second tie', type: 'popup', screenId: 'map' }), conditional,
    );
    const originalOrder = configuration.controls.map(control => control.id);
    assert.equal(popupElement(stage).props['aria-labelledby'], `popup-control-${conditional.id}`);
    save.globalStatValues.visible = false;
    assert.equal(popupElement(stage).props['aria-labelledby'], `popup-control-${first.id}`);
    save.globalStatValues.visible = true;
    assert.equal(popupElement(stage).props['aria-labelledby'], `popup-control-${conditional.id}`);
    configuration.controls.forEach(control => { control.active = false; });
    assert.equal(overlayElement(stage), undefined);
    assert.deepEqual(configuration.controls.map(control => control.id), originalOrder);
});

test('selected maps bypass map visibility and priority; map links still use the shared renderer', () => {
    const { stage, configuration } = makeStage();
    const selected = new GameMap({ id: 'selected', name: 'Selected Map', priority: 100,
        availabilityConditions: [[{ type: 'globalStat', statId: 'visible', comparison: 'equals', value: false }]] });
    const other = new GameMap({ id: 'other', name: 'Other Map', priority: -100 });
    const hidden = new GameMap({ id: 'hidden', active: false });
    configuration.screens.push(other, hidden, selected);
    configuration.controls.push(new Control({ type: 'popup', screenId: selected.id }));
    const dialog = popupElement(stage);
    assert.equal(dialog.props.role, 'dialog');
    assert.equal(dialog.props['aria-modal'], false);
    const stopPropagation = mock.fn();
    const overlay = overlayElement(stage);
    assert.ok(isValidElement<BoxProps>(overlay));
    overlay.props.onKeyDown?.({ stopPropagation } as Parameters<NonNullable<BoxProps['onKeyDown']>>[0]);
    assert.equal(stopPropagation.mock.callCount(), 1);
    const element = mapElement(dialog);
    assert.equal(element.type, DefinedMapView);
    assert.equal(element.props.embedded, true);
    assert.equal(element.props.initialMapId, selected.id);
    assert.deepEqual(element.props.maps.map((map: GameMap) => map.id), ['other', 'selected']);
    const html = renderToStaticMarkup(<TooltipProvider>{element}</TooltipProvider>);
    assert.match(html, /Selected Map/);
    assert.doesNotMatch(html, /Other Map|Main menu|Manage configuration|100vw|100dvh/);
});

test('new marker controls use their name instead of a fixed default label', () => {
    const { stage, configuration } = makeStage();
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} } });
    let renderer: ReturnType<typeof create> | undefined;
    try {
        act(() => { renderer = create(<TooltipProvider><ControlManagementPanel stage={() => stage} /></TooltipProvider>); });
        const sidebar = renderer!.root.findByType(CategorizedEntrySidebar);
        const markers = sidebar.props.sections.find((section: { id: string }) => section.id === 'marker');
        act(() => sidebar.props.renderSectionAction(markers));
        assert.equal(configuration.controls[0].type, 'marker');
        assert.equal(configuration.controls[0].name, 'New Control');
        assert.equal(configuration.controls[0].label, '');
    } finally {
        if (renderer) act(() => renderer!.unmount());
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});

test('applying a map marker selection updates the map shown in a pop-up', () => {
    const { stage, configuration, save } = makeStage();
    const generic = new Control({ id: 'generic', name: 'New Control', type: 'marker' });
    const card = new Control({ id: 'card', type: 'card', contentType: 'location', label: '{{content:name}}' });
    const marker = new Control({ id: 'marker', name: 'Park Marker', type: 'marker', markerInputType: 'location', iconName: 'favorite', cardControlId: card.id });
    const popup = new Control({ type: 'popup', screenId: 'map' });
    const map = new GameMap({ id: 'map', links: [{ type: 'marker', markerControlId: generic.id, parentId: 'map', coordinates: { x: 0.5, y: 0.5 } }] });
    configuration.controls = [generic, marker, card, popup];
    configuration.screens = [map];
    save.screens = [new GameMap(map)];
    save.atlas.park = new Location({ id: 'park', name: 'Park' });
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    stage.saveGame = () => {};
    stage.showPriorityMessage = () => {};
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} } });
    const Editor = () => {
        const [, setRevision] = useState(0);
        return <TooltipProvider><ScreenDetailPanel screen={configuration.screens[0]} stage={() => stage} isCreatorMode
            onChange={() => setRevision(revision => revision + 1)} onDeactivate={() => {}} /></TooltipProvider>;
    };
    let editor: ReturnType<typeof create> | undefined;
    let renderer: ReturnType<typeof create> | undefined;
    try {
        act(() => { editor = create(<Editor />); });
        act(() => editor!.root.findByProps({ 'aria-label': 'Expand Markers' }).props.onClick());
        act(() => editor!.root.findByProps({ 'aria-label': 'Expand New Control' }).props.onClick());
        act(() => editor!.root.findByProps({ id: 'map-marker-control-map-0' }).props.onChange({ target: { value: marker.id } }));
        act(() => editor!.root.findByType(SearchableOptionPicker).props.onChange('park'));
        assert.equal(editor!.root.findByProps({ role: 'status' }).children.join(''), 'Not applied to active save');
        const apply = editor!.root.findAllByType('button').find(button => button.children.includes('Apply'));
        assert.ok(apply);
        act(() => apply.props.onClick());
        assert.equal(save.screens[0].links[0].markerControlId, marker.id);
        assert.equal(save.screens[0].links[0].content, 'park');
        assert.equal(editor!.root.findAllByProps({ role: 'status' }).length, 0);
        act(() => { renderer = create(<TooltipProvider><PopupControl stage={() => stage} isVerticalLayout={false} onAction={() => {}} setScreenType={() => {}} /></TooltipProvider>); });
        assert.ok(renderer!.root.findByProps({ 'aria-label': 'Park Marker' }));
        assert.ok(renderer!.root.findByProps({ 'data-testid': 'FavoriteBorderIcon' }));
        const tooltip = renderer!.root.findByType(Tooltip);
        assert.equal(tooltip.props.title.type, ContentCardControl);
        assert.equal(tooltip.props.title.props.control, card);
        assert.equal(tooltip.props.title.props.id, 'park');
    } finally {
        if (renderer) act(() => renderer!.unmount());
        if (editor) act(() => editor!.unmount());
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});

test('missing and unselected maps show explicit configuration errors', () => {
    const { stage, configuration } = makeStage();
    const control = new Control({ type: 'popup', screenId: 'missing' });
    configuration.controls.push(control);
    assert.match(renderToStaticMarkup(mapElement(popupElement(stage))), /role="alert".*missing/);
    control.screenId = '';
    assert.match(renderToStaticMarkup(mapElement(popupElement(stage))), /No Screen selected/);
});

test('pop-up Controls reuse List Screens and ignore Screen conditions', () => {
    const { stage, configuration, save } = makeStage();
    configuration.globalStats.push(cloneStat({
        id: 'crew', name: 'Crew', type: 'actorList', default: ['actor'], guidance: '',
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    }));
    save.actors = { actor: new Actor({ id: 'actor', name: 'List Actor' }) };
    Object.assign(save.globalStatValues, { crew: ['actor'] });
    const screen = new GameMap({
        type: 'list', name: 'Reusable List',
        availabilityConditions: [[{ type: 'globalStat', statId: 'visible', comparison: 'equals', value: false }]],
        sections: [{ ...createListSection(), header: 'Crew Header', contentSource: globalStatReference('crew') }],
    });
    configuration.screens.push(screen);
    configuration.controls.push(new Control({ type: 'popup', screenId: screen.id }));
    const element = mapElement<ComponentProps<typeof ListScreenView>>(popupElement(stage));
    assert.equal(element.type, ListScreenView);
    assert.equal(element.props.screen, screen);
    const html = renderToStaticMarkup(<TooltipProvider>{element}</TooltipProvider>);
    assert.match(html, /Crew Header/);
    assert.match(html, /List Actor/);
    configuration.controls.splice(0, 1, new Control({ type: 'popup', screenId: screen.id }));
    assert.equal(mapElement<ComponentProps<typeof ListScreenView>>(popupElement(stage)).props.screen, screen);
    screen.active = false;
    assert.match(renderToStaticMarkup(mapElement(popupElement(stage))), /missing or inactive/);
});

test('pop-up editor exposes maps, hides stat and width settings, and explains visibility behavior', () => {
    const { stage, configuration } = makeStage();
    configuration.screens.push(new GameMap({ id: 'map', name: 'Map Choice' }));
    const control = new Control({ type: 'popup', screenId: 'map' });
    const html = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
    assert.match(html, /value="popup" selected="">Pop-up/);
    assert.match(html, /value="map" selected="">Map Choice/);
    assert.match(html, /cannot be dismissed/);
    assert.match(html, /top and bottom status bars remain visible and usable/);
    assert.doesNotMatch(html, /Width Weight|Select a stat/);
});

test('embedded maps render the selected map and refresh marker availability after actions', () => {
    const { stage, configuration, save } = makeStage();
    const marker = new Control({
        id: 'marker', name: 'Continue', type: 'marker',
        availabilityConditions: [[{ type: 'globalStat', statId: 'visible', comparison: 'equals', value: true }]],
    });
    configuration.controls.push(marker);
    const selected = new GameMap({ id: 'selected', links: [
        { type: 'marker', parentId: 'selected', markerControlId: marker.id, coordinates: { x: .5, y: .5 } },
    ] });
    const other = new GameMap({ id: 'other', priority: -1 });
    const onAction = mock.fn();
    stage.runControlActions = mock.fn(() => { save.globalStatValues.visible = false; return null; });
    const view = <TooltipProvider><DefinedMapView stage={() => stage} maps={[other, selected]} embedded initialMapId="selected"
        onAction={onAction} setScreenType={() => {}} isVerticalLayout={false} /></TooltipProvider>;
    const renderer = create(view);
    try {
        act(() => renderer.root.findByProps({ 'aria-label': 'Continue' }).props.onClick());
        assert.equal(onAction.mock.callCount(), 1);
        assert.equal(onAction.mock.calls[0].arguments[0], null);
        act(() => renderer.update(<TooltipProvider><DefinedMapView stage={() => stage} maps={[other, selected]} embedded initialMapId="selected"
            onAction={onAction} setScreenType={() => {}} isVerticalLayout={false} /></TooltipProvider>));
        assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Continue' }).length, 0);
    } finally {
        act(() => renderer.unmount());
    }
});

test('map selection is autosaved and survives switching away from the editor', () => {
    const { stage, configuration } = makeStage();
    const control = new Control({ type: 'popup', screenId: 'first' });
    configuration.controls.push(control);
    configuration.screens.push(new GameMap({ id: 'first' }), new GameMap({ id: 'second' }));
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
    let renderer: ReturnType<typeof create> | undefined;
    try {
        act(() => {
            renderer = create(<ControlDetailPanel control={control} stage={() => stage} />);
        });
        const mounted = renderer;
        if (!mounted) {
            throw new Error('Expected mounted control editor');
        }
        act(() => mounted.root.findByProps({ id: `control-screen-${control.id}` }).props.onChange({ target: { value: 'second' } }));
        act(() => mounted.unmount());
        renderer = undefined;
        assert.equal(configuration.controls[0].screenId, 'second');
        assert.equal(configuration.controls[0].type, 'popup');
        assert.equal(configuration.controls[0].placement, 'popup');
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});
