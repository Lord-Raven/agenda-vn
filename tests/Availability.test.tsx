import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GameConfiguration, Stage } from '../src/Stage';
import { Actor, ACTOR_SCHEDULE_UNAVAILABLE, resolveActorSchedule } from '../src/content/Actor';
import { Item } from '../src/content/Item';
import { ConditionContext, ContentStatCondition } from '../src/content/Condition';
import { isLocationAvailable, isLocationDisabled, isLocationInactive, Location } from '../src/content/Location';
import { cloneStat } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { ActorScheduleEditor } from '../src/components/ActorScheduleEditor';
import { TooltipProvider } from '../src/components/TooltipContext';
import { LocationDetailPanel } from '../src/screens/LocationDetailPanel';
import { MapLink } from '../src/content/Map';
import { Screen as GameMap } from '../src/content/Screen';
import { DefinedMapView } from '../src/screens/DefinedMapView';
import { ScreenDetailPanel } from '../src/screens/ScreenDetailPanel';
import { SearchableOptionPicker } from '../src/components/SearchableOptionPicker';
import { Control } from '../src/content/Control';
import { MARKER_VARIABLE_VALUE, functionReference } from '../src/content/Function';
import { Tooltip } from '@mui/material';
import { ContentCardControl } from '../src/components/ContentCardControl';

const stat = cloneStat({
    id: 'score', name: 'Local Score', type: 'number', default: 0, guidance: '',
    llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
});

const ownStatCondition = (contentType: 'actor' | 'location'): ContentStatCondition => ({
    type: 'contentStat', contentType, targetId: 'variable',
    statId: stat.id, comparison: 'greaterThanOrEqual', value: 5,
});

test('location availability binds Variable to each evaluated location, without mutating the context', () => {
    const first = new Location({ id: 'first', statMap: { score: 10 } });
    const second = new Location({ id: 'second', statMap: { score: 0 } });
    const context: ConditionContext = {
        locationStats: [stat], atlas: { first, second }, currentLocation: second,
        globalStats: [stat], globalStatValues: { score: 0 },
    };

    for (const location of [first, second]) {
        location.availabilityConditions = { unavailable: [[ownStatCondition('location')]], disabled: [] };
    }
    assert.equal(isLocationInactive(first, context), false);
    assert.equal(isLocationAvailable(first, context), true);
    assert.equal(isLocationInactive(second, context), true);
    assert.equal(isLocationAvailable(second, context), false);

    for (const location of [first, second]) {
        location.availabilityConditions = { unavailable: [], disabled: [[ownStatCondition('location')]] };
    }
    assert.equal(isLocationDisabled(first, context), true);
    assert.equal(isLocationAvailable(first, context), false);
    assert.equal(isLocationDisabled(second, context), false);
    assert.equal(isLocationAvailable(second, context), true);
    assert.equal(context.currentLocation, second);
});

test('location availability preserves defaults, global stats, and explicit location targets', () => {
    const location = new Location({ id: 'local', statMap: { score: 0 } });
    const other = new Location({ id: 'other', statMap: { score: 10 } });
    const context: ConditionContext = {
        locationStats: [stat], atlas: [location, other],
        globalStats: [stat], globalStatValues: { score: 10 },
    };
    assert.equal(isLocationAvailable(location, context), true);
    assert.equal(isLocationDisabled(location, context), false);
    location.availabilityConditions.unavailable = [[{
        type: 'globalStat', statId: stat.id, comparison: 'greaterThanOrEqual', value: 5,
    }]];
    assert.equal(isLocationAvailable(location, context), true);
    location.availabilityConditions.unavailable = [[{ ...ownStatCondition('location'), targetId: other.id }]];
    assert.equal(isLocationAvailable(location, context), true);
    location.active = false;
    assert.equal(isLocationAvailable(location, context), false);
});

test('actor schedule availability already evaluates Variable against the scheduled actor', () => {
    const first = new Actor({
        id: 'first', statMap: { score: 10 },
        schedule: { [ACTOR_SCHEDULE_UNAVAILABLE]: [[ownStatCondition('actor')]] },
    });
    const second = new Actor({ ...first, id: 'second', statMap: { score: 0 } });
    const context = { actorStats: [stat], actors: [first, second], currentActor: second };
    assert.equal(resolveActorSchedule(first, context), ACTOR_SCHEDULE_UNAVAILABLE);
    assert.notEqual(resolveActorSchedule(second, context), ACTOR_SCHEDULE_UNAVAILABLE);
    assert.equal(context.currentActor, second);
});

const createStage = (location: Location): Stage => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [location], screens: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [stat], itemStats: [], locationStats: [stat],
        globalStats: [], functions: [], globalStatValues: {}, statUpdateRules: [], controls: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-21',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => ({
        playerId: '', actors: {}, atlas: { [location.id]: location }, inventory: [], screens: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    });
    return stage;
};

for (const isCreatorMode of [true, false]) {
    test(`location availability editor exposes local stats and Variable (creator mode: ${isCreatorMode})`, () => {
        const location = new Location({
            id: 'local', name: 'Test Location',
            availabilityConditions: { unavailable: [[ownStatCondition('location')]], disabled: [] },
        });
        const stage = createStage(location);
        const html = renderToStaticMarkup(<TooltipProvider>
            <LocationDetailPanel location={location} stage={() => stage} isCreatorMode={isCreatorMode} />
        </TooltipProvider>);
        assert.match(html, /value="contentStat:location" selected="">Location Stat/);
        assert.match(html, /value="score" selected="">Local Score/);
        assert.match(html, />Variable</);
    });
}

test('actor schedule editor exposes actor stats and Variable', () => {
    const html = renderToStaticMarkup(<TooltipProvider>
        <ActorScheduleEditor
            schedule={{ [ACTOR_SCHEDULE_UNAVAILABLE]: [[ownStatCondition('actor')]] }}
            locations={[]} globalStats={[]} actorStats={[stat]} onChange={() => {}} />
    </TooltipProvider>);
    assert.match(html, /value="contentStat:actor" selected="">Actor Stat/);
    assert.match(html, /value="score" selected="">Local Score/);
    assert.match(html, />Variable</);
});

const createMapMarker = (patch: Partial<MapLink> = {}): MapLink => ({
    type: 'marker', parentId: 'map', coordinates: { x: 0.5, y: 0.5 }, ...patch,
});

test('screen loading and cloning discard legacy map links and buttons', () => {
    const raw = JSON.parse(JSON.stringify({
        id: 'map',
        links: [
            { parentId: 'map', childId: 'local', coordinates: { x: .1, y: .2 } },
            { type: 'target', parentId: 'map', childId: 'other-map', coordinates: { x: .2, y: .3 } },
            { type: 'button', parentId: 'map', name: 'Old', coordinates: { x: .3, y: .4 } },
            { type: 'marker', parentId: 'map', markerControlId: 'marker', content: 'local', coordinates: { x: .4, y: .5 }, conditionCollections: [[{}]], actions: [] },
        ],
    }));
    const map = new GameMap(raw);
    for (const copy of [map, new GameMap(map), new GameMap(JSON.parse(JSON.stringify(map)))]) {
        assert.deepEqual(copy.links, [{
            type: 'marker', parentId: 'map', markerControlId: 'marker', content: 'local', coordinates: { x: .4, y: .5 },
        }]);
    }
    assert.notEqual(new GameMap(map).links[0].coordinates, map.links[0].coordinates);
});

test('location markers ignore location availability and visibility but obey marker conditions', () => {
    const location = new Location({ id: 'local', name: 'Local', statMap: { score: 0 } });
    const stage = createStage(location);
    const save = stage.getSave();
    stage.getSave = () => save;
    stage.isLocationVisible = () => { throw new Error('marker must not check location visibility'); };
    stage.canVisitLocation = () => { throw new Error('marker must not check location availability'); };
    stage.runControlActions = mock.fn(() => null);
    const onAction = mock.fn();
    const marker = new Control({ id: 'marker', name: 'Marker', type: 'marker', markerInputType: 'location' });
    stage.getConfiguration().controls = [marker];
    const map = new GameMap({ id: 'map', links: [createMapMarker({ markerControlId: marker.id, content: location.id })] });
    const view = <TooltipProvider><DefinedMapView stage={() => stage} maps={[map]} onAction={onAction} setScreenType={() => {}} isVerticalLayout={false} embedded /></TooltipProvider>;
    for (const availability of ['unavailable', 'disabled'] as const) {
        location.availabilityConditions = { unavailable: [], disabled: [], [availability]: [[{ ...ownStatCondition('location'), value: availability === 'disabled' ? 0 : 5 }]] };
        assert.equal(availability === 'unavailable'
            ? isLocationAvailable(location, stage.getScheduleContext(save))
            : isLocationDisabled(location, stage.getScheduleContext(save)), availability === 'disabled');
        assert.match(renderToStaticMarkup(view), /aria-label="Marker"/);
    }
    location.active = false;
    const renderer = create(view);
    try {
        const button = renderer.root.findByProps({ 'aria-label': 'Marker' });
        assert.notEqual(button.props.disabled, true);
        act(() => button.props.onClick());
        assert.equal(onAction.mock.callCount(), 1);
        assert.deepEqual(stage.runControlActions.mock.calls[0].arguments[1], { location: 'local' });
    } finally {
        act(() => renderer.unmount());
    }
    marker.availabilityConditions = [[ownStatCondition('location')]];
    assert.doesNotMatch(renderToStaticMarkup(view), /aria-label="Marker"/);
});

for (const isCreatorMode of [true, false]) {
    test(`map marker instances have independent names and typed content (creator: ${isCreatorMode})`, () => {
        const stage = createStage(new Location({ id: 'initial' }));
        const configuration = stage.getConfiguration();
        const prefix = isCreatorMode ? 'config' : 'save';
        const makeContent = (source: string) => ({
            actors: [
                new Actor({ id: `${source}-a`, name: 'Actor A' }),
                new Actor({ id: `${source}-b`, name: 'Actor B' }),
                new Actor({ id: `${source}-inactive`, active: false }),
            ],
            items: [new Item({ id: `${source}-item`, name: 'An Item' })],
            locations: [new Location({ id: `${source}-location`, name: 'A Location' })],
            screens: [new GameMap({ id: `${source}-screen`, name: 'A List', type: 'list' })],
        });
        const controls = (['actor', 'item', 'location', 'screen', 'string'] as const).map(markerInputType =>
            new Control({ id: markerInputType, name: markerInputType, type: 'marker', markerInputType }));
        controls.push(new Control({ id: 'other-actor', name: 'Other Actor', type: 'marker', markerInputType: 'actor' }));
        const map = new GameMap({ id: 'map', links: [
            createMapMarker({ type: 'marker', markerControlId: 'actor', name: undefined, input: `${prefix}-a` }),
            createMapMarker({ type: 'marker', markerControlId: 'actor', name: undefined }),
        ] });
        const configured = makeContent('config');
        const saved = makeContent('save');
        Object.assign(configuration, configured, { controls, screens: [...configured.screens, map] });
        const save = {
            ...stage.getSave(),
            actors: Object.fromEntries(saved.actors.map(actor => [actor.id, actor])),
            inventory: saved.items,
            atlas: Object.fromEntries(saved.locations.map(location => [location.id, location])),
            screens: [...saved.screens, map],
        };
        stage.getSave = () => save;
        stage.updateConfiguration = mock.fn();
        stage.saveGame = mock.fn();
        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
        Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} } });
        const Editor = () => {
            const [, setRevision] = useState(0);
            return <TooltipProvider><ScreenDetailPanel screen={map} stage={() => stage}
                isCreatorMode={isCreatorMode} onChange={() => setRevision(revision => revision + 1)} onDeactivate={() => {}} /></TooltipProvider>;
        };
        let renderer: ReactTestRenderer | undefined;
        try {
            act(() => { renderer = create(<Editor />); });
            assert.ok(renderer);
            const root = renderer.root;
            act(() => root.findByProps({ 'aria-label': 'Expand Markers' }).props.onClick());
            const heading = (label: string, index = 0) => {
                const title = root.findAllByProps({ 'aria-label': label })[index].findByType('strong');
                return title.children.slice(0, 2).join('') + title.findByType('span').children.join('');
            };
            assert.equal(heading('Expand actor'), 'actor (Marker)');
            act(() => root.findAllByProps({ 'aria-label': 'Expand actor' })[0].props.onClick());
            act(() => root.findByProps({ 'aria-label': 'Expand actor' }).props.onClick());
            assert.equal(root.findAllByProps({ 'aria-label': 'Add condition' }).length, 0);
            const rename = (index: number, value: string) => act(() => root.findAllByType('input')
                .find(node => node.props.id === `map-marker-name-map-${index}`)!.props.onChange({ target: { value } }));
            rename(0, ' North Entrance ');
            rename(1, 'South Entrance');
            assert.equal(heading('Collapse North Entrance'), 'North Entrance (actor Marker)');
            assert.equal(heading('Collapse South Entrance'), 'South Entrance (actor Marker)');
            assert.deepEqual(new GameMap(JSON.parse(JSON.stringify(map))).links.map(link => link.name), [' North Entrance ', 'South Entrance']);

            const pickers = () => root.findAllByType(SearchableOptionPicker).filter(node => node.props.title?.startsWith('Choose marker '));
            const ids = (index: number) => pickers()[index].props.options.map((option: { key: string }) => option.key);
            assert.deepEqual(ids(0), [`${prefix}-a`, `${prefix}-b`]);
            assert.equal(pickers()[0].props.value, `${prefix}-a`);
            act(() => pickers()[1].props.onChange(`${prefix}-b`));
            assert.deepEqual(new GameMap(JSON.parse(JSON.stringify(map))).links.map(link => link.content), [`${prefix}-a`, `${prefix}-b`]);
            act(() => pickers()[0].props.onChange(undefined));
            assert.equal(pickers()[0].props.value, '');
            assert.equal(map.links[1].content, `${prefix}-b`);

            const switchControl = (id: string) => act(() => root.findByProps({ id: 'map-marker-control-map-1' }).props.onChange({ target: { value: id } }));
            switchControl('other-actor');
            assert.equal(heading('Collapse South Entrance'), 'South Entrance (Other Actor Marker)');
            assert.equal(pickers()[1].props.value, `${prefix}-b`);
            for (const kind of ['item', 'location', 'screen'] as const) {
                switchControl(kind);
                assert.equal(pickers()[1].props.value, '');
                const id = `${prefix}-${kind}`;
                assert.deepEqual(ids(1), kind === 'screen' ? [id, 'map'] : [id]);
                act(() => pickers()[1].props.onChange(id));
                assert.equal(map.links[1].content, id);
            }
            switchControl('string');
            const text = root.findAllByType('input').find(node => node.props['aria-label'] === 'Marker content');
            assert.ok(text);
            assert.equal(text.props.value, '');
            act(() => text.props.onChange({ target: { value: 'Free text' } }));
            assert.equal(map.links[1].content, 'Free text');
            rename(1, ' ');
            assert.equal(heading('Collapse string'), 'string (Marker)');
        } finally {
            if (renderer) act(() => renderer?.unmount());
            if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
            else Reflect.deleteProperty(globalThis, 'window');
        }
    });
}

test('location markers bind content for availability, icon functions, portraits and actions', () => {
    const location = new Location({ id: 'local', name: 'Local', statMap: { score: 5 } });
    const stage = createStage(location);
    const parameter = cloneStat({ ...stat, id: 'place', name: 'Place', type: 'location', default: '' });
    const marker = new Control({
        id: 'marker', name: 'Marker', type: 'marker', markerInputType: 'location',
        iconName: functionReference('icon', { place: 'variable:location' }),
        availabilityConditions: [[ownStatCondition('location')]],
        contentList: { kind: 'location', values: ['variable:location'] },
        actions: [{ id: 'update', kind: 'stat', targetType: 'location', targetId: 'variable:location', statId: 'score', operation: 'set', value: 9 }],
    });
    stage.getConfiguration().controls = [marker];
    stage.getConfiguration().functions = [{ id: 'icon', name: 'Icon', description: '', returnType: 'text', script: "return arg('Place') === 'local' ? 'favorite' : 'star';", parameters: [parameter] }];
    const save = stage.getSave();
    stage.getSave = () => save;
    stage.saveGame = mock.fn();
    const map = new GameMap({ id: 'map', links: [createMapMarker({ type: 'marker', markerControlId: marker.id, content: 'local' })] });
    const view = <TooltipProvider><DefinedMapView stage={() => stage} maps={[map]} onAction={() => {}} setScreenType={() => {}} isVerticalLayout={false} embedded /></TooltipProvider>;
    const html = renderToStaticMarkup(view);
    assert.match(html, /aria-label="Marker"/);
    assert.match(html, /data-testid="FavoriteBorderIcon"/);
    assert.match(html, /aria-label="Marker contents"/);
    marker.contentList.values = [];
    const renderer = create(view);
    try {
        act(() => renderer.root.findByProps({ 'aria-label': 'Marker' }).props.onClick());
        assert.equal(location.statMap.score, 9);
    } finally {
        act(() => renderer.unmount());
    }
    location.statMap.score = 0;
    assert.doesNotMatch(renderToStaticMarkup(view), /aria-label="Marker"/);
});

for (const kind of ['actor', 'item', 'location'] as const) {
    test(`${kind} marker hover cards receive each marker instance and run card actions`, () => {
        const stage = createStage(new Location({ id: 'local' }));
        const first = kind === 'actor' ? new Actor({ id: 'first', name: 'First', statMap: { score: 0 } })
            : kind === 'item' ? new Item({ id: 'first', name: 'First', statMap: { score: 0 } })
                : new Location({ id: 'first', name: 'First', statMap: { score: 0 } });
        const second = kind === 'actor' ? new Actor({ id: 'second', name: 'Second', statMap: { score: 0 } })
            : kind === 'item' ? new Item({ id: 'second', name: 'Second', statMap: { score: 0 } })
                : new Location({ id: 'second', name: 'Second', statMap: { score: 0 } });
        const save = stage.getSave();
        if (kind === 'actor') { save.actors.first = first as Actor; save.actors.second = second as Actor; }
        else if (kind === 'item') { save.inventory.push(first as Item, second as Item); }
        else { save.atlas.first = first as Location; save.atlas.second = second as Location; }
        stage.getSave = () => save;
        stage.getConfiguration()[`${kind}Stats`] = [stat];
        stage.saveGame = mock.fn();
        const card = new Control({ id: 'card', type: 'card', contentType: kind, label: '{{content:name}}', showPortrait: false,
            actions: [{ id: 'action', kind: 'stat', targetType: kind, targetId: `variable:${kind}`, statId: 'score', operation: 'set', value: 9 }] });
        const marker = new Control({ id: 'marker', name: 'Marker', type: 'marker', markerInputType: kind, cardControlId: card.id });
        stage.getConfiguration().controls = [marker, card];
        const map = new GameMap({ id: 'map', links: ['first', 'second'].map(content =>
            createMapMarker({ type: 'marker', markerControlId: marker.id, content })) });
        const onAction = mock.fn();
        const renderer = create(<TooltipProvider><DefinedMapView stage={() => stage} maps={[map]} onAction={onAction} setScreenType={() => {}} isVerticalLayout={false} embedded /></TooltipProvider>);
        let cardRenderer: ReactTestRenderer | undefined;
        try {
            const tooltips = renderer.root.findAllByType(Tooltip);
            assert.equal(tooltips.length, 2);
            const titles = tooltips.map(tooltip => tooltip.props.title);
            assert.deepEqual(titles.map(title => title.props.id), ['first', 'second']);
            assert.ok(titles.every(title => title.type === ContentCardControl && title.props.control === card && title.props.kind === kind && title.props.orientation === 'vertical'));
            assert.match(renderToStaticMarkup(titles[1]), /Second/);
            act(() => { cardRenderer = create(titles[1]); });
            act(() => cardRenderer!.root.findByProps({ 'data-card-control': card.id }).props.onClick());
            assert.equal(first.statMap.score, 0);
            assert.equal(second.statMap.score, 9);
            assert.equal(onAction.mock.callCount(), 1);
        } finally {
            if (cardRenderer) act(() => cardRenderer!.unmount());
            act(() => renderer.unmount());
        }
    });
}

test('marker hover card availability follows the marker instead of the card or location', () => {
    const location = new Location({ id: 'local', name: 'Local', statMap: { score: 0 } });
    const stage = createStage(location);
    const save = stage.getSave();
    stage.getSave = () => save;
    stage.saveGame = mock.fn();
    const card = new Control({
        id: 'card', type: 'card', contentType: 'location', showPortrait: false,
        availabilityConditions: [[ownStatCondition('location')]],
        actions: [{ id: 'action', kind: 'stat', targetType: 'location', targetId: 'variable:location', statId: 'score', operation: 'set', value: 1 }],
    });
    const marker = new Control({ id: 'marker', name: 'Marker', type: 'marker', markerInputType: 'location', cardControlId: card.id });
    stage.getConfiguration().controls = [marker, card];
    const map = new GameMap({ id: 'map', links: [createMapMarker({ markerControlId: marker.id, content: location.id })] });
    const view = <TooltipProvider><DefinedMapView stage={() => stage} maps={[map]} onAction={() => {}} setScreenType={() => {}} isVerticalLayout={false} embedded /></TooltipProvider>;
    for (const availability of ['disabled', 'unavailable'] as const) {
        location.statMap.score = 0;
        location.availabilityConditions = { unavailable: [], disabled: [], [availability]: [[{ ...ownStatCondition('location'), value: availability === 'disabled' ? 0 : 5 }]] };
        const renderer = create(view);
        let cardRenderer: ReactTestRenderer | undefined;
        try {
            const title = renderer.root.findByType(Tooltip).props.title;
            act(() => { cardRenderer = create(title); });
            const cardElement = cardRenderer!.root.findByProps({ 'data-card-control': card.id });
            assert.equal(cardElement.props.sx.opacity, 1);
            assert.equal(cardElement.props['aria-disabled'], false);
            const click = cardElement.props.onClick;
            act(() => click());
            assert.equal(location.statMap.score, 1);
            marker.availabilityConditions = [[ownStatCondition('location')]];
            act(() => click());
            assert.equal(location.statMap.score, 1);
            marker.availabilityConditions = [];
            const normalCard = create(<ContentCardControl stage={() => stage} control={card} kind="location" id={location.id} />);
            try {
                assert.equal(normalCard.root.findByProps({ 'data-card-control': card.id }).props.sx.opacity, 0.56);
            } finally { act(() => normalCard.unmount()); }
        } finally {
            if (cardRenderer) act(() => cardRenderer!.unmount());
            act(() => renderer.unmount());
        }
    }
});

test('map markers use controls from the active save configuration', () => {
    const stage = createStage(new Location({ id: 'local', name: 'Local' }));
    const save = stage.getSave();
    stage.getSave = () => save;
    const draft = stage.getConfiguration();
    const card = new Control({ id: 'card', type: 'card', contentType: 'location', label: '{{content:name}}' });
    const marker = new Control({ id: 'marker', name: 'Saved Marker', type: 'marker', markerInputType: 'location', cardControlId: card.id, iconName: 'favorite' });
    draft.controls = [new Control({ id: 'marker', name: 'New Control', type: 'marker' })];
    const snapshot = { ...draft, controls: [marker, card] };
    stage.getConfiguration = currentSave => currentSave ? snapshot : draft;
    const map = new GameMap({ id: 'map', links: [createMapMarker({ type: 'marker', markerControlId: marker.id, content: 'local' })] });
    const view = <TooltipProvider><DefinedMapView stage={() => stage} maps={[map]} onAction={() => {}} setScreenType={() => {}} isVerticalLayout={false} embedded /></TooltipProvider>;
    const html = renderToStaticMarkup(view);
    assert.match(html, /aria-label="Saved Marker"/);
    assert.match(html, /data-testid="FavoriteBorderIcon"/);
    const renderer = create(view);
    try {
        const tooltip = renderer.root.findByType(Tooltip);
        assert.equal(tooltip.props.title.props.control, card);
        assert.equal(tooltip.props.title.props.id, 'local');
    } finally {
        act(() => renderer.unmount());
    }
});

test('marker hover ignores missing, incompatible, inactive, or hidden cards', () => {
    const stage = createStage(new Location({ id: 'local', name: 'Local' }));
    const save = stage.getSave();
    stage.getSave = () => save;
    const card = new Control({ id: 'card', type: 'card', contentType: 'location' });
    const marker = new Control({ id: 'marker', name: 'Marker', type: 'marker', markerInputType: 'location', cardControlId: card.id });
    stage.getConfiguration().controls = [marker, card];
    const map = new GameMap({ id: 'map', links: [createMapMarker({ type: 'marker', markerControlId: marker.id, content: 'local' })] });
    const view = <TooltipProvider><DefinedMapView stage={() => stage} maps={[map]} onAction={() => {}} setScreenType={() => {}} isVerticalLayout={false} embedded /></TooltipProvider>;
    for (const change of [
        () => { marker.cardControlId = 'missing'; },
        () => { marker.cardControlId = card.id; card.contentType = 'actor'; },
        () => { card.contentType = 'location'; card.active = false; },
        () => { card.active = true; card.visibilityConditions = [[ownStatCondition('location')]]; },
        () => { card.visibilityConditions = []; map.links[0].content = 'missing'; },
        () => { map.links[0].content = 'local'; marker.markerInputType = 'string'; },
    ]) {
        change();
        const renderer = create(view);
        try { assert.equal(renderer.root.findAllByType(Tooltip).length, 0); }
        finally { act(() => renderer.unmount()); }
    }
});

for (const kind of ['actor', 'item'] as const) {
    test(`${kind} marker actions target the supplied entity`, () => {
        const stage = createStage(new Location({ id: 'local' }));
        const entity = kind === 'actor'
            ? new Actor({ id: 'entry', name: 'Entry', statMap: { score: 5 } })
            : new Item({ id: 'entry', name: 'Entry', statMap: { score: 5 } });
        const marker = new Control({
            id: 'marker', name: 'Marker', type: 'marker', markerInputType: kind,
            availabilityConditions: [[{ type: 'contentStat', contentType: kind, targetId: 'variable', statId: 'score', comparison: 'equals', value: 5 }]],
            actions: [{ id: 'update', kind: 'stat', targetType: kind, targetId: `variable:${kind}`, statId: 'score', operation: 'set', value: 9 }],
        });
        const configuration = stage.getConfiguration();
        configuration.controls = [marker];
        if (kind === 'item') configuration.itemStats = [stat];
        const save = stage.getSave();
        if (entity instanceof Actor) save.actors[entity.id] = entity;
        else save.inventory.push(entity);
        stage.getSave = () => save;
        stage.saveGame = mock.fn();
        const map = new GameMap({ id: 'map', links: [createMapMarker({ type: 'marker', markerControlId: marker.id, content: entity.id })] });
        const view = <TooltipProvider><DefinedMapView stage={() => stage} maps={[map]} onAction={() => {}} setScreenType={() => {}} isVerticalLayout={false} embedded /></TooltipProvider>;
        const renderer = create(view);
        try {
            act(() => renderer.root.findByProps({ 'aria-label': 'Marker' }).props.onClick());
            assert.equal(entity.statMap.score, 9);
        } finally {
            act(() => renderer.unmount());
        }
    });
}

for (const kind of ['string', 'screen'] as const) {
    test(`${kind} marker content binds as text in availability, icons and actions`, () => {
        const stage = createStage(new Location({ id: 'local' }));
        const textStat = cloneStat({ ...stat, id: 'text', type: 'text', default: '' });
        const marker = new Control({
            id: 'marker', name: 'Marker', type: 'marker', markerInputType: kind, iconName: MARKER_VARIABLE_VALUE,
            availabilityConditions: [[{ type: 'globalStat', statId: 'text', comparison: 'equals', value: MARKER_VARIABLE_VALUE }]],
            actions: [{ id: 'update', kind: 'stat', targetType: 'global', targetId: 'any', statId: 'text', operation: 'set', value: MARKER_VARIABLE_VALUE }],
        });
        stage.getConfiguration().controls = [marker];
        stage.getConfiguration().globalStats = [textStat];
        const save = stage.getSave();
        save.globalStatValues.text = 'favorite';
        stage.getSave = () => save;
        stage.saveGame = mock.fn();
        const map = new GameMap({ id: 'map', links: [createMapMarker({ type: 'marker', markerControlId: marker.id, content: 'favorite' })] });
        const view = <TooltipProvider><DefinedMapView stage={() => stage} maps={[map]} onAction={() => {}} setScreenType={() => {}} isVerticalLayout={false} embedded /></TooltipProvider>;
        assert.match(renderToStaticMarkup(view), /data-testid="FavoriteBorderIcon"/);
        const renderer = create(view);
        try {
            save.globalStatValues.text = 'other';
            act(() => renderer.root.findByProps({ 'aria-label': 'Marker' }).props.onClick());
            assert.equal(save.globalStatValues.text, 'favorite');
        } finally {
            act(() => renderer.unmount());
        }
        save.globalStatValues.text = 'other';
        assert.doesNotMatch(renderToStaticMarkup(view), /aria-label="Marker"/);
    });
}

for (const isVerticalLayout of [false, true]) {
    test(`map marker contents use unique, overlapping portraits in ${isVerticalLayout ? 'vertical' : 'horizontal'} layouts`, () => {
        const stage = createStage(new Location({ id: 'local', name: 'Local', statMap: {} }));
        const marker = new Control({ id: 'marker', name: 'Locations', type: 'marker', contentList: { kind: 'mixed', values: ['local', 'local', 'other', 'local'] } });
        stage.getConfiguration().controls = [marker];
        const map = new GameMap({ id: 'map', links: [createMapMarker({ markerControlId: marker.id })] });
        const html = renderToStaticMarkup(<TooltipProvider>
            <DefinedMapView stage={() => stage} maps={[map]} onAction={() => {}} setScreenType={() => {}} isVerticalLayout={isVerticalLayout} />
        </TooltipProvider>);
        const size = isVerticalLayout ? 28 : 40;
        const markerSize = isVerticalLayout ? 48 : 64;
        assert.equal((html.match(/role="group" aria-label="Locations contents"/g) || []).length, 1);
        assert.equal((html.match(/<div[^>]*role="listitem"/g) || []).length, 2);
        assert.equal((html.match(/data-has-image="false"/g) || []).length, 1);
        assert.ok(html.includes(`translate(-50%, calc(-50% + ${markerSize / 2 + size / 3}px))`));
        assert.ok(html.includes(`width:${size}px;height:${size}px`));
        assert.ok(html.includes(`margin-left:-${Math.round(size * 0.32)}px`));
        assert.doesNotMatch(html, /container-type:inline-size/);
    });
}
