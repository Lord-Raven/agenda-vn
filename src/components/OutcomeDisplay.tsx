import { FC } from 'react';
import { Box, Typography } from '@mui/material';
import { Actor } from '../content/Actor';
import { Outcome, OutcomeType } from '../content/Outcome';
import { Stage } from '../Stage';
import { ActorPortrait } from './ActorPortrait';

interface OutcomeDisplayProps {
    outcomes: Outcome[];
    stage: () => Stage;
}

export const OutcomeDisplay: FC<OutcomeDisplayProps> = ({ outcomes, stage }) => {
    if (!outcomes || outcomes.length === 0) {
        return null;
    }

    const resolveActor = (actorId?: string): Actor | undefined => {
        if (!actorId) return undefined;
        return stage().getSave().actors?.[actorId] || undefined;
    };

    return (
        <Box
            sx={{
                position: 'absolute',
                right: '2.5%',
                top: '5%',
                bottom: '22%',
                width: 'clamp(280px, 28vw, 420px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.25,
                zIndex: 4,
                pointerEvents: 'none',
            }}
        >
            {outcomes.map((outcome, index) => {
                const actorId = typeof outcome.details?.actorId === 'string' ? outcome.details.actorId : '';
                const actor = resolveActor(actorId);
                const isActorOutcome = !!actor && outcome.type !== OutcomeType.PLAYER_STAT && outcome.type !== OutcomeType.LORE_UPDATE && outcome.type !== OutcomeType.NEW_EVENT;

                let topLine = outcome.description || '';
                let bottomLine = '';

                if (outcome.type === OutcomeType.ACTOR_STAT) {
                    const statName = `${outcome.details?.statName || ''}`.trim() || 'Stat';
                    const delta = Number(outcome.details?.changeValue ?? 0);
                    const stat = stage().getConfiguration().actorStats.find(candidate => candidate.name === statName);
                    const currentValue = Number(actor?.statMap?.[stat?.id || ''] ?? 0);
                    const nextValue = Number.isFinite(currentValue) ? currentValue : 0;
                    const arrow = '→';
                    topLine = `${actor?.name || 'Actor'} · ${statName}`;
                    bottomLine = `${currentValue} ${arrow} ${nextValue + delta}`;
                } else if (outcome.type === OutcomeType.PLAYER_STAT) {
                    const statName = `${outcome.details?.statName || ''}`.trim() || 'Player Stat';
                    const changeValue = Number(outcome.details?.changeValue ?? 0);
                    topLine = `Player · ${statName}`;
                    bottomLine = `${changeValue > 0 ? '+' : ''}${changeValue} → ${Math.abs(changeValue)}`;
                } else if (outcome.type === OutcomeType.LORE_UPDATE) {
                    topLine = 'Lore Update';
                    bottomLine = `${outcome.details?.loreTitle || 'Entry'}`;
                } else if (outcome.type === OutcomeType.NEW_EVENT) {
                    topLine = 'New Event';
                    bottomLine = `${outcome.details?.event?.name || 'Calendar Event'}`;
                } else {
                    const detailText = typeof outcome.description === 'string' ? outcome.description : '';
                    topLine = detailText.length > 35 ? detailText.slice(0, 35) + '…' : detailText;
                }

                return (
                    <Box
                        key={`${outcome.type}-${index}`}
                        sx={{
                            display: 'flex',
                            alignItems: 'stretch',
                            gap: 1,
                            width: '100%',
                            minHeight: 70,
                            padding: '0.5rem 0.75rem',
                            borderRadius: 2,
                            border: '1px solid color-mix(in srgb, var(--agenda-accent-primary) 35%, transparent)',
                            background: 'color-mix(in srgb, var(--agenda-panel-surface) 90%, transparent)',
                            backdropFilter: 'blur(10px)',
                            boxShadow: 'var(--agenda-shadow)',
                            pointerEvents: 'auto',
                        }}
                    >
                        {isActorOutcome && actor && (
                            <Box sx={{ width: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ActorPortrait
                                    actor={actor}
                                    stage={stage()}
                                    size={52}
                                    borderRadius={12}
                                    objectPosition="center 18%"
                                    style={{
                                        width: 52,
                                        height: 64,
                                        borderRadius: 12,
                                    }}
                                    ariaLabel={actor.name}
                                />
                            </Box>
                        )}
                        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, flex: 1 }}>
                            <Typography variant="caption" sx={{ color: 'var(--agenda-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                                {topLine}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'var(--agenda-text-primary)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {bottomLine || topLine}
                            </Typography>
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};
