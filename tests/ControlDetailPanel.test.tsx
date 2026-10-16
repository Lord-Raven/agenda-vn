import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stage, GameConfiguration } from '../src/Stage';
import { Control, ControlType } from '../src/content/Control';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';
import { ControlRenderer } from '../src/components/ControlRenderer';
import { cloneStat } from '../src/content/Stat';

const createStage = (control: Control) => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], functions: [], globalStatValues: {}, statUpdateRules: [], controls: [control],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-14',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => ({
        playerId: '', actors: {}, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    });
    return stage;
};

const renderPanel = (type: ControlType, iconName: string, widthWeight = 1) => {
    const control = new Control({ type, iconName, widthWeight });
    const stage = createStage(control);
    return renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
};

for (const placement of ['top', 'bottom'] as const) {
    for (const type of ['button', 'statDisplay', 'statEditor'] as const) {
        test(`${placement} ${type} uses proportional flex sizing for default, larger and smaller weights`, () => {
            for (const widthWeight of [undefined, 0.5, 1, 2]) {
                const control = new Control({ type, placement, widthWeight, statId: 'score', label: 'Score' });
                const stage = createStage(control);
                stage.getConfiguration().globalStats = [cloneStat({
                    id: 'score', name: 'Score', type: 'number', description: '', guidance: '', default: 10,
                    llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
                    setByPlayer: false,
                })];
                const html = renderToStaticMarkup(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />);
                const weight = widthWeight ?? 1;
                assert.ok(html.includes(`flex:${weight} 1 calc(150px * ${weight})`), `Expected flex sizing for weight ${weight}`);
                assert.match(html, /box-sizing:border-box/);
                assert.match(html, /min-width:0/);
                assert.match(html, /Score/);
            }
        });
    }
}

for (const type of ['button', 'statDisplay', 'statEditor', 'actorStatDisplay', 'statOutcome'] satisfies ControlType[]) {
    test(`${type} exposes width weight only for top/bottom controls`, () => {
        const html = renderPanel(type, '', 2.5);
        if (type === 'actorStatDisplay' || type === 'statOutcome') {
            assert.doesNotMatch(html, /Width Weight/);
        } else {
            assert.match(html, /Width Weight/);
            assert.match(html, /<input(?=[^>]*type="number")(?=[^>]*step="any")(?=[^>]*value="2.5")[^>]*>/);
            assert.match(html, /twice the space/);
        }
    });

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
