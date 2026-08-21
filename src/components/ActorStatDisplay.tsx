import { FC } from 'react';
import { Box, Typography } from '@mui/material';
import { ActorStat } from '../content/ActorStat';
import { ActorStatRating } from './ActorStatRating';

// Coarse letter-grade scale shared with ActorDetailPanel's per-stat editor.
const LETTER_GRADES = ['F', 'D', 'C', 'B', 'A', 'S'];

export const resolveActorStatNumericRange = (stat: ActorStat): { min: number; max: number } => {
    if (typeof stat.min === 'number' && typeof stat.max === 'number' && stat.max > stat.min) {
        return { min: stat.min, max: stat.max };
    }
    if (stat.displayType === 'percentage' || stat.displayType === 'letter grade' || stat.displayType === 'bar') {
        return { min: 0, max: 100 };
    }
    return { min: 0, max: Number.isFinite(stat.max) ? Number(stat.max) : 100 };
};

export const resolveActorStatPercent = (stat: ActorStat, value: number): number => {
    const { min, max } = resolveActorStatNumericRange(stat);
    if (!Number.isFinite(value) || max === min) {
        return 0;
    }
    return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
};

export const resolveActorStatLetterGrade = (stat: ActorStat, value: number): string => {
    const ratio = resolveActorStatPercent(stat, value) / 100;
    return LETTER_GRADES[Math.round(ratio * (LETTER_GRADES.length - 1))];
};

// Plain-text rendering of a numeric stat's value according to its displayType; used anywhere a compact
// string is needed instead of a full visual component (e.g. outcome summaries).
export const resolveActorStatValueText = (stat: ActorStat, value: number): string => {
    if (!Number.isFinite(value)) {
        return '0';
    }
    if (stat.displayType === 'percentage') {
        return `${Math.round(resolveActorStatPercent(stat, value))}%`;
    }
    if (stat.displayType === 'letter grade') {
        return resolveActorStatLetterGrade(stat, value);
    }
    return `${value}`;
};

interface ActorStatValueDisplayProps {
    stat: ActorStat;
    value: number;
    style?: React.CSSProperties;
    showText?: boolean;
}

// Renders a numeric ActorStat's value using its selected displayType: pips for 'rating', a progress bar for
// 'bar'/'percentage', or plain text for 'straight'/'letter grade'.
export const ActorStatValueDisplay: FC<ActorStatValueDisplayProps> = ({ stat, value, style, showText = true }) => {
    if (stat.displayType === 'rating') {
        return <ActorStatRating stat={stat} value={value} style={style} />;
    }

    if (stat.displayType === 'bar' || stat.displayType === 'percentage') {
        const percent = resolveActorStatPercent(stat, value);
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', ...style }}>
                <Box
                    sx={{
                        flex: 1,
                        height: 8,
                        borderRadius: '999px',
                        background: 'color-mix(in srgb, var(--agenda-text-primary) 12%, transparent)',
                        overflow: 'hidden',
                    }}
                >
                    <Box
                        sx={{
                            width: `${percent}%`,
                            height: '100%',
                            borderRadius: 'inherit',
                            background: 'linear-gradient(90deg, var(--agenda-highlight), var(--agenda-accent-primary))',
                        }}
                    />
                </Box>
                {showText && (
                    <Typography
                        sx={{
                            color: 'var(--agenda-text-primary)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            minWidth: '2.5em',
                            textAlign: 'right',
                        }}
                    >
                        {resolveActorStatValueText(stat, value)}
                    </Typography>
                )}
            </Box>
        );
    }

    return (
        <Typography
            sx={{
                color: 'var(--agenda-text-primary)',
                fontSize: '0.8rem',
                fontWeight: 700,
                lineHeight: 1.2,
                wordBreak: 'break-word',
                ...style,
            }}
        >
            {resolveActorStatValueText(stat, value)}
        </Typography>
    );
};
