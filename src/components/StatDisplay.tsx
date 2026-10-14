import { FC } from 'react';
import { Box, Typography } from '@mui/material';
import { Stat } from '../content/Stat';
import { StatDisplaySettings, StatDisplayType } from '../content/Control';
import { StatRating } from './StatRating';

// Coarse letter-grade scale shared with ActorDetailPanel's per-stat editor.
const LETTER_GRADES = ['F', 'D', 'C', 'B', 'A', 'S'];

export const resolveStatNumericRange = (stat: Stat): { min: number; max: number } => {
    if (typeof stat.min === 'number' && typeof stat.max === 'number' && stat.max > stat.min) {
        return { min: stat.min, max: stat.max };
    }
    return { min: 0, max: Number.isFinite(stat.max) ? Number(stat.max) : 100 };
};

export const resolveStatPercent = (stat: Stat, value: number): number => {
    const { min, max } = resolveStatNumericRange(stat);
    if (!Number.isFinite(value) || max === min) {
        return 0;
    }
    return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
};

export const resolveStatLetterGrade = (stat: Stat, value: number): string => {
    const ratio = resolveStatPercent(stat, value) / 100;
    return LETTER_GRADES[Math.round(ratio * (LETTER_GRADES.length - 1))];
};

// Plain-text rendering of a numeric stat's value according to its displayType; used anywhere a compact
// string is needed instead of a full visual component (e.g. outcome summaries).
export const resolveStatValueText = (stat: Stat, value: number, displayType: StatDisplayType = 'straight'): string => {
    if (!Number.isFinite(value)) {
        return '0';
    }
    if (displayType === 'percentage') {
        return `${Math.round(resolveStatPercent(stat, value))}%`;
    }
    if (displayType === 'letter grade') {
        return resolveStatLetterGrade(stat, value);
    }
    return `${value}`;
};

interface StatValueDisplayProps {
    stat: Stat;
    display: StatDisplaySettings;
    value: number;
    style?: React.CSSProperties;
    showText?: boolean;
}

// Renders a numeric Stat's value using its selected displayType: pips for 'rating', a progress bar for
// 'bar'/'percentage', or plain text for 'straight'/'letter grade'.
export const StatValueDisplay: FC<StatValueDisplayProps> = ({ stat, display, value, style, showText = true }) => {
    if (display.displayType === 'rating') {
        return <StatRating stat={stat} display={display} value={value} style={style} />;
    }

    if (display.displayType === 'bar' || display.displayType === 'percentage') {
        const percent = resolveStatPercent(stat, value);
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', ...style }}>
                <Box
                    sx={{
                        flex: 1,
                        height: style?.fontSize ? '0.5em' : 8,
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
                            background: display.displayColor || 'linear-gradient(90deg, var(--agenda-highlight), var(--agenda-accent-primary))',
                        }}
                    />
                </Box>
                {showText && (
                    <Typography
                        sx={{
                            color: display.displayColor || 'var(--agenda-text-primary)',
                            fontSize: style?.fontSize ?? '0.75rem',
                            fontWeight: 700,
                            minWidth: '2.5em',
                            textAlign: 'right',
                        }}
                    >
                        {resolveStatValueText(stat, value, display.displayType)}
                    </Typography>
                )}
            </Box>
        );
    }

    return (
        <Typography
            sx={{
                color: display.displayColor || 'var(--agenda-text-primary)',
                fontSize: '0.8rem',
                fontWeight: 700,
                lineHeight: 1.2,
                wordBreak: 'break-word',
                ...style,
            }}
        >
            {resolveStatValueText(stat, value, display.displayType)}
        </Typography>
    );
};
