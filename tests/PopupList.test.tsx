import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { buildPortableGameConfiguration, GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Actor, ACTOR_SCHEDULE_UNAVAILABLE } from '../src/content/Actor';
import { Item } from '../src/content/Item';
import { Location } from '../src/content/Location';
import { cloneStat, Stat, StatType, StatValue } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { cloneListSection, contentStatReference, Screen, createListSection, parseContentStatReference, listContentKind, ListSection } from '../src/content/Screen';
import { functionReference, globalStatReference, HEADER_VARIABLE_VALUE, GameFunction } from '../src/content/Function';
import { ConditionCollection, variableContentValue } from '../src/content/Condition';
import { buildListContentPages, ListCardDetail } from '../src/screens/ListScreenView';
import { ContentCardList, ContentCardView } from '../src/components/ContentCardList';
import { cardControlOptions, ListSectionsEditor, listContentSourceOptions, listDetailOptions, listHeaderSourceOptions, contentDetailSourceOptions } from '../src/components/ListSectionsEditor';
import { TooltipProvider } from '../src/components/TooltipContext';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';
import { Control, controlReference } from '../src/content/Control';
import { ScreenDetailPanel } from '../src/screens/ScreenDetailPanel';
import { StatValueInput } from '../src/components/StatValueInput';
import { HeaderVariableContext } from '../src/components/VariableContentContext';
import { ConditionEditor } from '../src/components/ConditionEditor';
import { SearchableOptionPicker } from '../src/components/SearchableOptionPicker';
import { CardActionContext, ContentCardControl } from '../src/components/ContentCardControl';
import { OutcomeEditor } from '../src/components/OutcomeEditor';
import { GameManagementPanel } from '../src/screens/GameManagementPanel';
import { ActorCard } from '../src/components/ActorCard';

const stat = (id: string, type: StatType, defaultValue: StatValue, extra: Partial<Stat> = {}): Stat => cloneStat({
    id, name: id, type, guidance: '', default: defaultValue,
    llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] }, ...extra,
});

const fixture = () => {
    const actors = [
        new Actor({ id: 'alice', name: 'Alice', themeColor: '#ff0000', statMap: { Mood: 3, Team: 'red' } }),
        new Actor({ id: 'bob', name: 'Bob', statMap: { Mood: 5, Team: 'blue' } }),
        new Actor({ id: 'gone', name: 'Gone', active: false, statMap: { Team: 'red' } }),
    ];
    const item = new Item({ id: 'sword', name: 'Sword', description: '' });
    const location = new Location({ id: 'park', name: 'Park', description: '' });
    const functions: GameFunction[] = [
        { id: 'teams', name: 'Teams', description: '', returnType: 'textList', script: "return ['red', 'blue', 'green'];" },
        {
            id: 'members', name: 'Members', description: '', returnType: 'actorList',
            script: "return ['alice', 'bob', 'gone'].filter(id => id !== 'gone' && (arg('Team') === 'red' ? id === 'alice' : arg('Team') === 'blue' ? id === 'bob' : false)).concat(arg('Team') === 'red' ? ['gone', 'alice'] : []);",
            parameters: [stat('Team', 'text', '')],
        },
        {
            id: 'label', name: 'Label', description: '', returnType: 'text',
            script: "return `${arg('Team')}:${arg('Who')}`;",
            parameters: [stat('Who', 'actor', ''), stat('Team', 'text', '')],
        },
        { id: 'greeting', name: 'Greeting', description: '', returnType: 'text', script: "return 'Hello';" },
        { id: 'macro-teams', name: 'Macro Teams', description: '', returnType: 'textList', script: "return ['{{Title}}', '{{Greeting}}'];" },
        { id: 'unrelated', name: 'Unrelated', description: '', returnType: 'number', script: 'return 1;' },
    ];
    const actorStats = [stat('Mood', 'number', 0), stat('Team', 'text', '')];
    const configuration: GameConfiguration = {
        actors, items: [item], locations: [location], screens: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats, itemStats: [], locationStats: [],
        globalStats: [stat('Title', 'text', 'Squad'), stat('Crew', 'actorList', ['bob'])],
        globalStatValues: {}, statUpdateRules: [], functions,
        controls: [], uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-08',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: '', actors: Object.fromEntries(actors.map(actor => [actor.id, actor])),
        atlas: { park: location }, inventory: [item], screens: [], universalSchedule: {},
        timeline: [], timestamp: 0, globalStatValues: { Title: 'Squad', Crew: ['bob'] },
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.saveGame = () => {};
    stage.getSkitConditionState = () => undefined;
    stage.getCurrentLocationEvent = () => null;
    return { stage, configuration, save };
};

const membersByHeader = functionReference('members', { Team: HEADER_VARIABLE_VALUE });

const configureCard = (stage: Stage, section: ListSection, props: Partial<Control> = {}) => {
    const card = new Control({ type: 'card', label: '{{content:name}}', ...props });
    section.cardControlId = card.id;
    stage.getConfiguration().controls.push(card);
    return card;
};

test('Screens default to Map and deep-clone List sections', () => {
    const plain = new Screen();
    assert.equal(plain.type, 'map');
    assert.deepEqual(plain.sections, []);
    const section = { ...createListSection(), header: 'Team', cardControlId: 'actor-card' };
    const control = new Screen({ type: 'list', sections: [section] });
    assert.equal(control.type, 'list');
    assert.deepEqual(control.sections, [section]);
    assert.notEqual(control.sections[0], section);
    const clone = cloneListSection(section);
    clone.cardControlId = 'other-card';
    assert.equal(section.cardControlId, 'actor-card');
    assert.deepEqual(parseContentStatReference(contentStatReference('item', 'Weight')), { kind: 'item', statId: 'Weight' });
    assert.equal(parseContentStatReference(globalStatReference('Title')), undefined);
});

test('content kinds come from list function and global stat return types', () => {
    const { configuration } = fixture();
    assert.equal(listContentKind(configuration, membersByHeader), 'actor');
    assert.equal(listContentKind(configuration, globalStatReference('Crew')), 'actor');
    assert.equal(listContentKind(configuration, globalStatReference('Title')), undefined);
    assert.equal(listContentKind(configuration, ''), undefined);
});

test('Card Controls own conditions and deep-clone across serialization; List sections do not', () => {
    const card = new Control({ type: 'card',
        visibilityConditions: [[{ type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: 'alice' }]],
        availabilityConditions: [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Squad' }]],
    });
    const restored = new Control(JSON.parse(JSON.stringify(card)));
    const cloned = new Control(card);
    cloned.visibilityConditions[0][0].value = 'bob';
    assert.equal(card.visibilityConditions[0][0].value, 'alice');
    assert.deepEqual(restored, card);
    const section = cloneListSection({ id: 'old', details: ['actorStat:Mood'], actions: [], visibilityConditions: [] });
    assert.deepEqual(Object.keys(section).sort(), ['cardControlId', 'contentSource', 'header', 'headerSource', 'id']);
});

test('one selected Card Control supplies context-bound text and badges in horizontal lists and vertical actor hovers', () => {
    const { stage, configuration, save } = fixture();
    const badge = new Control({
        type: 'statBadge', badgeSource: contentStatReference('actor', 'Mood'),
        label: '{{char}} mood', description: '{{content:header}} / {{char:Team}}',
    });
    const card = new Control({
        type: 'card', label: '{{content:name}} / {{char:Team}}',
        subLabel: '{{Label("variable:actor", "variable:header")}}',
        description: '{{Greeting}}', useNamePlate: true, showPortrait: false,
        cardDetails: [controlReference(badge.id)],
    });
    configuration.controls = [card, badge];
    configuration.defaultActorCardId = card.id;
    const section = { ...createListSection(), header: 'Squad', contentSource: globalStatReference('Crew'), cardControlId: card.id };
    const renderList = () => renderToStaticMarkup(<TooltipProvider><ContentCardList stage={() => stage}
        pages={buildListContentPages(stage, new Screen({ type: 'list', sections: [section] }), () => {})} isVerticalLayout={false} /></TooltipProvider>);
    const list = renderList();
    assert.match(list, /data-card-orientation="horizontal"/);
    assert.match(list, /Bob \/ blue/);
    assert.match(list, /Squad:bob/);
    assert.match(list, /Bob mood/);
    assert.match(list, /title="Squad \/ blue"/);
    assert.match(list, /Hello/);
    const hover = renderToStaticMarkup(<TooltipProvider><ActorCard actor={save.actors.bob} stage={() => stage} /></TooltipProvider>);
    assert.ok(hover.includes(`data-card-control="${card.id}"`));
    assert.match(hover, /data-card-orientation="vertical"/);
    assert.match(hover, /Bob \/ blue/);
    assert.match(hover, />:bob</);
    save.actors.bob.statMap.Team = 'gold';
    assert.match(renderList(), /Bob \/ gold/);
    assert.equal(card.label, '{{content:name}} / {{char:Team}}');
    const portable = buildPortableGameConfiguration(configuration);
    assert.equal(portable.defaultActorCardId, card.id);
    assert.deepEqual(portable.controls[0].cardDetails, card.cardDetails);
});

for (const [kind, id] of [['actor', 'bob'], ['item', 'sword'], ['location', 'park']] as const) {
    test(`${kind} Card Controls bind label functions, badge availability, and click action functions to content and header`, () => {
        const { stage, configuration, save } = fixture();
        configuration.functions.push(
            { id: 'card-label', name: 'Card Label', description: '', returnType: 'text',
                parameters: [stat('Who', kind, ''), stat('Header', 'text', '')],
                script: "return arg('Who') + ':' + arg('Header');" },
            { id: 'badge-allowed', name: 'Badge Allowed', description: '', returnType: 'boolean',
                parameters: [stat('Who', kind, ''), stat('Header', 'text', '')],
                script: `return arg('Who') === '${id}' && arg('Header') === 'Allowed';` },
            { id: 'card-action', name: 'Card Action', description: '', returnType: 'void',
                parameters: [stat('Who', kind, ''), stat('Header', 'text', '')],
                script: "set('Title', arg('Who') + ':' + arg('Header'));" },
        );
        const args = { Who: variableContentValue(kind), Header: HEADER_VARIABLE_VALUE };
        const badge = new Control({ type: 'statBadge', contentType: kind, badgeSource: functionReference('greeting'),
            availabilityConditions: [[{ type: 'function', reference: functionReference('badge-allowed', args), comparison: 'equals', value: true }]],
        });
        const card = new Control({ type: 'card', contentType: kind,
            label: `{{Card Label("variable:${kind}", "variable:header")}}`,
            actions: [{ id: 'call', kind: 'function', functionId: 'card-action', args }],
        });
        configuration.controls.push(card, badge);
        assert.equal(stage.resolveCardText(card.label, kind, id, 'Allowed'), `${id}:Allowed`);
        assert.equal(stage.resolveListCardDetail(controlReference(badge.id), kind, id, 'Allowed')?.value, 'Hello');
        assert.equal(stage.resolveListCardDetail(controlReference(badge.id), kind, id, 'Denied'), undefined);
        stage.runCardActions(card, kind, id, 'Allowed');
        assert.equal(save.globalStatValues!.Title, `${id}:Allowed`);
        card.visibilityConditions = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'never' }]];
        stage.runCardActions(card, kind, id, 'Denied');
        assert.equal(save.globalStatValues!.Title, `${id}:Allowed`);
    });
}

test('Card selectors filter by content kind and activity, and invalid selections do not silently use another card', () => {
    const { stage, configuration } = fixture();
    const actor = new Control({ type: 'card', name: 'Actor' });
    const item = new Control({ type: 'card', name: 'Item', contentType: 'item' });
    const inactive = new Control({ type: 'card', name: 'Inactive', active: false });
    configuration.controls = [actor, item, inactive, new Control({ type: 'statBadge' })];
    const options = cardControlOptions(stage, 'actor').map(option => option.key);
    assert.ok(options.includes(actor.id));
    assert.ok(!options.includes(item.id));
    assert.ok(!options.includes(inactive.id));
    const log = mock.method(console, 'error', () => {});
    try {
        for (const cardControlId of ['missing', item.id, inactive.id]) {
            const section = { ...createListSection(), cardControlId, contentSource: globalStatReference('Crew') };
            assert.deepEqual(stage.resolveListSections(new Screen({ type: 'list', sections: [section] })), []);
        }
        assert.equal(log.mock.callCount(), 2);
    } finally {
        log.mock.restore();
    }
});

test('hover cards support keyboard activation and notify gameplay, while stale click handlers recheck availability', () => {
    const { stage, configuration, save } = fixture();
    const card = new Control({ type: 'card', label: '{{content:name}}',
        availabilityConditions: [[{ type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Mood', comparison: 'greaterThan', value: 4 }]],
        actions: [{ id: 'bump', kind: 'stat', targetType: 'actor', targetId: 'variable', statId: 'Mood', operation: 'adjust', value: 2 }],
    });
    configuration.controls = [card];
    configuration.defaultActorCardId = card.id;
    const onAction = mock.fn();
    let renderer: ReactTestRenderer | undefined;
    try {
        act(() => { renderer = create(<CardActionContext.Provider value={onAction}><ActorCard actor={save.actors.bob} stage={() => stage} /></CardActionContext.Provider>); });
        const element = renderer.root.findAllByType('div').find(node => node.props['data-card-control'] === card.id)!;
        const click = element.props.onClick;
        const target = {};
        const preventDefault = mock.fn();
        act(() => element.props.onKeyDown({ key: 'Enter', target, currentTarget: target, preventDefault }));
        assert.equal(preventDefault.mock.callCount(), 1);
        assert.equal(save.actors.bob.statMap.Mood, 7);
        assert.equal(onAction.mock.callCount(), 1);
        save.actors.bob.statMap.Mood = 4;
        act(() => click());
        assert.equal(save.actors.bob.statMap.Mood, 4);
        assert.equal(onAction.mock.callCount(), 1);
    } finally {
        if (renderer) act(() => renderer?.unmount());
    }
});

test('Card editor persists appearance, attached badges, conditions, and context-bound click actions on exit', () => {
    const { stage, configuration } = fixture();
    const card = new Control({ type: 'card', name: 'Editable', contentType: 'item' });
    const badge = new Control({ type: 'statBadge', name: 'Item badge', contentType: 'item', badgeSource: functionReference('greeting') });
    configuration.controls = [card, badge];
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} } });
    let renderer: ReactTestRenderer | undefined;
    try {
        act(() => { renderer = create(<ControlDetailPanel control={card} stage={() => stage} />); });
        const input = (placeholder: string) => renderer!.root.findByProps({ placeholder });
        act(() => input('{{content:name}}').props.onChange({ target: { value: '{{content:name}}!' } }));
        const textInputs = renderer.root.findAllByType('input').filter(node => node.props.type !== 'number' && node.props.type !== 'checkbox');
        act(() => textInputs.find(node => node.props.value === '')!.props.onChange({ target: { value: '{{content:header}}' } }));
        act(() => renderer!.root.findByType('textarea').props.onChange({ target: { value: '{{content:description}}' } }));
        act(() => renderer!.root.findAllByType('input').find(node => node.props.type === 'checkbox')!.props.onChange({ target: { checked: true } }));
        const picker = renderer.root.findAllByType(SearchableOptionPicker).find(node => node.props.title === 'Choose card controls')!;
        act(() => picker.props.onChange([controlReference(badge.id)]));
        const conditions = renderer.root.findAllByType(ConditionEditor);
        assert.ok(conditions.every(editor => editor.props.variableContentType === 'item'));
        const visibility: ConditionCollection[] = [[{ type: 'contentIdentity', contentType: 'item', comparison: 'equals', value: 'sword' }]];
        act(() => conditions[0].props.onChange(visibility));
        act(() => conditions[1].props.onChange(visibility));
        const actions = [{ id: 'mark', kind: 'stat', targetType: 'global', targetId: 'any', statId: 'Title', operation: 'set', value: 'clicked' }];
        act(() => renderer!.root.findByType(OutcomeEditor).props.onChange(actions));
        act(() => renderer!.unmount());
        renderer = undefined;
        const saved = configuration.controls.find(candidate => candidate.id === card.id)!;
        assert.equal(saved.label, '{{content:name}}!');
        assert.equal(saved.subLabel, '{{content:header}}');
        assert.equal(saved.description, '{{content:description}}');
        assert.equal(saved.useNamePlate, true);
        assert.deepEqual(saved.cardDetails, [controlReference(badge.id)]);
        assert.deepEqual(saved.visibilityConditions, visibility);
        assert.deepEqual(saved.availabilityConditions, visibility);
        assert.deepEqual(saved.actions, actions);
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});

test('Game Configuration persists the default hover Actor Card and includes it in portable exports', () => {
    const { stage, configuration } = fixture();
    const card = new Control({ type: 'card', name: 'Custom Hover Card' });
    configuration.controls = [card];
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
    let renderer: ReactTestRenderer | undefined;
    try {
        act(() => { renderer = create(<GameManagementPanel stage={() => stage} />); });
        const selector = renderer.root.findAllByType(SearchableOptionPicker).find(node => node.props.title === 'Choose default Actor Card')!;
        act(() => selector.props.onChange(card.id));
        act(() => renderer!.unmount());
        renderer = undefined;
        assert.equal(configuration.defaultActorCardId, card.id);
        assert.equal(buildPortableGameConfiguration(configuration).defaultActorCardId, card.id);
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});

test('List entry conditions bind each card and retain OR groups and AND conditions per header', () => {
    const { stage, save } = fixture();
    save.globalStatValues!.Crew = ['alice', 'bob', 'gone', 'missing', 'alice'];
    const section = { ...createListSection(), header: 'Restricted', contentSource: globalStatReference('Crew') };
    const card = configureCard(stage, section);
    card.visibilityConditions = [
        [
            { type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: 'alice' },
            { type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Mood', comparison: 'greaterThan', value: 3 },
        ],
        [{ type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: 'bob' }],
    ];
    card.availabilityConditions = [[{ type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Mood', comparison: 'greaterThan', value: 5 }]];
    const unrestricted = { ...createListSection(), header: 'Unrestricted', contentSource: section.contentSource };
    const screen = new Screen({ type: 'list', sections: [section, unrestricted] });
    assert.deepEqual(stage.resolveListSections(screen).map(page => [page.header, page.ids, page.unavailableIds]), [
        ['Restricted', ['bob'], ['bob']],
        ['Unrestricted', ['alice', 'bob'], []],
    ]);
    save.actors.alice.statMap.Mood = 4;
    save.actors.bob.statMap.Mood = 6;
    assert.deepEqual(stage.resolveListSections(screen)[0].ids, ['alice', 'bob']);
    assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, ['alice']);
    card.visibilityConditions = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Other' }]];
    assert.deepEqual(stage.resolveListSections(screen).map(page => page.header), ['Unrestricted']);
});

for (const [kind, id] of [['actor', 'bob'], ['item', 'sword'], ['location', 'park']] as const) {
    test(`List entry Functions bind the ${kind} and header for visibility and availability`, () => {
        const { stage, configuration, save } = fixture();
        configuration.globalStats.push(stat('Entries', `${kind}List`, [id]));
        configuration.functions.push({
            id: 'matches-entry', name: 'Matches Entry', description: '', returnType: 'boolean',
            parameters: [stat('Content', kind, ''), stat('Header', 'text', '')],
            script: `return arg('Content') === '${id}' && arg('Header') === 'Allowed';`,
        });
        const conditions: ConditionCollection[] = [[{
            type: 'function', comparison: 'equals', value: true,
            reference: functionReference('matches-entry', { Content: variableContentValue(kind), Header: HEADER_VARIABLE_VALUE }),
        }]];
        const section = { ...createListSection(), header: 'Allowed', contentSource: globalStatReference('Entries') };
        const card = configureCard(stage, section, { contentType: kind, visibilityConditions: conditions });
        const screen = new Screen({ type: 'list', sections: [section] });
        assert.deepEqual(stage.resolveListSections(screen).map(page => page.ids), [[id]]);
        screen.sections[0].header = 'Denied';
        assert.deepEqual(stage.resolveListSections(screen), []);
        card.visibilityConditions = [];
        card.availabilityConditions = conditions;
        assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, [id]);
        screen.sections[0].header = 'Allowed';
        assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, []);
        const alternateSave = { ...save, globalStatValues: { ...save.globalStatValues, Title: 'Alternate' } };
        card.availabilityConditions = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Alternate' }]];
        assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, [id]);
        assert.deepEqual(stage.resolveListSections(screen, alternateSave)[0].unavailableIds, []);
    });
}

test('List entry rules never override location visibility or availability, including event access', () => {
    const { stage, configuration, save } = fixture();
    configuration.globalStats.push(stat('Places', 'locationList', ['park']));
    const section = { ...createListSection(), header: 'Places', contentSource: globalStatReference('Places') };
    const card = configureCard(stage, section, { contentType: 'location' });
    const screen = new Screen({ type: 'list', sections: [section] });
    const location = save.atlas.park;
    const passes: ConditionCollection[] = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Squad' }]];
    const fails: ConditionCollection[] = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Other' }]];
    location.availabilityConditions.disabled = passes;
    assert.deepEqual(stage.resolveListSections(screen), []);
    location.availabilityConditions.disabled = [];
    location.availabilityConditions.unavailable = fails;
    assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, ['park']);
    stage.getCurrentLocationEvent = () => ({
        id: 'event', name: 'Event', date: '2026-10-08', duration: ['morning'],
        locationId: 'park', actorIds: [], description: '', guidance: '',
    });
    assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, []);
    card.availabilityConditions = fails;
    assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, ['park']);
    card.availabilityConditions = [];
    location.availabilityConditions.disabled = passes;
    assert.deepEqual(stage.resolveListSections(screen), []);
});

test('unavailable actors and items remain visible but disabled in List Screens', () => {
    const { stage, save } = fixture();
    save.actors.bob.schedule = { [ACTOR_SCHEDULE_UNAVAILABLE]: [[]] };
    save.inventory[0].availabilityConditions = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Other' }]];
    for (const [kind, id] of [['actor', 'bob'], ['item', 'sword']] as const) {
        assert.deepEqual(stage.resolveCardState(stage.getCardControl(kind)!, kind, id, 'Crew'), { visible: true, available: false });
    }
});

test('List entry condition errors are logged and isolate only the failing card', () => {
    const { stage, configuration, save } = fixture();
    save.globalStatValues!.Crew = ['alice', 'bob'];
    configuration.functions.push({
        id: 'fails-for-alice', name: 'Fails for Alice', description: '', returnType: 'boolean',
        parameters: [stat('Who', 'actor', '')],
        script: "if (arg('Who') === 'alice') throw new Error('Bad entry'); return true;",
    });
    const section = { ...createListSection(), contentSource: globalStatReference('Crew') };
    configureCard(stage, section, { visibilityConditions: [[{
        type: 'function', reference: functionReference('fails-for-alice', { Who: variableContentValue('actor') }),
        comparison: 'equals', value: true,
    }]] });
    const log = mock.method(console, 'error', () => {});
    try {
        assert.deepEqual(stage.resolveListSections(new Screen({ type: 'list', sections: [section] }))[0].ids, ['bob']);
        assert.ok(log.mock.calls.some(call => /List entry "alice".*Bad entry/.test(String(call.arguments[0]))));
    } finally {
        log.mock.restore();
    }
});

test('unavailable Card Controls stay dim and cannot run actions, even through stale handlers', () => {
    const { stage, save } = fixture();
    const section = { ...createListSection(), contentSource: globalStatReference('Crew') };
    const control = configureCard(stage, section, {
        actions: [{ id: 'bump', kind: 'stat' as const, targetType: 'actor' as const, targetId: 'variable', statId: 'Mood', operation: 'adjust' as const, value: 1 }],
        availabilityConditions: [[{ type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Mood', comparison: 'greaterThan', value: 4 }]],
    });
    const screen = new Screen({ type: 'list', sections: [section] });
    const onAction = mock.fn();
    const staleCard = buildListContentPages(stage, screen, onAction)[0].cards[0];
    assert.equal(staleCard.disabled, false);
    save.actors.bob.statMap.Mood = 4;
    const card = buildListContentPages(stage, screen, onAction)[0].cards[0];
    assert.equal(card.disabled, true);
    stage.runCardActions(control, 'actor', staleCard.id);
    assert.equal(save.actors.bob.statMap.Mood, 4);
    const html = renderToStaticMarkup(<TooltipProvider><ContentCardList stage={() => stage} pages={buildListContentPages(stage, screen, onAction)} isVerticalLayout={false} /></TooltipProvider>);
    assert.match(html, /role="button" aria-disabled="true"/);
    assert.match(html, /opacity:0.56/);
    stage.runCardActions(control, 'actor', card.id);
    assert.equal(save.actors.bob.statMap.Mood, 4);
});

test('list sections expand String List headers, bind the header variable, and hide empty or inactive content', () => {
    const { stage } = fixture();
    const dynamic = { ...createListSection(), headerSource: functionReference('teams'), contentSource: membersByHeader };
    const literal = { ...createListSection(), header: 'Crew', contentSource: globalStatReference('Crew') };
    const empty = { ...createListSection(), header: 'Nobody', contentSource: '' };
    const control = new Screen({ type: 'list', sections: [dynamic, literal, empty] });
    const pages = stage.resolveListSections(control);
    assert.deepEqual(pages.map(page => [page.header, page.kind, page.ids]), [
        ['red', 'actor', ['alice']],
        ['blue', 'actor', ['bob']],
        ['Crew', 'actor', ['bob']],
    ]);
    assert.equal(new Set(pages.map(page => page.key)).size, pages.length);
    assert.throws(() => stage.resolveValue(HEADER_VARIABLE_VALUE, 'text'), /header/i);
    assert.deepEqual(stage.resolveTextList(globalStatReference('Title')), ['Squad']);
});

test('List Screen headers expand Stat and Function macros for display', () => {
    const { stage } = fixture();
    const screen = new Screen({ type: 'list', sections: [
        { ...createListSection(), header: '{{Title}} / {{Greeting}}', contentSource: globalStatReference('Crew') },
        { ...createListSection(), headerSource: functionReference('macro-teams'), contentSource: globalStatReference('Crew') },
    ] });

    assert.deepEqual(buildListContentPages(stage, screen, () => {}).map(page => page.title), [
        'Squad / Hello',
        'Squad',
        'Hello',
    ]);
});

test('a failing header source is skipped without hiding other sections', () => {
    const { stage, configuration } = fixture();
    configuration.functions.push({ id: 'broken', name: 'Broken', description: '', returnType: 'textList', script: 'throw new Error("nope");' });
    const errors = mock.method(console, 'error', () => {});
    try {
        const control = new Screen({ type: 'list', sections: [
            { ...createListSection(), headerSource: functionReference('broken'), contentSource: globalStatReference('Crew') },
            { ...createListSection(), header: 'Crew', contentSource: globalStatReference('Crew') },
        ] });
        assert.deepEqual(stage.resolveListSections(control).map(page => page.header), ['Crew']);
        assert.equal(errors.mock.callCount(), 1);
    } finally {
        errors.mock.restore();
    }
});

test('card details resolve content stats and functions bound to the card and header', () => {
    const { stage } = fixture();
    const mood = stage.resolveListCardDetail(contentStatReference('actor', 'Mood'), 'actor', 'alice', 'red');
    assert.equal(mood?.label, 'Mood');
    assert.equal(mood?.value, 3);
    const label = stage.resolveListCardDetail(functionReference('label', { Who: variableContentValue('actor'), Team: HEADER_VARIABLE_VALUE }), 'actor', 'bob', 'blue');
    assert.equal(label?.value, 'blue:bob');
    assert.equal(stage.resolveListCardDetail(contentStatReference('item', 'Mood'), 'actor', 'alice', 'red'), undefined);
});

test('stat badge details resolve their source with per-card availability and carry the control', () => {
    const { stage, configuration, save } = fixture();
    // Availability evaluation needs the content stat definitions, as the real schedule context provides.
    stage.getScheduleContext = () => ({ globalStats: configuration.globalStats, globalStatValues: save.globalStatValues, actorStats: configuration.actorStats });
    const moodBadge = new Control({
        type: 'statBadge', name: 'Mood Badge', contentType: 'actor', badgeSource: contentStatReference('actor', 'Mood'),
        displayType: 'rating', label: 'Mood!',
        availabilityConditions: [[{ type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Mood', comparison: 'greaterThan', value: 4 }]],
    });
    const labelBadge = new Control({
        type: 'statBadge', name: 'Label Badge', contentType: 'actor',
        badgeSource: functionReference('label', { Who: variableContentValue('actor'), Team: HEADER_VARIABLE_VALUE }),
    });
    const numberBadge = new Control({ type: 'statBadge', name: 'Number Badge', contentType: 'actor', badgeSource: functionReference('unrelated') });
    configuration.controls = [moodBadge, labelBadge, numberBadge];

    // Availability binds the card's entity: Bob (Mood 5) passes, Alice (Mood 3) does not.
    const resolved = stage.resolveListCardDetail(controlReference(moodBadge.id), 'actor', 'bob', 'blue');
    assert.equal(resolved?.control, moodBadge);
    assert.equal(resolved?.value, 5);
    assert.equal(resolved?.stat?.name, 'Mood');
    assert.equal(stage.resolveListCardDetail(controlReference(moodBadge.id), 'actor', 'alice', 'red'), undefined);

    // Function sources bind the variable content and header like plain function details.
    assert.equal(stage.resolveListCardDetail(controlReference(labelBadge.id), 'actor', 'bob', 'blue')?.value, 'blue:bob');

    // Numeric function sources synthesize a stat so display settings have a range.
    const numeric = stage.resolveListCardDetail(controlReference(numberBadge.id), 'actor', 'bob', 'blue');
    assert.equal(numeric?.value, 1);
    assert.equal(numeric?.stat?.type, 'number');

    // Content-kind mismatches and unknown controls resolve to nothing.
    assert.equal(stage.resolveListCardDetail(controlReference(moodBadge.id), 'item', 'sword', 'blue'), undefined);
    assert.equal(stage.resolveListCardDetail(controlReference('missing'), 'actor', 'bob', 'blue'), undefined);
});

test('stat badges render on list cards with their display settings', () => {
    const { stage, configuration } = fixture();
    const moodBadge = new Control({
        type: 'statBadge', name: 'Mood Badge', contentType: 'actor',
        badgeSource: contentStatReference('actor', 'Mood'), displayType: 'rating',
    });
    configuration.controls = [moodBadge];
    const section = { ...createListSection(), header: 'Crew', contentSource: globalStatReference('Crew') };
    configureCard(stage, section, { cardDetails: [controlReference(moodBadge.id)] });
    const pages = buildListContentPages(stage, new Screen({ type: 'list', sections: [section] }), () => {});
    const html = renderToStaticMarkup(<TooltipProvider><ContentCardList stage={() => stage} pages={pages} isVerticalLayout={false} /></TooltipProvider>);
    assert.match(html, new RegExp(`data-popup-card-detail="${controlReference(moodBadge.id)}"`));
    assert.match(html, /aria-label="Mood: 5 of 5"/);
    assert.doesNotMatch(html, />Mood<\/span>/);
    assert.doesNotMatch(html, /Mood Badge/);
});

test('stat badges omit blank labels while preserving icons, values, and descriptions', () => {
    const { stage, configuration } = fixture();
    for (const badgeSource of [contentStatReference('actor', 'Mood'), contentStatReference('actor', 'Team'), functionReference('greeting'), globalStatReference('Crew')]) {
        const badge = new Control({
            type: 'statBadge', name: 'Internal badge name', contentType: 'actor',
            badgeSource, label: '   ', iconName: 'star', description: 'Badge tooltip',
        });
        configuration.controls = [badge];
        const detail = stage.resolveListCardDetail(controlReference(badge.id), 'actor', 'bob', 'Crew');
        assert.ok(detail);
        const render = () => renderToStaticMarkup(<ListCardDetail detail={detail} stage={stage} isVerticalLayout={false} />);
        const html = render();
        assert.doesNotMatch(html, /Internal badge name|>Mood<\/span>|>Team<\/span>|>Greeting<\/span>|title="Crew"/);
        if (detail.type === 'number' || detail.type === 'text') {
            assert.match(html, /data-testid="StarIcon"/);
            assert.match(html, /title="Badge tooltip"/);
            assert.match(html, new RegExp(`>${detail.value}</span>`));
        }
        badge.label = 'Custom {{Greeting}}';
        assert.match(render(), /Custom Hello/);
    }
});

test('plain list stat details retain their source labels', () => {
    const { stage } = fixture();
    const detail = stage.resolveListCardDetail(contentStatReference('actor', 'Mood'), 'actor', 'bob', 'Crew');
    assert.ok(detail);
    const html = renderToStaticMarkup(<ListCardDetail detail={detail} stage={stage} isVerticalLayout={false} />);
    assert.match(html, />Mood<\/span>/);
    assert.match(html, />5<\/span>/);
});

test('stat badge editor uses standalone placement and help icons instead of inline guidance', () => {
    const { stage, configuration } = fixture();
    const badge = new Control({
        type: 'statBadge', contentType: 'actor', badgeSource: contentStatReference('actor', 'Mood'),
    });
    configuration.controls = [badge];
    const html = renderToStaticMarkup(<ControlDetailPanel control={badge} stage={() => stage} />);
    assert.match(html, /<option value="standalone" selected="">Standalone<\/option>/);
    assert.match(html, /<option value="statBadge" selected="">Stat Badge<\/option>/);
    assert.match(html, /placeholder="No label"/);
    for (const title of ['Control priority', 'Control availability', 'Badge content type', 'Badge value source', 'Badge label', 'Badge display']) {
        assert.match(html, new RegExp(`aria-label="${title}"`));
    }
    assert.doesNotMatch(html, /\(List Screens\)|Use source name|This badge can be attached|A stat of the chosen|Evaluated per entry|Function sources use|Arguments follow parameter order/);
});

test('card click actions bind Variable to the clicked content', () => {
    const { stage, save } = fixture();
    const card = new Control({ type: 'card',
        actions: [{ id: 'bump', kind: 'stat' as const, targetType: 'actor' as const, targetId: 'variable', statId: 'Mood', operation: 'adjust' as const, value: 2 }],
    });
    assert.equal(stage.runCardActions(card, 'actor', 'bob', 'Crew'), null);
    assert.equal(save.actors.bob.statMap.Mood, 7);
    assert.equal(save.actors.alice.statMap.Mood, 3);
});

test('List pages render their selected Card Control and run its actions', () => {
    const { stage, configuration } = fixture();
    const clickable = {
        ...createListSection(), headerSource: functionReference('teams'), contentSource: membersByHeader,
    };
    const badge = new Control({ type: 'statBadge', badgeSource: contentStatReference('actor', 'Mood'), label: 'Mood' });
    configuration.controls.push(badge);
    const control = configureCard(stage, clickable, {
        cardDetails: [controlReference(badge.id)],
        actions: [{ id: 'bump', kind: 'stat' as const, targetType: 'actor' as const, targetId: 'variable', statId: 'Mood', operation: 'adjust' as const, value: 1 }],
    });
    const passive = { ...createListSection(), header: 'Crew', contentSource: globalStatReference('Crew') };
    const onAction = mock.fn();
    const pages = buildListContentPages(stage, new Screen({ type: 'list', sections: [clickable, passive] }), onAction);
    assert.deepEqual(pages.map(page => page.title), ['red', 'blue', 'Crew']);
    const [red, , crew] = pages;
    assert.equal(crew.cards[0].onClick, undefined);
    let renderer: ReactTestRenderer;
    act(() => { renderer = create(<TooltipProvider><ContentCardControl stage={() => stage} control={control} kind="actor" id={red.cards[0].id} onAction={onAction} /></TooltipProvider>); });
    act(() => renderer.root.findAllByType('div').find(node => node.props['data-card-control'] === control.id)!.props.onClick());
    act(() => renderer.unmount());
    assert.equal(onAction.mock.callCount(), 1);
    assert.equal(stage.getSave().actors.alice.statMap.Mood, 4);

    const html = renderToStaticMarkup(<TooltipProvider><ContentCardList stage={() => stage} pages={pages} isVerticalLayout={false} /></TooltipProvider>);
    assert.match(html, /data-content-card="actor"/);
    assert.match(html, /Alice/);
    assert.ok(html.includes(`data-popup-card-detail="${controlReference(badge.id)}"`));
    assert.match(html, /<button[^>]*aria-label="Next: blue"/);
    assert.match(html, /<button[^>]*aria-label="Previous: Crew"/);
});

test('content card lists hide empty pages and show an empty state', () => {
    const { stage } = fixture();
    const html = renderToStaticMarkup(<TooltipProvider><ContentCardList stage={() => stage} isVerticalLayout={false} emptyTitle="Nothing" emptyMessage="Empty here."
        pages={[{ key: 'a', title: 'Hidden', cards: [] }]} /></TooltipProvider>);
    assert.doesNotMatch(html, /Hidden/);
    assert.match(html, /Nothing/);
    assert.match(html, /Empty here\./);
    const locations = renderToStaticMarkup(<TooltipProvider><ContentCardList stage={() => stage} isVerticalLayout={false}
        pages={[{ key: 'p', title: 'Places', cards: [{ key: 'park', kind: 'location', id: 'park', subtitle: 'Unavailable', disabled: true, onClick: () => {} }] }]} /></TooltipProvider>);
    assert.match(locations, /data-content-card="location"/);
    assert.match(locations, /role="button" aria-disabled="true"/);
    assert.match(locations, /Park/);
    assert.match(locations, /Unavailable/);
});

test('editor pickers offer header, content, and kind-filtered detail sources', () => {
    const { stage } = fixture();
    const headers = listHeaderSourceOptions(stage).map(option => option.key);
    assert.ok(headers.includes(functionReference('teams')));
    assert.ok(headers.includes(functionReference('label')));
    assert.ok(headers.includes(globalStatReference('Title')));
    assert.ok(!headers.includes(functionReference('members')));
    assert.deepEqual(listContentSourceOptions(stage).map(option => option.key), [functionReference('members'), globalStatReference('Crew')]);
    assert.deepEqual(contentDetailSourceOptions(stage, 'actor').map(option => option.key), [functionReference('label'), 'actorStat:Mood', 'actorStat:Team']);
    assert.deepEqual(listDetailOptions(stage, 'actor'), []);
    assert.deepEqual(listDetailOptions(stage, 'item'), []);
});

test('list detail pickers offer active stat badges matching the content kind', () => {
    const { stage, configuration } = fixture();
    const moodBadge = new Control({ type: 'statBadge', name: 'Mood Badge', contentType: 'actor', badgeSource: contentStatReference('actor', 'Mood') });
    const itemBadge = new Control({ type: 'statBadge', name: 'Quality Badge', contentType: 'item' });
    configuration.controls = [
        moodBadge,
        itemBadge,
        new Control({ type: 'statBadge', name: 'Hidden Badge', contentType: 'actor', active: false }),
        new Control({ type: 'button', name: 'Button' }),
    ];
    const actorOptions = listDetailOptions(stage, 'actor');
    assert.deepEqual(actorOptions.map(option => option.key), [controlReference(moodBadge.id)]);
    assert.equal(actorOptions[0].category, 'Stat Badges');
    assert.deepEqual(listDetailOptions(stage, 'item').map(option => option.key), [controlReference(itemBadge.id)]);
});

test('Screen editor switches between Map and List options; Controls only select Screens', () => {
    const { stage, configuration } = fixture();
    const section = { ...createListSection(), header: 'Crew', contentSource: globalStatReference('Crew') };
    const screen = new Screen({ name: 'Crew List', type: 'list', sections: [section] });
    configuration.screens.push(screen, new Screen({ name: 'World Map' }));
    const props = { stage: () => stage, isCreatorMode: true, onChange: () => {}, onDeactivate: () => {} };
    const list = renderToStaticMarkup(<ScreenDetailPanel {...props} screen={screen} />);
    assert.match(list, /value="list" selected="">List/);
    assert.match(list, /Add Header/);
    assert.match(list, /Card Control/);
    assert.doesNotMatch(list, /Card Details|Card Click Actions|Entry Visibility|Entry Availability/);
    assert.doesNotMatch(list, /Map Image URL|Add Link/);
    const map = renderToStaticMarkup(<ScreenDetailPanel {...props} screen={configuration.screens[1]} />);
    assert.match(map, /Map Image URL|Add Link/);
    assert.doesNotMatch(map, /Add Header/);
    const control = renderToStaticMarkup(<ControlDetailPanel stage={() => stage} control={new Control({ type: 'popup', screenId: screen.id })} />);
    assert.match(control, /Crew List \(List\)/);
    assert.match(control, /World Map \(Map\)/);
    assert.doesNotMatch(control, /Add Header|Card Details|control-popup-display/);
});

for (const isCreatorMode of [true, false]) {
    test(`Screen type and List rules persist on editor exit (creator: ${isCreatorMode})`, () => {
        const { stage, configuration, save } = fixture();
        const section = { ...createListSection(), header: 'Crew', contentSource: globalStatReference('Crew') };
        const screen = new Screen({ name: 'Switchable', sections: [section], imageUrl: '' });
        configuration.screens = [screen];
        save.screens = [new Screen(screen)];
        stage.updateConfiguration = updates => Object.assign(configuration, updates);
        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
        Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
        let renderer: ReactTestRenderer | undefined;
        try {
            act(() => {
                renderer = create(<TooltipProvider><ScreenDetailPanel screen={isCreatorMode ? screen : save.screens[0]}
                    stage={() => stage} isCreatorMode={isCreatorMode} onChange={() => {}} onDeactivate={() => {}} /></TooltipProvider>);
            });
            assert.ok(renderer);
            const addButton = renderer.root.findAllByType('button').find(button =>
                button.children.some(child => typeof child === 'string' && child.includes('Add Button')));
            assert.ok(addButton);
            act(() => addButton.props.onClick());
            act(() => renderer!.root.findByProps({ 'aria-label': 'Screen Type' }).props.onChange({ target: { value: 'list' } }));
            assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Expand Links' }).length, 0);
            configureCard(stage, section);
            const editor = renderer.root.findByType(ListSectionsEditor);
            act(() => editor.props.onChange([section]));
            act(() => renderer!.unmount());
            renderer = undefined;
            const saved = (isCreatorMode ? configuration : save).screens[0];
            assert.equal(saved.type, 'list');
            assert.deepEqual(saved.sections, [section]);
        } finally {
            if (renderer) act(() => renderer?.unmount());
            if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
            else Reflect.deleteProperty(globalThis, 'window');
        }
    });
}

test('Apply immediately flushes a pending Screen type edit into the active save', () => {
    const { stage, configuration, save } = fixture();
    const screen = new Screen({ name: 'Switchable', sections: [{ ...createListSection(), header: 'Crew' }] });
    configuration.screens = [screen];
    stage.updateConfiguration = updates => Object.assign(configuration, updates);
    stage.showPriorityMessage = () => {};
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
    let renderer: ReactTestRenderer | undefined;
    try {
        act(() => {
            renderer = create(<TooltipProvider><ScreenDetailPanel screen={screen} stage={() => stage}
                isCreatorMode onChange={() => {}} onDeactivate={() => {}} /></TooltipProvider>);
        });
        assert.ok(renderer);
        act(() => renderer!.root.findByProps({ 'aria-label': 'Screen Type' }).props.onChange({ target: { value: 'list' } }));
        const apply = renderer.root.findAllByType('button').find(button => button.children.includes('Apply'));
        assert.ok(apply);
        act(() => apply.props.onClick());
        assert.equal(save.screens[0].type, 'list');
        assert.equal(save.screens[0].sections[0].header, 'Crew');
        assert.equal(save.screens[0].links.length, 1);
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});

test('text inputs offer the header variable only inside list pop-up contexts', () => {
    const text = stat('Team', 'text', '');
    const plain = renderToStaticMarkup(<StatValueInput stat={text} value="red" onChange={() => {}} />);
    assert.doesNotMatch(plain, /Use Header/);
    const offered = renderToStaticMarkup(<HeaderVariableContext.Provider value={true}><StatValueInput stat={text} value="red" onChange={() => {}} /></HeaderVariableContext.Provider>);
    assert.match(offered, /Use Header/);
    const bound = renderToStaticMarkup(<StatValueInput stat={text} value={HEADER_VARIABLE_VALUE} onChange={() => {}} />);
    assert.match(bound, />Header<.*Replace/);
});
