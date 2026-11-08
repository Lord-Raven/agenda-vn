import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { TooltipProvider } from '../src/components/TooltipContext';
import { Screen as GameMap, createListSection } from '../src/content/Screen';
import { Actor } from '../src/content/Actor';
import { cloneStat } from '../src/content/Stat';
import { globalStatReference } from '../src/content/Function';
import { Control } from '../src/content/Control';
import { Skit } from '../src/content/Skit';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { CalendarScreen } from '../src/screens/CalendarScreen';
import { GameManagementPanel } from '../src/screens/GameManagementPanel';
import { MapScreen } from '../src/screens/MapScreen';
import { MenuScreen } from '../src/screens/MenuScreen';
import { SkitScreen } from '../src/screens/SkitScreen';
import { ScreenDetailPanel } from '../src/screens/ScreenDetailPanel';

const createStage = (withMap = false) => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], screens: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], functions: [], globalStatValues: {}, statUpdateRules: [], controls: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-23',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: '', actors: {}, atlas: {}, inventory: [], universalSchedule: {},
        screens: withMap ? [new GameMap({ name: 'Test map' })] : [],
        timeline: [], timestamp: 0, globalStatValues: {}, currentDate: '2026-10-23',
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.getCurrentSkit = () => new Skit({ id: 'test-skit' });
    stage.saveData = { configuration, saves: [save, undefined], lastSaveSlot: 0 };
    return stage;
};

const addListScreen = (stage: Stage, priority = 0) => {
    const actor = new Actor({ id: 'listed-actor', name: 'Listed Actor' });
    stage.getSave().actors[actor.id] = actor;
    stage.getConfiguration().globalStats.push(cloneStat({
        id: 'screen-content', name: 'Screen Content', type: 'actorList', default: [actor.id], guidance: '',
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    }));
    stage.getSave().globalStatValues!['screen-content'] = [actor.id];
    const screen = new GameMap({
        type: 'list', name: 'Reusable List', priority,
        sections: [{ ...createListSection(), header: 'Custom Header', contentSource: globalStatReference('screen-content') }],
    });
    stage.getSave().screens.push(screen);
    return screen;
};

const renderMapScreen = (stage: Stage) => renderToStaticMarkup(
    <TooltipProvider><MapScreen stage={() => stage} setScreenType={() => {}} isVerticalLayout={false} /></TooltipProvider>,
);

for (const type of ['list', 'map'] as const) {
    test(`${type} Screen details keep grid rows top-aligned with consistent spacing`, () => {
        const stage = createStage();
        const screen = new GameMap({ type, name: 'Test Screen' });
        stage.getConfiguration().screens.push(screen);
        const html = renderToStaticMarkup(
            <ScreenDetailPanel screen={screen} stage={() => stage} isCreatorMode onChange={() => {}} onDeactivate={() => {}} />,
        );
        const panelStyle = html.match(/^<div style="([^"]+)"/)?.[1];
        assert.ok(panelStyle);
        assert.match(panelStyle, /display:grid/);
        assert.match(panelStyle, /align-content:start/);
        assert.match(panelStyle, /gap:10px/);
        assert.match(panelStyle, /min-height:100%/);
    });
}

test('a List Screen replaces the default location list and shares its paged cards', () => {
    const stage = createStage();
    addListScreen(stage);
    const html = renderMapScreen(stage);
    assert.match(html, /Custom Header/);
    assert.match(html, /Listed Actor/);
    assert.doesNotMatch(html, /No Locations/);
});

for (const listWins of [true, false]) {
    test(`Screen priorities select ${listWins ? 'List' : 'Map'} across types`, () => {
        const stage = createStage(true);
        const map = stage.getSave().screens[0];
        map.name = 'Priority Map';
        map.priority = listWins ? 10 : -10;
        addListScreen(stage);
        const html = renderMapScreen(stage);
        assert.equal(html.includes('Custom Header'), listWins);
        assert.equal(html.includes('Priority Map'), !listWins);
    });
}

test('equal Screen priorities use configuration order, not names', () => {
    const stage = createStage();
    const list = addListScreen(stage);
    const map = new GameMap({ name: 'A Map' });
    stage.getSave().screens.push(map);
    assert.match(renderMapScreen(stage), /Custom Header/);
    stage.getSave().screens = [map, list];
    assert.doesNotMatch(renderMapScreen(stage), /Custom Header/);
    assert.match(renderMapScreen(stage), /A Map/);
});

test('no Screens, inactive Screens, and unavailable Screens retain the default List fallback', () => {
    const stage = createStage();
    assert.match(renderMapScreen(stage), /No Locations/);
    const screen = addListScreen(stage);
    screen.active = false;
    assert.match(renderMapScreen(stage), /No Locations/);
    screen.active = true;
    stage.getConfiguration().globalStats.push(cloneStat({
        id: 'qualifies', name: 'Qualifies', type: 'checkbox', default: false, guidance: '',
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    }));
    stage.getSave().globalStatValues!.qualifies = false;
    screen.availabilityConditions = [[{ type: 'globalStat', statId: 'qualifies', comparison: 'equals', value: true }]];
    assert.match(renderMapScreen(stage), /No Locations/);
    stage.getSave().globalStatValues!.qualifies = true;
    assert.match(renderMapScreen(stage), /Custom Header/);
});

test('an available empty List Screen shows its own empty state, not the default fallback', () => {
    const stage = createStage();
    stage.getSave().screens.push(new GameMap({ type: 'list', name: 'Empty Screen' }));
    const html = renderMapScreen(stage);
    assert.match(html, /Empty Screen/);
    assert.match(html, /No headers configured for this Screen/);
    assert.doesNotMatch(html, /No Locations/);
});

test('main menu lists Content Management immediately beneath Settings', () => {
    const stage = createStage();
    const html = renderToStaticMarkup(
        <TooltipProvider><MenuScreen stage={() => stage} setScreenType={() => {}} /></TooltipProvider>,
    );
    const labels = [...html.matchAll(/<button\b[^>]*>([^<]+)<\/button>/g)].map(match => match[1]);
    const settingsIndex = labels.indexOf('Settings');
    assert.ok(settingsIndex >= 0);
    assert.equal(labels[settingsIndex + 1], 'Content Management');
});

test('main menu version notes preserve newlines and blank lines as text', () => {
    const stage = createStage();
    stage.getConfiguration().versionNotes = 'First release\n\nSecond release\n<em>Plain text</em>';
    const useState = React.useState;
    const stateMock = mock.method(React, 'useState', (initial: unknown) =>
        useState(initial === 'menu' ? 'version' : initial));
    try {
        const html = renderToStaticMarkup(
            <TooltipProvider><MenuScreen stage={() => stage} setScreenType={() => {}} /></TooltipProvider>,
        );
        assert.match(html, /white-space:pre-line;[^"]*"[^>]*>First release\n\nSecond release\n&lt;em&gt;Plain text&lt;\/em&gt;<\/div>/);
    } finally {
        stateMock.mock.restore();
    }
});

for (const newline of ['\n', '\r\n', '\r']) {
    test(`creator notes export preserves version notes with ${JSON.stringify(newline)} line endings`, () => {
        const stage = createStage();
        stage.getConfiguration().creatorNotes = '<strong>Creator introduction</strong>';
        stage.getConfiguration().versionNotes = `First release${newline}${newline}Second release${newline}Final release`;
        const html = renderToStaticMarkup(
            <TooltipProvider><GameManagementPanel stage={() => stage} /></TooltipProvider>,
        );
        assert.ok(html.includes('&lt;strong&gt;Creator introduction&lt;/strong&gt;&lt;br&gt;&lt;br&gt;&lt;h3&gt;Version Notes&lt;/h3&gt;&lt;br&gt;First release&lt;br&gt;&lt;br&gt;Second release&lt;br&gt;Final release'));
    });
}

for (const isVerticalLayout of [false, true]) {
    for (const screen of ['calendar', 'turn-calendar', 'locations', 'map', 'skit'] as const) {
        test(`${screen} keeps bar controls outside the non-modal popup in ${isVerticalLayout ? 'vertical' : 'horizontal'} layout`, () => {
            const stage = createStage(screen === 'map');
            const configuration = stage.getConfiguration();
            if (screen === 'turn-calendar') configuration.dateMode = 'turnBased';
            const popupMap = new GameMap({ id: 'popup-map', name: 'Popup map', active: false });
            stage.getSave().screens.push(popupMap);
            configuration.controls.push(
                new Control({ type: 'popup', name: 'Popup content', screenId: popupMap.id }),
                new Control({ type: 'button', placement: 'top', label: 'Top Bar Action' }),
                new Control({ type: 'button', placement: 'bottom', label: 'Bottom Bar Action' }),
            );
            const props = { stage: () => stage, setScreenType: () => {}, isVerticalLayout };
            const content = screen === 'calendar' || screen === 'turn-calendar' ? <CalendarScreen {...props} />
                : screen === 'skit' ? <SkitScreen {...props} />
                    : <MapScreen {...props} />;
            const html = renderToStaticMarkup(<TooltipProvider>{content}</TooltipProvider>);
            assert.equal((html.match(/data-popup-control-overlay="true"/g) || []).length, 1);
            assert.match(html, /role="dialog" aria-modal="false"/);
            assert.doesNotMatch(html, /MuiModal-root|MuiBackdrop-root/);
            const overlayIndex = html.indexOf('data-popup-control-overlay="true"');
            assert.ok(html.indexOf('Top Bar Action') < overlayIndex);
            if (screen !== 'calendar' && screen !== 'turn-calendar') {
                assert.ok(html.indexOf('Bottom Bar Action') > overlayIndex);
            }
            assert.match(html, /position:absolute;inset:0;z-index:20;pointer-events:auto/);
            assert.match(html, /isolation:isolate/);
        });
    }

    for (const screen of ['calendar', 'locations', 'map', 'skit'] as const) {
        test(`${screen} ${isVerticalLayout ? 'hides' : 'retains'} the content shortcut in ${isVerticalLayout ? 'vertical' : 'horizontal'} layout`, () => {
            const stage = createStage(screen === 'map');
            const props = { stage: () => stage, setScreenType: () => {}, isVerticalLayout };
            const content = screen === 'calendar' ? <CalendarScreen {...props} />
                : screen === 'skit' ? <SkitScreen {...props} />
                    : <MapScreen {...props} />;
            const html = renderToStaticMarkup(<TooltipProvider>{content}</TooltipProvider>);
            assert.equal(html.includes('data-testid="EditNoteIcon"'), !isVerticalLayout);
            assert.match(html, /data-testid="Menu(?:Rounded)?Icon"/);
            if (screen === 'skit') {
                assert.match(html, /aria-label="Close Scene"/);
                const menuIndex = html.indexOf('aria-label="Main Menu"');
                const closeIndex = html.indexOf('aria-label="Close Scene"');
                assert.ok(menuIndex >= 0 && closeIndex > menuIndex);
                assert.match(html, new RegExp(`flex-direction:${isVerticalLayout ? 'column-reverse' : 'row'};[^}]*align-items:center;[^}]*gap:6px`));
            }
        });
    }
}
