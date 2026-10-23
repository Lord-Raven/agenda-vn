import { FC, useCallback, useEffect, useState } from 'react';
import { Stage } from '../Stage';
import { cloneActorSchedule } from '../content/Actor';
import { cloneStatUpdateRules } from '../content/Stat';
import { GlassPanel, Title } from '../components/UiComponents';
import { ActorScheduleEditor } from '../components/ActorScheduleEditor';
import { StatUpdateRuleEditor } from '../components/StatUpdateRuleEditor';
import { useDebouncedSave } from '../components/useDebouncedSave';

export const RulesManagementPanel: FC<{ stage: () => Stage }> = ({ stage }) => {
    const stageInstance = stage();
    const [configuration, setConfiguration] = useState(() => stageInstance.getConfiguration());
    const save = stageInstance.getSave();
    const [universalSchedule, setUniversalSchedule] = useState(() => cloneActorSchedule(configuration.universalSchedule));
    const [statUpdateRules, setStatUpdateRules] = useState(() => cloneStatUpdateRules(configuration.statUpdateRules));

    useEffect(() => {
        // The previous tab can flush pending stat edits during its unmount.
        setConfiguration(stageInstance.getConfiguration());
    }, [stageInstance]);

    const saveRules = useCallback(() => {
        stageInstance.updateConfiguration({ universalSchedule, statUpdateRules });
    }, [stageInstance, universalSchedule, statUpdateRules]);
    useDebouncedSave(saveRules);

    const conditionActors = Object.values(save.actors || {}).filter(actor => actor.id !== save.playerId);
    const locationOptions = Object.values(save.atlas || {}).filter(location => location.active !== false);
    const itemOptions = (save.inventory || []).filter(item => item.active !== false);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Universal Schedule</Title>
                <span style={{ display: 'block', color: 'var(--agenda-text-muted)', fontSize: '11px', marginBottom: 10 }}>
                    Applies to every actor and is evaluated after that actor's own schedule. The first destination to match wins, but any matching "Unavailable" entry supersedes a matched location.
                </span>
                <ActorScheduleEditor
                    schedule={universalSchedule}
                    locations={locationOptions}
                    globalStats={configuration.globalStats}
                    actorStats={configuration.actorStats}
                    actors={conditionActors}
                    stage={stage}
                    emptyLabel="No universal schedule entries. Every actor falls back to their own schedule."
                    onChange={setUniversalSchedule}
                />
            </GlassPanel>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Stat Update Events</Title>
                <span style={{ display: 'block', color: 'var(--agenda-text-muted)', fontSize: '11px', marginBottom: 10 }}>
                    Choose a new game start-up or recurring time-period trigger, then add conditions and stat changes, function calls, or a skit. Start-up conditions use the initialized game state, including player choices. All matching start-up rules run in list order; only the first skit is started, after all stat changes and functions finish. Without a skit, new games open on the map. Define scripts in Functions. Numeric stats accept dice or relative notation (e.g. "1d6+1" or "-2").
                </span>
                <StatUpdateRuleEditor
                    rules={statUpdateRules}
                    globalStats={configuration.globalStats}
                    actorStats={configuration.actorStats}
                    locationStats={configuration.locationStats}
                    itemStats={configuration.itemStats}
                    actors={conditionActors}
                    items={itemOptions}
                    locations={locationOptions}
                    stage={stage}
                    onChange={setStatUpdateRules}
                />
            </GlassPanel>
        </div>
    );
};
