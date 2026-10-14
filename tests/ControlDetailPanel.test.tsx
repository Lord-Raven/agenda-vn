import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stage, GameConfiguration } from '../src/Stage';
import { Control, ControlType } from '../src/content/Control';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';

const renderPanel = (type: ControlType, iconName: string) => {
    const control = new Control({ type, iconName });
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], globalStatValues: {}, statUpdateRules: [], controls: [control],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-14',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    return renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
};

for (const type of ['button', 'statDisplay', 'statEditor', 'actorStatDisplay', 'statOutcome'] satisfies ControlType[]) {
    test(`${type} label icons use the picker with the configured selection`, () => {
        const html = renderPanel(type, 'favorite');
        assert.match(html, /Label Icon \(optional\)/);
        assert.match(html, /aria-label="Selected icon: favorite"/);
        assert.match(html, /data-testid="FavoriteIcon"/);
        assert.doesNotMatch(html, /MUI icon name/);
        assert.doesNotMatch(html, /<input[^>]*value="favorite"/);
    });

    test(`${type} label icons allow no icon without defaulting to star`, () => {
        const html = renderPanel(type, '');
        assert.match(html, /aria-label="Pick an icon"/);
        assert.match(html, /data-testid="DoNotDisturbIcon"/);
        assert.doesNotMatch(html, /aria-label="Selected icon: star"/);
    });
}
