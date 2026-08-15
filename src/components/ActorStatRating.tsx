import { FC } from 'react';
import * as Icons from "@mui/icons-material";
import type { SvgIconComponent } from '@mui/icons-material';
import { Star } from '@mui/icons-material';
import { ActorStat } from '../Stage';

const ICON_LOOKUP_EXCLUSIONS = new Set([
    'default',
    'SvgIcon',
    'createSvgIcon',
    'unstable_createSvgIcon',
    'Icon',
    'IconButton',
    'ThemeProvider',
    'StylesProvider',
]);

const normalizeIconKey = (iconName: string) =>
    iconName
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();

const MUI_ICON_OPTIONS = Object.entries(Icons)
    .filter(([name, value]) => {
        if (typeof value !== 'function') {
            return false;
        }

        return !ICON_LOOKUP_EXCLUSIONS.has(name);
    })
    .map(([name, icon]) => ({
        key: name,
        label: name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '),
        icon: icon as SvgIconComponent,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

const RATING_ICON_OPTIONS = MUI_ICON_OPTIONS;

const RESOLVED_ICON_LOOKUP = new Map<string, SvgIconComponent>(
    RATING_ICON_OPTIONS.map(({ key, icon }) => [normalizeIconKey(key), icon]),
);

const resolveIcon = (iconName?: string) => {
    const rawKey = typeof iconName === 'string' ? iconName.trim() : '';
    if (!rawKey) {
        return Star;
    }

    return RESOLVED_ICON_LOOKUP.get(normalizeIconKey(rawKey)) || Star;
};

type RatingIconKey = (typeof RATING_ICON_OPTIONS)[number]['key'];

interface ActorStatRatingProps {
    stat: ActorStat;
    value: number;
    updateScore?: (value: number) => void;
    readOnly?: boolean;
    style?: React.CSSProperties;
}

const resolvePipCount = (stat: ActorStat): number => {
    if (Number.isFinite(stat.max)) {
        return Math.max(1, Math.round(Number(stat.max)));
    }

    return 5;
};

const getFilledPipCount = (value: number, maxPips: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(maxPips, Math.round(value)));
};

const ratingShellStyle = (interactive: boolean): React.CSSProperties => ({
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    margin: 0,
    border: 0,
    background: 'transparent',
    color: 'var(--agenda-text-muted)',
    cursor: interactive ? 'pointer' : 'default',
    lineHeight: 0,
    overflow: 'visible',
});

const iconStyleBase: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    color: 'inherit',
};

const renderStatIcon = (
    stat: ActorStat,
    pipValue: number,
    filled: boolean,
    updateScore?: (value: number) => void,
) => {
    const IconComponent = resolveIcon(stat.iconName);
    const label = `${stat.name} ${pipValue} of ${resolvePipCount(stat)}`;
    const fillColor = filled ? 'var(--agenda-highlight)' : 'rgba(11, 17, 28, 0.9)';
    const shadow = filled
        ? 'drop-shadow(0 0 2px color-mix(in srgb, var(--agenda-highlight) 35%, transparent))'
        : 'drop-shadow(0 0 7px rgba(0, 0, 0, 0.85))';

    return (
        <button
            key={`${stat.name}-pip-${pipValue}`}
            type="button"
            disabled={!updateScore}
            onClick={updateScore ? () => updateScore?.(pipValue) : undefined}
            aria-label={label}
            title={label}
            style={ratingShellStyle(!!updateScore)}
        >
            <IconComponent
                style={{
                    ...iconStyleBase,
                    opacity: filled ? 1 : 0.35,
                    color: fillColor,
                    filter: shadow,
                    transform: filled ? 'none' : 'translateY(1px)',
                }}
            />
        </button>
    );
};

export { RATING_ICON_OPTIONS, resolveIcon, type RatingIconKey };

export const ActorStatRating: FC<ActorStatRatingProps> = ({
    stat,
    value,
    updateScore,
    style,
}) => {
    const maxPips = resolvePipCount(stat);
    const filledPips = getFilledPipCount(value, maxPips);

    if (maxPips <= 10) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
                <div
                    role="img"
                    aria-label={`${stat.name}: ${filledPips} of ${maxPips}`}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${maxPips}, minmax(0, 1fr))`,
                        gap: '4px',
                        height: '100%',
                        maxWidth: '100%',
                        aspectRatio: `${maxPips} / 1`,
                    }}
                >
                    {Array.from({ length: maxPips }, (_, index) => {
                        const pipValue = index + 1;
                        return renderStatIcon(stat, pipValue, filledPips >= pipValue, updateScore);
                    })}
                </div>
            </div>
        );
    }

    const groups = Array.from({ length: Math.ceil(maxPips / 5) }, (_, groupIndex) => {
        const start = groupIndex * 5 + 1;
        const end = Math.min(start + 4, maxPips);
        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    });

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', ...style }}>
        <div
            role="img"
            aria-label={`${stat.name}: ${filledPips} of ${maxPips}`}
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))`,
                gap: '8px',
                height: '100%',
                maxWidth: '100%',
                aspectRatio: `${groups.length * 3} / 2`,
            }}
        >
            {groups.map((group, groupIndex) => {
                const topPips = group.slice(0, 3);
                const bottomPips = group.slice(3);

                return (
                    <div
                        key={`${stat.name}-group-${groupIndex}`}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${Math.max(1, topPips.length)}, minmax(0, 1fr))`,
                                gap: '3px',
                            }}
                        >
                            {topPips.map((pipValue) => renderStatIcon(stat, pipValue, filledPips >= pipValue, updateScore))}
                        </div>

                        {bottomPips.length > 0 && (
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${bottomPips.length}, minmax(0, 1fr))`,
                                    gap: '3px',
                                    width: '72%',
                                    margin: '-2px auto 0',
                                }}
                            >
                                {bottomPips.map((pipValue) => renderStatIcon(stat, pipValue, filledPips >= pipValue, updateScore))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
        </div>
    );
};