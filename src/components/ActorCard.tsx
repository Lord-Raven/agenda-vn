import { FC, useMemo } from 'react';
import { Box } from '@mui/material';
import { Stage } from '../Stage';
import { Stat, StatValue } from '../content/Stat';
import { Actor } from '../content/Actor';
import { NamePlate } from './UiComponents';
import { resolveIcon } from './StatRating';
import { StatValueDisplay } from './StatDisplay';

interface ActorCardProps {
    actor?: Actor;
    stage: () => Stage;
    style?: React.CSSProperties;
    className?: string;
}

const resolveStatValue = (actor: Actor, stat: Stat): StatValue => {
    const raw = (actor.statMap as { [key: string]: StatValue } | undefined)?.[stat.id];
    return raw === undefined || raw === null || raw === '' ? stat.default : raw;
};

const StatValueContainer: FC<{ stat: Stat; value: StatValue; atlas?: { [key: string]: { name: string } } }> = ({ stat, value, atlas }) => {
    if (stat.type === 'location') {
        return (
            <Box sx={{ color: 'var(--agenda-highlight)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {atlas?.[String(value)]?.name || ''}
            </Box>
        );
    }
    if (stat.type === 'checkbox') {
        return (
            <Box sx={{ color: 'var(--agenda-highlight)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {value === true ? 'True' : 'False'}
            </Box>
        );
    }
    const numericValue = Number(value);

    if (stat.type === 'number' && Number.isFinite(numericValue)) {
        const isBarType = stat.displayType === 'percentage' || stat.displayType === 'bar';
        return (
            <Box sx={{ width: isBarType ? '90px' : undefined, height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <StatValueDisplay stat={stat} value={numericValue} />
            </Box>
        );
    }

    return (
        <Box sx={{ color: 'var(--agenda-highlight)', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {String(value ?? '')}
        </Box>
    );
};

export const ActorCard: FC<ActorCardProps> = ({ actor, stage, style, className = '' }) => {
    const exposedStats = useMemo(() => {
        const configured = stage().getConfiguration().actorStats || [];
        return configured.filter(stat => stat?.exposed && stat?.name?.trim());
    }, [stage, actor?.id]);

    const actorAge = useMemo(() => {
        const birthDate = (actor?.birthDate || '').trim();
        if (!birthDate) {
            return '';
        }

        const birth = new Date(`${birthDate}T00:00:00Z`);
        const currentDate = (stage().getSave()?.currentDate || stage().getConfiguration()?.startingDate || new Date().toISOString().slice(0, 10)).trim();
        const current = new Date(`${currentDate}T00:00:00Z`);

        if (Number.isNaN(birth.getTime()) || Number.isNaN(current.getTime())) {
            return '';
        }

        let age = current.getUTCFullYear() - birth.getUTCFullYear();
        const monthDelta = current.getUTCMonth() - birth.getUTCMonth();
        const dayDelta = current.getUTCDate() - birth.getUTCDate();

        if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
            age -= 1;
        }

        return age >= 0 ? `${age}` : '';
    }, [actor?.birthDate, stage, actor?.id]);

    if (!actor) {
        return null;
    }

    const themeColor = actor.themeColor || 'var(--agenda-accent-primary)';
    const cardMeta = [actor.role, actorAge ? `Age ${actorAge}` : ''].filter(Boolean).join(' • ');

    return (
        <Box
            className={className}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 1.25,
                padding: 2,
                maxWidth: 320,
                borderRadius: 2,
                border: `1px solid ${themeColor}`,
                backgroundColor: 'var(--agenda-panel-surface)',
                boxShadow: 'var(--agenda-shadow)',
                color: 'var(--agenda-text-primary)',
                fontFamily: 'var(--agenda-font-primary)',
                ...style,
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <NamePlate actor={actor} />
            </Box>

            {cardMeta && (
                <Box sx={{ fontSize: '0.8rem', lineHeight: 1.4, color: 'var(--agenda-text-muted)', textAlign: 'center' }}>
                    {cardMeta}
                </Box>
            )}

            {actor.background && (
                <Box sx={{ fontSize: '0.9rem', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                    {actor.background}
                </Box>
            )}

            {exposedStats.length > 0 && (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.75,
                        paddingTop: 1,
                        borderTop: `1px solid color-mix(in srgb, ${themeColor} 40%, transparent)`,
                    }}
                >
                    {exposedStats.map(stat => {
                        const LabelIcon = stat.labelIconName ? resolveIcon(stat.labelIconName) : null;

                        return (
                            <Box
                                key={stat.name}
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto',
                                    alignItems: 'center',
                                    gap: 1,
                                    fontSize: '0.85rem',
                                }}
                                title={stat.description || undefined}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, color: 'var(--agenda-text-muted)', minWidth: 0 }}>
                                    {LabelIcon && <LabelIcon sx={{ fontSize: '0.9rem', color: 'var(--agenda-highlight)' }} />}
                                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.name}</Box>
                                </Box>
                                <StatValueContainer stat={stat} value={resolveStatValue(actor, stat)} atlas={stage().getSave()?.atlas} />
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
};
