import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Actor } from '../src/content/Actor';
import { Item } from '../src/content/Item';
import { Location } from '../src/content/Location';
import { cloneStat, Stat, StatType, StatValue } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { clonePopupSection, contentStatReference, Control, createPopupSection, parseContentStatReference, popupContentKind } from '../src/content/Control';
import { functionReference, globalStatReference, HEADER_VARIABLE_VALUE, GameFunction } from '../src/content/Function';
import { variableContentValue } from '../src/content/Condition';
import { buildPopupContentPages } from '../src/components/PopupControl';
import { ContentCardList } from '../src/components/ContentCardList';
import { popupContentSourceOptions, popupDetailOptions, popupHeaderSourceOptions } from '../src/components/PopupSectionsEditor';
import { TooltipProvider } from '../src/components/TooltipContext';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';
import { StatValueInput } from '../src/components/StatValueInput';
import { HeaderVariableContext } from '../src/components/VariableContentContext';

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
        { id: 'unrelated', name: 'Unrelated', description: '', returnType: 'number', script: 'return 1;' },
    ];
    const actorStats = [stat('Mood', 'number', 0), stat('Team', 'text', '')];
    const configuration: GameConfiguration = {
        actors, items: [item], locations: [location], maps: [], universalSchedule: {},
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
        atlas: { park: location }, inventory: [item], maps: [], universalSchedule: {},
        timeline: [], timestamp: 0, globalStatValues: { Title: 'Squad', Crew: ['bob'] },
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.saveGame = () => {};
    stage.getScheduleContext = () => ({ globalStats: configuration.globalStats, globalStatValues: save.globalStatValues });
    stage.getSkitConditionState = () => undefined;
    return { stage, configuration, save };
};

const membersByHeader = functionReference('members', { Team: HEADER_VARIABLE_VALUE });

test('pop-up controls default to map display and deep-clone list sections', () => {
    const plain = new Control({ type: 'popup' });
    assert.equal(plain.popupDisplay, 'map');
    assert.deepEqual(plain.popupSections, []);
    const section = { ...createPopupSection(), header: 'Team', details: ['actorStat:Mood'] };
    const control = new Control({ type: 'popup', popupDisplay: 'list', popupSections: [section] });
    assert.equal(control.popupDisplay, 'list');
    assert.deepEqual(control.popupSections, [section]);
    assert.notEqual(control.popupSections[0], section);
    const clone = clonePopupSection(section);
    clone.details.push('x');
    assert.deepEqual(section.details, ['actorStat:Mood']);
    assert.deepEqual(parseContentStatReference(contentStatReference('item', 'Weight')), { kind: 'item', statId: 'Weight' });
    assert.equal(parseContentStatReference(globalStatReference('Title')), undefined);
});

test('content kinds come from list function and global stat return types', () => {
    const { configuration } = fixture();
    assert.equal(popupContentKind(configuration, membersByHeader), 'actor');
    assert.equal(popupContentKind(configuration, globalStatReference('Crew')), 'actor');
    assert.equal(popupContentKind(configuration, globalStatReference('Title')), undefined);
    assert.equal(popupContentKind(configuration, ''), undefined);
});

test('list sections expand String List headers, bind the header variable, and hide empty or inactive content', () => {
    const { stage } = fixture();
    const dynamic = { ...createPopupSection(), headerSource: functionReference('teams'), contentSource: membersByHeader };
    const literal = { ...createPopupSection(), header: 'Crew', contentSource: globalStatReference('Crew') };
    const empty = { ...createPopupSection(), header: 'Nobody', contentSource: '' };
    const control = new Control({ type: 'popup', popupDisplay: 'list', popupSections: [dynamic, literal, empty] });
    const pages = stage.resolvePopupSections(control);
    assert.deepEqual(pages.map(page => [page.header, page.kind, page.ids]), [
        ['red', 'actor', ['alice']],
        ['blue', 'actor', ['bob']],
        ['Crew', 'actor', ['bob']],
    ]);
    assert.equal(new Set(pages.map(page => page.key)).size, pages.length);
    assert.throws(() => stage.resolveValue(HEADER_VARIABLE_VALUE, 'text'), /header/i);
    assert.deepEqual(stage.resolveTextList(globalStatReference('Title')), ['Squad']);
});

test('a failing header source is skipped without hiding other sections', () => {
    const { stage, configuration } = fixture();
    configuration.functions.push({ id: 'broken', name: 'Broken', description: '', returnType: 'textList', script: 'throw new Error("nope");' });
    const errors = mock.method(console, 'error', () => {});
    try {
        const control = new Control({ type: 'popup', popupDisplay: 'list', popupSections: [
            { ...createPopupSection(), headerSource: functionReference('broken'), contentSource: globalStatReference('Crew') },
            { ...createPopupSection(), header: 'Crew', contentSource: globalStatReference('Crew') },
        ] });
        assert.deepEqual(stage.resolvePopupSections(control).map(page => page.header), ['Crew']);
        assert.equal(errors.mock.callCount(), 1);
    } finally {
        errors.mock.restore();
    }
});

test('card details resolve content stats and functions bound to the card and header', () => {
    const { stage } = fixture();
    const mood = stage.resolvePopupCardDetail(contentStatReference('actor', 'Mood'), 'actor', 'alice', 'red');
    assert.equal(mood?.label, 'Mood');
    assert.equal(mood?.value, 3);
    const label = stage.resolvePopupCardDetail(functionReference('label', { Who: variableContentValue('actor'), Team: HEADER_VARIABLE_VALUE }), 'actor', 'bob', 'blue');
    assert.equal(label?.value, 'blue:bob');
    assert.equal(stage.resolvePopupCardDetail(contentStatReference('item', 'Mood'), 'actor', 'alice', 'red'), undefined);
});

test('card click actions bind Variable to the clicked content', () => {
    const { stage, save } = fixture();
    const section = {
        ...createPopupSection(), header: 'Crew', contentSource: globalStatReference('Crew'),
        actions: [{ id: 'bump', kind: 'stat' as const, targetType: 'actor' as const, targetId: 'variable', statId: 'Mood', operation: 'adjust' as const, value: 2 }],
    };
    assert.equal(stage.runPopupCardActions(section, 'actor', 'bob', 'Crew'), null);
    assert.equal(save.actors.bob.statMap.Mood, 7);
    assert.equal(save.actors.alice.statMap.Mood, 3);
});

test('pop-up pages render shared cards with details, and only sections with actions are clickable', () => {
    const { stage } = fixture();
    const clickable = {
        ...createPopupSection(), headerSource: functionReference('teams'), contentSource: membersByHeader,
        details: [contentStatReference('actor', 'Mood')],
        actions: [{ id: 'bump', kind: 'stat' as const, targetType: 'actor' as const, targetId: 'variable', statId: 'Mood', operation: 'adjust' as const, value: 1 }],
    };
    const passive = { ...createPopupSection(), header: 'Crew', contentSource: globalStatReference('Crew') };
    const onAction = mock.fn();
    const pages = buildPopupContentPages(stage, new Control({ type: 'popup', popupDisplay: 'list', popupSections: [clickable, passive] }), onAction);
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
    const headers = popupHeaderSourceOptions(stage).map(option => option.key);
    assert.ok(headers.includes(functionReference('teams')));
    assert.ok(headers.includes(functionReference('label')));
    assert.ok(headers.includes(globalStatReference('Title')));
    assert.ok(!headers.includes(functionReference('members')));
    assert.deepEqual(popupContentSourceOptions(stage).map(option => option.key), [functionReference('members'), globalStatReference('Crew')]);
    assert.deepEqual(popupDetailOptions(stage, 'actor').map(option => option.key), [functionReference('label'), 'actorStat:Mood', 'actorStat:Team']);
    assert.deepEqual(popupDetailOptions(stage, 'item'), []);
});

test('pop-up editor switches between map and list displays', () => {
    const { stage } = fixture();
    const section = { ...createPopupSection(), header: 'Crew', contentSource: globalStatReference('Crew') };
    const list = renderToStaticMarkup(<ControlDetailPanel stage={() => stage}
        control={new Control({ type: 'popup', popupDisplay: 'list', popupSections: [section] })} />);
    assert.match(list, /value="list" selected="">List/);
    assert.match(list, /Add Header/);
    assert.match(list, /Card Details/);
    assert.match(list, /Card Click Actions/);
    assert.doesNotMatch(list, /Select a map/);
    const map = renderToStaticMarkup(<ControlDetailPanel stage={() => stage} control={new Control({ type: 'popup' })} />);
    assert.match(map, /Select a map/);
    assert.doesNotMatch(map, /Add Header/);
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
