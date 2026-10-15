import { FC, ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { Actor } from '../content/Actor';
import { Outcome, OutcomeType } from '../content/Outcome';
import { formatStatOptionValueText, normalizeStatValue, Stat, StatValue } from '../content/Stat';
import { Control } from '../content/Control';
import { Stage } from '../Stage';
import { ActorPortrait } from './ActorPortrait';
import { resolveStatValueText, StatValueDisplay } from './StatDisplay';
import { resolveIcon, StatRating } from './StatRating';

interface OutcomeDisplayProps {
    outcomes: Outcome[];
    stage: () => Stage;
}

// Unlike resolveStatValueText (numeric stats only), this also handles option/text/checkbox StatValues.
const formatStatValue = (stat: Stat, value: StatValue, control: Control): string => {
    if (stat.type === 'number') {
        return resolveStatValueText(stat, Number(value), control.displayType);
    }
    if (stat.type === 'option' || stat.type === 'optionList') {
        return formatStatOptionValueText(stat, value) || `${value ?? ''}`;
    }
    if (stat.type === 'checkbox') {
        return value ? 'Yes' : 'No';
    }
    return `${value ?? ''}`;
};

const renderStatOutcomeValue = (stat: Stat, control: Control, currentValue: StatValue, nextValue: StatValue): ReactNode => {
    if (stat.type === 'number' && control.displayType === 'rating') {
        const numericNextValue = Number(nextValue);
        const numericCurrentValue = Number(currentValue ?? stat.default ?? 0);
        if (Number.isFinite(numericNextValue)) {
            const highlightDelta = Number.isFinite(numericCurrentValue) ? numericNextValue - numericCurrentValue : undefined;
            return (
                <StatRating
                    stat={stat}
                    display={control}
                    value={numericNextValue}
                    highlightDelta={highlightDelta}
                    style={{ height: 24, width: 'min(100%, 170px)', justifyContent: 'flex-start' }}
                />
            );
        }
    }

    if (stat.type === 'number' && (control.displayType === 'bar' || control.displayType === 'percentage')) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StatValueDisplay stat={stat} display={control} value={Number(currentValue)} />
                <Box component="span">→</Box>
                <StatValueDisplay stat={stat} display={control} value={Number(nextValue)} />
            </Box>
        );
    }
    return (
        <Box component="span" sx={{ color: control.displayColor || 'inherit' }}>
            {`${formatStatValue(stat, currentValue, control)} → ${formatStatValue(stat, nextValue, control)}`}
        </Box>
    );
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

const formatStatNameWithSign = (stat: Stat, control: Control, outcome: Outcome, actor?: Actor): string => {
    const statName = control.label.trim() || stat.name;
    const sign = getNumericStatChangeSign(stat, outcome, actor);
    return sign ? `${statName} ${sign}` : statName;
};

const renderStatNameLabel = (control: Control, label: string): ReactNode => {
    const LabelIcon = control.iconName ? resolveIcon(control.iconName) : null;
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

const defaultOutcomeControl = new Control({ id: 'default-stat-outcome', type: 'statOutcome' });

export const OutcomeDisplay: FC<OutcomeDisplayProps> = ({ outcomes, stage }) => {
    if (!outcomes || outcomes.length === 0) {
        return null;
    }

    const resolveActor = (actorId?: string): Actor | undefined => {
        if (!actorId) return undefined;
        return stage().getSave().actors?.[actorId] || undefined;
    };

    const statMatches = new Map<Outcome, { stat: Stat; control: Control }>();
    const visibleOutcomes = outcomes.filter((outcome) => {
        if (outcome.type !== OutcomeType.ACTOR_STAT && outcome.type !== OutcomeType.PLAYER_STAT) {
            return true;
        }
        const target = outcome.type === OutcomeType.ACTOR_STAT ? 'actor' : 'global';
        const stats = target === 'actor' ? stage().getConfiguration().actorStats : stage().getConfiguration().globalStats;
        const stat = stats.find((candidate) => candidate.name === `${outcome.details?.statName || ''}`.trim());
        if (!stat || stat.perActor) {
            return false;
        }
        const actor = target === 'actor' ? resolveActor(outcome.details?.actorId) : undefined;
        const matchesStat = (candidate: Control): boolean =>
            candidate.type === 'statOutcome' && candidate.outcomeStatTarget === target && candidate.statId === stat.id;
        const hasConfiguredControl = stage().getConfiguration().controls.some(matchesStat);
        const control = hasConfiguredControl
            ? stage().getVisibleControls('outcome', actor).find(matchesStat)
            : defaultOutcomeControl;
        if (!control) {
            return false;
        }
        statMatches.set(outcome, { stat, control });
        return true;
    });
    if (visibleOutcomes.length === 0) {
        return null;
    }

    const renderStatOutcome = (outcome: Outcome, actor?: Actor): ReactNode => {
        const match = statMatches.get(outcome);
        if (!match) {
            return null;
        }
        const { stat, control } = match;
        const rawValue = outcome.type === OutcomeType.ACTOR_STAT
            ? actor?.statMap?.[stat.id]
            : stage().getSave().globalStatValues?.[stat.id] ?? stage().getConfiguration().globalStatValues?.[stat.id];
        const currentValue = normalizeStatValue(rawValue ?? stat.default, stat);
        const nextValue = outcome.details?.absoluteValue !== undefined
            ? normalizeStatValue(outcome.details.absoluteValue, stat)
            : Number(currentValue) + Number(outcome.details?.changeValue ?? 0);
        return renderStatOutcomeValue(stat, control, currentValue, nextValue);
    };

    const outcomeGroups = visibleOutcomes.reduce<OutcomeGroup[]>((groups, outcome) => {
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

                if (isGroupedActorStats) {
                    topLine = actor?.displayName || actor?.name || 'Actor';
                } else if (outcome.type === OutcomeType.ACTOR_STAT) {
                    const { stat, control } = statMatches.get(outcome)!;
                    const statLabel = renderStatNameLabel(control, formatStatNameWithSign(stat, control, outcome, actor));
                    topLine = (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, maxWidth: '100%' }}>
                            <Box component="span" sx={{ color: 'var(--agenda-text-muted)' }}>{actor?.displayName || actor?.name || 'Actor'}</Box>
                            <Box component="span" sx={{ color: 'var(--agenda-text-muted)' }}>·</Box>
                            <Box component="span" sx={{ minWidth: 0, maxWidth: '100%' }}>{statLabel}</Box>
                        </Box>
                    );
                    bottomLine = renderStatOutcome(outcome, actor);
                } else if (outcome.type === OutcomeType.PLAYER_STAT) {
                    const { stat, control } = statMatches.get(outcome)!;
                    topLine = renderStatNameLabel(control, `World · ${control.label.trim() || stat.name}`);
                    bottomLine = renderStatOutcome(outcome);
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
                                        const { stat, control } = statMatches.get(actorStatOutcome)!;
                                        return (
                                            <Box key={`${actorStatOutcome.details?.statName || 'stat'}-${statIndex}`} sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, paddingLeft: 1.25, borderLeft: '2px solid color-mix(in srgb, var(--agenda-accent-primary) 35%, transparent)' }}>
                                                <Typography variant="caption" sx={{ color: 'var(--agenda-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {renderStatNameLabel(control, formatStatNameWithSign(stat, control, actorStatOutcome, actor))}
                                                </Typography>
                                                <Typography component="div" variant="body2" sx={{ color: 'var(--agenda-text-primary)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {renderStatOutcome(actorStatOutcome, actor)}
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
