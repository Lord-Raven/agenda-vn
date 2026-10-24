import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { TooltipProvider } from '../src/components/TooltipContext';
import { Map as GameMap } from '../src/content/Map';
import { Skit } from '../src/content/Skit';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { CalendarScreen } from '../src/screens/CalendarScreen';
import { GameManagementPanel } from '../src/screens/GameManagementPanel';
import { MapScreen } from '../src/screens/MapScreen';
import { MenuScreen } from '../src/screens/MenuScreen';
import { SkitScreen } from '../src/screens/SkitScreen';

const createStage = (withMap = false) => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], functions: [], globalStatValues: {}, statUpdateRules: [], controls: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-23',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: '', actors: {}, atlas: {}, inventory: [], universalSchedule: {},
        maps: withMap ? [new GameMap({ name: 'Test map' })] : [],
        timeline: [], timestamp: 0, globalStatValues: {}, currentDate: '2026-10-23',
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.getCurrentSkit = () => new Skit({ id: 'test-skit' });
    stage.saveData = { configuration, saves: [save, undefined], lastSaveSlot: 0 };
    return stage;
};

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
