import { FC, ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { Actor } from '../content/Actor';
import { Outcome, OutcomeType } from '../content/Outcome';
import { findStatOptionByValue, Stat, StatValue } from '../content/Stat';
import { Stage } from '../Stage';
import { ActorPortrait } from './ActorPortrait';
import { resolveStatValueText } from './StatDisplay';
import { resolveIcon, StatRating } from './StatRating';

interface OutcomeDisplayProps {
    outcomes: Outcome[];
    stage: () => Stage;
}

// Unlike resolveStatValueText (numeric stats only), this also handles option/text/checkbox StatValues.
const formatStatValue = (stat: Stat, value: StatValue): string => {
    if (stat.type === 'number') {
        return resolveStatValueText(stat, Number(value));
    }
    if (stat.type === 'option') {
        return findStatOptionByValue(stat, value)?.option.name || `${value ?? ''}`;
    }
    if (stat.type === 'checkbox') {
        return value ? 'Yes' : 'No';
    }
    return `${value ?? ''}`;
};

const renderStatOutcomeValue = (stat: Stat | undefined, currentValue: StatValue | undefined, nextValue: StatValue, fallbackCurrentValue: StatValue | undefined): ReactNode => {
    if (stat?.type === 'number' && stat.displayType === 'rating') {
        const numericNextValue = Number(nextValue);
        const numericCurrentValue = Number(currentValue ?? stat.default ?? 0);
        if (Number.isFinite(numericNextValue)) {
            const highlightDelta = Number.isFinite(numericCurrentValue) ? numericNextValue - numericCurrentValue : undefined;
            return (
                <StatRating
                    stat={stat}
                    value={numericNextValue}
                    highlightDelta={highlightDelta}
                    style={{ height: 24, width: 'min(100%, 170px)', justifyContent: 'flex-start' }}
                />
            );
        }
    }

    return stat
        ? `${formatStatValue(stat, currentValue ?? stat.default)} → ${formatStatValue(stat, nextValue)}`
        : `${fallbackCurrentValue ?? ''} → ${nextValue}`;
};

const getNumericStatChangeSign = (stat: Stat | undefined, outcome: Outcome, actor?: Actor): string => {
    if (!stat || stat.type !== 'number') {
        return '';
    }

    if (outcome.details?.absoluteValue !== undefined) {
        const currentValue = Number(actor?.statMap?.[stat.id] ?? stat.default ?? 0);
        const nextValue = Number(outcome.details.absoluteValue);
        if (Number.isFinite(currentValue) && Number.isFinite(nextValue)) {
            return nextValue > currentValue ? '+' : nextValue < currentValue ? '-' : '';
        }
        return '';
    }

    const delta = Number(outcome.details?.changeValue ?? 0);
    if (Number.isFinite(delta)) {
        return delta > 0 ? '+' : delta < 0 ? '-' : '';
    }

    return '';
};

const formatStatNameWithSign = (stat: Stat | undefined, outcome: Outcome, actor?: Actor): string => {
    const statName = `${outcome.details?.statName || ''}`.trim() || 'Stat';
    const sign = getNumericStatChangeSign(stat, outcome, actor);
    return sign ? `${statName} ${sign}` : statName;
};

const renderStatNameLabel = (stat: Stat | undefined, label: string): ReactNode => {
    const LabelIcon = stat?.labelIconName ? resolveIcon(stat.labelIconName) : null;
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%' }}>
            {LabelIcon && <LabelIcon sx={{ fontSize: '0.9rem', color: 'var(--agenda-highlight)' }} />}
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Box>
        </Box>
    );
};

interface OutcomeGroup {
    outcomes: Outcome[];
    actor?: Actor;
}

export const OutcomeDisplay: FC<OutcomeDisplayProps> = ({ outcomes, stage }) => {
    if (!outcomes || outcomes.length === 0) {
        return null;
    }

    const resolveActor = (actorId?: string): Actor | undefined => {
        if (!actorId) return undefined;
        return stage().getSave().actors?.[actorId] || undefined;
    };

    const outcomeGroups = outcomes.reduce<OutcomeGroup[]>((groups, outcome) => {
        const actorId = typeof outcome.details?.actorId === 'string' ? outcome.details.actorId : '';
        const actor = outcome.type === OutcomeType.ACTOR_STAT ? resolveActor(actorId) : undefined;
        if (!actor) {
            groups.push({ outcomes: [outcome] });
            return groups;
        }

        const existingGroup = groups.find(group => group.actor?.id === actor.id);
        if (existingGroup) {
            existingGroup.outcomes.push(outcome);
        } else {
            groups.push({ outcomes: [outcome], actor });
        }
        return groups;
    }, []);

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
            {outcomeGroups.map((group, index) => {
                const outcome = group.outcomes[0];
                const actorId = typeof outcome.details?.actorId === 'string' ? outcome.details.actorId : '';
                const actor = group.actor || resolveActor(actorId);
                const isActorOutcome = !!actor && outcome.type !== OutcomeType.PLAYER_STAT && outcome.type !== OutcomeType.LORE_UPDATE && outcome.type !== OutcomeType.NEW_EVENT;
                const isGroupedActorStats = !!group.actor && group.outcomes.every(groupedOutcome => groupedOutcome.type === OutcomeType.ACTOR_STAT);

                let topLine: ReactNode = outcome.description || '';
                let bottomLine: ReactNode = '';

                const renderActorStat = (actorStatOutcome: Outcome): ReactNode => {
                    const statName = `${actorStatOutcome.details?.statName || ''}`.trim() || 'Stat';
                    const stat = stage().getConfiguration().actorStats.find(candidate => candidate.name === statName);
                    const currentValue = actor?.statMap?.[stat?.id || ''];
                    if (actorStatOutcome.details?.absoluteValue !== undefined) {
                        const nextValue = actorStatOutcome.details.absoluteValue;
                        return renderStatOutcomeValue(stat, currentValue, nextValue, currentValue);
                    }

                    const delta = Number(actorStatOutcome.details?.changeValue ?? 0);
                    const numericCurrentValue = Number(currentValue ?? 0);
                    const previousValue = Number.isFinite(numericCurrentValue) ? numericCurrentValue : 0;
                    const nextValue = previousValue + delta;
                    const arrow = '→';
                    return stat?.type === 'number' && stat.displayType === 'rating'
                        ? renderStatOutcomeValue(stat, previousValue, nextValue, previousValue)
                        : (stat
                            ? `${resolveStatValueText(stat, previousValue)} ${arrow} ${resolveStatValueText(stat, nextValue)}`
                            : `${previousValue} ${arrow} ${nextValue}`);
                };

                if (isGroupedActorStats) {
                    topLine = actor?.displayName || actor?.name || 'Actor';
                } else if (outcome.type === OutcomeType.ACTOR_STAT) {
                    const statName = `${outcome.details?.statName || ''}`.trim() || 'Stat';
                    const stat = stage().getConfiguration().actorStats.find(candidate => candidate.name === statName);
                    const statLabel = renderStatNameLabel(stat, formatStatNameWithSign(stat, outcome, actor));
                    topLine = (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, maxWidth: '100%' }}>
                            <Box component="span" sx={{ color: 'var(--agenda-text-muted)' }}>{actor?.displayName || actor?.name || 'Actor'}</Box>
                            <Box component="span" sx={{ color: 'var(--agenda-text-muted)' }}>·</Box>
                            <Box component="span" sx={{ minWidth: 0, maxWidth: '100%' }}>{statLabel}</Box>
                        </Box>
                    );
                    bottomLine = renderActorStat(outcome);
                } else if (outcome.type === OutcomeType.PLAYER_STAT) {
                    const statName = `${outcome.details?.statName || ''}`.trim() || 'Player Stat';
                    const stat = stage().getConfiguration().globalStats.find(candidate => candidate.name === statName);
                    const currentValue = stage().getSave().globalStatValues?.[stat?.id || ''];
                    topLine = `World · ${statName}`;
                    if (outcome.details?.absoluteValue !== undefined) {
                        const nextValue = outcome.details.absoluteValue;
                        bottomLine = renderStatOutcomeValue(stat, currentValue, nextValue, currentValue);
                    } else {
                        const delta = Number(outcome.details?.changeValue ?? 0);
                        const numericCurrentValue = Number(currentValue ?? 0);
                        const previousValue = Number.isFinite(numericCurrentValue) ? numericCurrentValue : 0;
                        const nextValue = previousValue + delta;
                        const arrow = '→';
                        bottomLine = stat?.type === 'number' && stat.displayType === 'rating'
                            ? renderStatOutcomeValue(stat, previousValue, nextValue, previousValue)
                            : (stat
                                ? `${resolveStatValueText(stat, previousValue)} ${arrow} ${resolveStatValueText(stat, nextValue)}`
                                : `${previousValue} ${arrow} ${nextValue}`);
                    }
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
                                    ariaLabel={actor.displayName || actor.name}
                                />
                            </Box>
                        )}
                        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, flex: 1 }}>
                            <Typography variant="caption" sx={{ color: 'var(--agenda-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                                {topLine}
                            </Typography>
                            {isGroupedActorStats ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, marginTop: 0.35 }}>
                                    {group.outcomes.map((actorStatOutcome, statIndex) => {
                                        const statName = `${actorStatOutcome.details?.statName || ''}`.trim() || 'Stat';
                                        const stat = stage().getConfiguration().actorStats.find(candidate => candidate.name === statName);
                                        return (
                                            <Box key={`${actorStatOutcome.details?.statName || 'stat'}-${statIndex}`} sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, paddingLeft: 1.25, borderLeft: '2px solid color-mix(in srgb, var(--agenda-accent-primary) 35%, transparent)' }}>
                                                <Typography variant="caption" sx={{ color: 'var(--agenda-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {renderStatNameLabel(stat, formatStatNameWithSign(stat, actorStatOutcome, actor))}
                                                </Typography>
                                                <Typography component="div" variant="body2" sx={{ color: 'var(--agenda-text-primary)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {renderActorStat(actorStatOutcome)}
                                                </Typography>
                                            </Box>
                                        );
                                    })}
                                </Box>
                            ) : (
                                <Typography component="div" variant="body2" sx={{ color: 'var(--agenda-text-primary)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {bottomLine || topLine}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};
