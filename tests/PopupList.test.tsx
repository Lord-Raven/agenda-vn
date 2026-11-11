import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Actor, ACTOR_SCHEDULE_UNAVAILABLE } from '../src/content/Actor';
import { Item } from '../src/content/Item';
import { Location } from '../src/content/Location';
import { cloneStat, Stat, StatType, StatValue } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { cloneListSection, contentStatReference, Screen, createListSection, parseContentStatReference, listContentKind } from '../src/content/Screen';
import { functionReference, globalStatReference, HEADER_VARIABLE_VALUE, GameFunction } from '../src/content/Function';
import { ConditionCollection, variableContentValue } from '../src/content/Condition';
import { buildListContentPages, ListCardDetail } from '../src/screens/ListScreenView';
import { ContentCardList, ContentCardView } from '../src/components/ContentCardList';
import { listContentSourceOptions, listDetailOptions, listHeaderSourceOptions } from '../src/components/ListSectionsEditor';
import { TooltipProvider } from '../src/components/TooltipContext';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';
import { Control, controlReference } from '../src/content/Control';
import { ScreenDetailPanel } from '../src/screens/ScreenDetailPanel';
import { StatValueInput } from '../src/components/StatValueInput';
import { HeaderVariableContext } from '../src/components/VariableContentContext';
import { ConditionEditor } from '../src/components/ConditionEditor';

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

test('Screens default to Map and deep-clone List sections', () => {
    const plain = new Screen();
    assert.equal(plain.type, 'map');
    assert.deepEqual(plain.sections, []);
    const section = { ...createListSection(), header: 'Team', details: ['actorStat:Mood'] };
    const control = new Screen({ type: 'list', sections: [section] });
    assert.equal(control.type, 'list');
    assert.deepEqual(control.sections, [section]);
    assert.notEqual(control.sections[0], section);
    const clone = cloneListSection(section);
    clone.details.push('x');
    assert.deepEqual(section.details, ['actorStat:Mood']);
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

test('List entry conditions default to unrestricted and deep-clone across serialization', () => {
    const legacy = cloneListSection({ id: 'legacy', header: 'Crew' });
    assert.deepEqual(legacy.visibilityConditions, []);
    assert.deepEqual(legacy.availabilityConditions, []);
    const section = createListSection();
    section.visibilityConditions = [[{ type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: 'alice' }]];
    section.availabilityConditions = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Squad' }]];
    const screen = new Screen({ type: 'list', sections: [section] });
    const restored = new Screen(JSON.parse(JSON.stringify(screen)));
    assert.deepEqual(restored.sections, [section]);
    screen.sections[0].visibilityConditions[0][0].value = 'bob';
    screen.sections[0].availabilityConditions[0][0].value = 'Other';
    assert.equal(section.visibilityConditions[0][0].value, 'alice');
    assert.equal(section.availabilityConditions[0][0].value, 'Squad');
    assert.deepEqual(restored.sections, [section]);
});

test('List entry conditions bind each card and retain OR groups and AND conditions per header', () => {
    const { stage, save } = fixture();
    save.globalStatValues!.Crew = ['alice', 'bob', 'gone', 'missing', 'alice'];
    const section = { ...createListSection(), header: 'Restricted', contentSource: globalStatReference('Crew') };
    section.visibilityConditions = [
        [
            { type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: 'alice' },
            { type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Mood', comparison: 'greaterThan', value: 3 },
        ],
        [{ type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: 'bob' }],
    ];
    section.availabilityConditions = [[{ type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Mood', comparison: 'greaterThan', value: 5 }]];
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
    screen.sections[0].visibilityConditions = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Other' }]];
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
        section.visibilityConditions = conditions;
        const screen = new Screen({ type: 'list', sections: [section] });
        assert.deepEqual(stage.resolveListSections(screen).map(page => page.ids), [[id]]);
        screen.sections[0].header = 'Denied';
        assert.deepEqual(stage.resolveListSections(screen), []);
        screen.sections[0].visibilityConditions = [];
        screen.sections[0].availabilityConditions = conditions;
        assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, [id]);
        screen.sections[0].header = 'Allowed';
        assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, []);
        const alternateSave = { ...save, globalStatValues: { ...save.globalStatValues, Title: 'Alternate' } };
        screen.sections[0].availabilityConditions = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Alternate' }]];
        assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, [id]);
        assert.deepEqual(stage.resolveListSections(screen, alternateSave)[0].unavailableIds, []);
    });
}

test('List entry rules never override location visibility or availability, including event access', () => {
    const { stage, configuration, save } = fixture();
    configuration.globalStats.push(stat('Places', 'locationList', ['park']));
    const section = { ...createListSection(), header: 'Places', contentSource: globalStatReference('Places') };
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
    screen.sections[0].availabilityConditions = fails;
    assert.deepEqual(stage.resolveListSections(screen)[0].unavailableIds, ['park']);
    screen.sections[0].availabilityConditions = [];
    location.availabilityConditions.disabled = passes;
    assert.deepEqual(stage.resolveListSections(screen), []);
});

test('unavailable actors and items remain visible but disabled in List Screens', () => {
    const { stage, save } = fixture();
    save.actors.bob.schedule = { [ACTOR_SCHEDULE_UNAVAILABLE]: [[]] };
    save.inventory[0].availabilityConditions = [[{ type: 'globalStat', statId: 'Title', comparison: 'equals', value: 'Other' }]];
    for (const [kind, id] of [['actor', 'bob'], ['item', 'sword']] as const) {
        assert.deepEqual(stage.resolveListCardState(createListSection(), kind, id, 'Crew'), { visible: true, available: false });
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
    section.visibilityConditions = [[{
        type: 'function', reference: functionReference('fails-for-alice', { Who: variableContentValue('actor') }),
        comparison: 'equals', value: true,
    }]];
    const log = mock.method(console, 'error', () => {});
    try {
        assert.deepEqual(stage.resolveListSections(new Screen({ type: 'list', sections: [section] }))[0].ids, ['bob']);
        assert.ok(log.mock.calls.some(call => /List entry "alice".*Bad entry/.test(String(call.arguments[0]))));
    } finally {
        log.mock.restore();
    }
});

test('unavailable List cards stay dim after animation and cannot run actions, even through stale handlers', () => {
    const { stage, save } = fixture();
    const section = {
        ...createListSection(), contentSource: globalStatReference('Crew'),
        actions: [{ id: 'bump', kind: 'stat' as const, targetType: 'actor' as const, targetId: 'variable', statId: 'Mood', operation: 'adjust' as const, value: 1 }],
    };
    section.availabilityConditions = [[{ type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Mood', comparison: 'greaterThan', value: 4 }]];
    const screen = new Screen({ type: 'list', sections: [section] });
    const onAction = mock.fn();
    const staleCard = buildListContentPages(stage, screen, onAction)[0].cards[0];
    assert.equal(staleCard.disabled, false);
    save.actors.bob.statMap.Mood = 4;
    const card = buildListContentPages(stage, screen, onAction)[0].cards[0];
    assert.equal(card.disabled, true);
    const element = ContentCardView({ card, index: 0, stage: () => stage, isVerticalLayout: false, reduceMotion: true });
    assert.equal(element.props.disabled, true);
    assert.equal(element.props.animate.opacity, 0.56);
    staleCard.onClick?.();
    assert.equal(save.actors.bob.statMap.Mood, 4);
    const html = renderToStaticMarkup(<TooltipProvider><ContentCardList stage={() => stage} pages={buildListContentPages(stage, screen, onAction)} isVerticalLayout={false} /></TooltipProvider>);
    assert.match(html, /<button[^>]*disabled=""/);
    card.onClick?.();
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
    const section = { ...createListSection(), header: 'Crew', contentSource: globalStatReference('Crew'), details: [controlReference(moodBadge.id)] };
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
    const section = {
        ...createListSection(), header: 'Crew', contentSource: globalStatReference('Crew'),
        actions: [{ id: 'bump', kind: 'stat' as const, targetType: 'actor' as const, targetId: 'variable', statId: 'Mood', operation: 'adjust' as const, value: 2 }],
    };
    assert.equal(stage.runListCardActions(section, 'actor', 'bob', 'Crew'), null);
    assert.equal(save.actors.bob.statMap.Mood, 7);
    assert.equal(save.actors.alice.statMap.Mood, 3);
});

test('pop-up pages render shared cards with details, and only sections with actions are clickable', () => {
    const { stage } = fixture();
    const clickable = {
        ...createListSection(), headerSource: functionReference('teams'), contentSource: membersByHeader,
        details: [contentStatReference('actor', 'Mood')],
        actions: [{ id: 'bump', kind: 'stat' as const, targetType: 'actor' as const, targetId: 'variable', statId: 'Mood', operation: 'adjust' as const, value: 1 }],
    };
    const passive = { ...createListSection(), header: 'Crew', contentSource: globalStatReference('Crew') };
    const onAction = mock.fn();
    const pages = buildListContentPages(stage, new Screen({ type: 'list', sections: [clickable, passive] }), onAction);
    assert.deepEqual(pages.map(page => page.title), ['red', 'blue', 'Crew']);
    const [red, , crew] = pages;
    assert.equal(crew.cards[0].onClick, undefined);
    red.cards[0].onClick?.();
    assert.equal(onAction.mock.callCount(), 1);
    assert.equal(stage.getSave().actors.alice.statMap.Mood, 4);

    const html = renderToStaticMarkup(<TooltipProvider><ContentCardList stage={() => stage} pages={pages} isVerticalLayout={false} /></TooltipProvider>);
    assert.match(html, /data-content-card="actor"/);
    assert.match(html, /Alice/);
    assert.match(html, /data-popup-card-detail="actorStat:Mood"/);
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
    assert.match(locations, /<button[^>]*disabled=""/);
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
    assert.deepEqual(listDetailOptions(stage, 'actor').map(option => option.key), [functionReference('label'), 'actorStat:Mood', 'actorStat:Team']);
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
    assert.deepEqual(actorOptions.map(option => option.key), [controlReference(moodBadge.id), functionReference('label'), 'actorStat:Mood', 'actorStat:Team']);
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
    assert.match(list, /Card Details/);
    assert.match(list, /Card Click Actions/);
    assert.match(list, /Entry Visibility/);
    assert.match(list, /Entry Availability/);
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
            section.visibilityConditions = [[{ type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: 'bob' }]];
            section.availabilityConditions = [[{ type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Mood', comparison: 'greaterThan', value: 3 }]];
            const entryEditors = () => renderer!.root.findAllByType(ConditionEditor).filter(editor => editor.props.variableContentType === 'actor');
            assert.equal(entryEditors().length, 2);
            act(() => entryEditors()[0].props.onChange(section.visibilityConditions));
            act(() => entryEditors()[1].props.onChange(section.availabilityConditions));
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
