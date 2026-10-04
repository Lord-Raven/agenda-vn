import { FC, useState } from 'react';
import { Stage } from '../Stage';
import { isFunctionStatType, normalizeStatValue } from '../content/Stat';
import { GlassPanel, Title } from '../components/UiComponents';
import { StatValueInput } from '../components/StatValueInput';

interface GlobalStatManagementPanelProps {
    stage: () => Stage;
}

export const GlobalStatManagementPanel: FC<GlobalStatManagementPanelProps> = ({ stage }) => {
    const [, setRevision] = useState(0);
    const stageInstance = stage();
    const configuration = stageInstance.getConfiguration();
    const save = stageInstance.getSave();
    const globalStats = configuration.globalStats || [];
    const actors = Object.values(save.actors || {}).filter(actor => actor.active !== false);
    const items = (save.inventory || []).filter(item => item.active !== false);
    const locations = Object.values(save.atlas || {}).filter(location => location.active !== false);
    const optionContext = {
        sourceStats: globalStats,
        globalStatValues: { ...configuration.globalStatValues, ...save.globalStatValues },
    };

    return (
        <GlassPanel variant="default" style={{ padding: '18px' }}>
            <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Global Stats</Title>
            <p style={{ color: 'var(--agenda-text-muted)', fontSize: '13px', margin: '0 0 12px 0' }}>
                View and edit global stat values for the current save. Changes are saved automatically and do not change configuration defaults.
            </p>
            {globalStats.length === 0 && (
                <span style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>No global stats defined.</span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {globalStats.map(stat => (
                    <div
                        key={stat.id}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            border: '1px solid var(--agenda-line-subtle)',
                            borderRadius: '6px',
                            padding: '10px',
                        }}
                    >
                        <div style={{ color: 'var(--agenda-text-primary)', fontSize: '14px', fontWeight: 700 }}>
                            {stat.name}
                        </div>
                        {!!stat.description?.trim() && (
                            <div style={{ color: 'var(--agenda-text-muted)', fontSize: '12px' }}>
                                {stat.description}
                            </div>
                        )}
                        {isFunctionStatType(stat.type) ? (
                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: '12px' }}>
                                Function stats have no stored value to edit.
                            </span>
                        ) : (
                            <StatValueInput
                                stat={stat}
                                value={normalizeStatValue(
                                    save.globalStatValues?.[stat.id] ?? configuration.globalStatValues?.[stat.id] ?? stat.default,
                                    stat,
                                )}
                                onChange={value => {
                                    stageInstance.setGlobalStatValue(stat.id, value);
                                    setRevision(current => current + 1);
                                }}
                                actors={actors}
                                items={items}
                                locations={locations}
                                stage={stage}
                                optionContext={optionContext}
                            />
                        )}
                    </div>
                ))}
            </div>
        </GlassPanel>
    );
};
