import { FC, useMemo } from 'react';
import { Box } from '@mui/material';
import { ActorStat, Stage } from '../Stage';
import { Actor } from '../content/Actor';
import { NamePlate } from './UiComponents';
import { ActorStatStars } from './ActorStatStars';

interface ActorCardProps {
    actor?: Actor;
    stage: () => Stage;
    style?: React.CSSProperties;
    className?: string;
}

const LETTER_GRADES = ['F', 'D', 'C', 'B', 'A', 'S'];

const resolveStatValue = (actor: Actor, stat: ActorStat): number | string => {
    const raw = (actor.statMap as { [key: string]: number | string } | undefined)?.[stat.name];
    return raw === undefined || raw === null || raw === '' ? stat.default : raw;
};

const resolveNumericRange = (stat: ActorStat): { min: number; max: number } => {
    if (typeof stat.min === 'number' && typeof stat.max === 'number' && stat.max > stat.min) {
        return { min: stat.min, max: stat.max };
    }
    if (stat.displayType === 'percentage' || stat.displayType === 'letter grade') {
        return { min: 0, max: 100 };
    }
    return { min: 0, max: Number.isFinite(stat.max) ? Number(stat.max) : 100 };
};

const toLetterGrade = (value: number, stat: ActorStat): string => {
    const { min, max } = resolveNumericRange(stat);
    const ratio = Math.max(0, Math.min(1, (value - min) / Math.max(1, max - min)));
    return LETTER_GRADES[Math.round(ratio * (LETTER_GRADES.length - 1))];
};

const StatValue: FC<{ stat: ActorStat; value: number | string }> = ({ stat, value }) => {
    const numericValue = Number(value);
    const hasNumericValue = Number.isFinite(numericValue);

    if (stat.displayType === 'stars' && hasNumericValue) {
        return (
            <Box sx={{ height: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <ActorStatStars stat={stat} value={numericValue} />
            </Box>
        );
    }

    if (stat.displayType === 'percentage' && hasNumericValue) {
        const { min, max } = resolveNumericRange(stat);
        const ratio = Math.max(0, Math.min(1, (numericValue - min) / Math.max(1, max - min)));
        return (
            <Box
                sx={{
                    width: '90px',
                    height: '8px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    backgroundColor: 'color-mix(in srgb, var(--agenda-text-primary) 15%, transparent)',
                }}
            >
                <Box sx={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: 'var(--agenda-highlight)' }} />
            </Box>
        );
    }

    const text = stat.displayType === 'letter grade' && hasNumericValue
        ? toLetterGrade(numericValue, stat)
        : String(value ?? '');

    return (
        <Box sx={{ color: 'var(--agenda-highlight)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {text}
        </Box>
    );
};

export const ActorCard: FC<ActorCardProps> = ({ actor, stage, style, className = '' }) => {
    const exposedStats = useMemo(() => {
        const configured = stage().getConfiguration().actorStats || [];
        return configured.filter(stat => stat?.exposed && stat?.name?.trim());
    }, [stage, actor?.id]);

    if (!actor) {
        return null;
    }

    const themeColor = actor.themeColor || 'var(--agenda-accent-primary)';

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
                fontFamily: 'var(--agenda-font-base)',
                ...style,
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <NamePlate actor={actor} />
            </Box>

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
                    {exposedStats.map(stat => (
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
                            <Box sx={{ color: 'var(--agenda-text-muted)' }}>{stat.name}</Box>
                            <StatValue stat={stat} value={resolveStatValue(actor, stat)} />
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
};
