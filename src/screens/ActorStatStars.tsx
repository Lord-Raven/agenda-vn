import { FC } from 'react';
import { Star, StarBorder } from '@mui/icons-material';
import { ActorStat } from '../Stage';

interface ActorStatStarsProps {
    stat: ActorStat;
    value: number;
    updateScore?: (value: number) => void;
    readOnly?: boolean;
    style?: React.CSSProperties;
}

const resolveStarCount = (stat: ActorStat): number => {
    if (Number.isFinite(stat.max)) {
        return Math.max(1, Math.round(Number(stat.max)));
    }

    return 5;
};

const getFilledStarCount = (value: number, maxStars: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(maxStars, Math.round(value)));
};

const starShellStyle = (interactive: boolean): React.CSSProperties => ({
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    margin: 0,
    border: 0,
    background: 'transparent',
    color: 'var(--agenda-inactive, rgba(154, 198, 192, 0.38))',
    cursor: interactive ? 'pointer' : 'default',
    lineHeight: 0,
    overflow: 'visible',
});

const starBorderStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    color: 'inherit',
};

const starFillStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    color: 'var(--agenda-active, #00ff88)',
    filter: 'drop-shadow(0 0 2px rgba(0, 255, 136, 0.35))',
};

const renderStar = (
    stat: ActorStat,
    starValue: number,
    filled: boolean,
    updateScore?: (value: number) => void,
) => {
    const label = `${stat.name} ${starValue} of ${resolveStarCount(stat)}`;

    return (
        <button
            key={`${stat.name}-star-${starValue}`}
            type="button"
            disabled={!updateScore}
            onClick={updateScore ? () => updateScore?.(starValue) : undefined}
            aria-label={label}
            title={label}
            style={starShellStyle(!!updateScore)}
        >
            <StarBorder style={starBorderStyle} />
            {filled && <Star style={starFillStyle} />}
        </button>
    );
};

export const ActorStatStars: FC<ActorStatStarsProps> = ({
    stat,
    value,
    updateScore,
    style,
}) => {
    const maxStars = resolveStarCount(stat);
    const filledStars = getFilledStarCount(value, maxStars);

    if (maxStars <= 10) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
                <div
                    role="img"
                    aria-label={`${stat.name}: ${filledStars} of ${maxStars}`}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${maxStars}, minmax(0, 1fr))`,
                        gap: '4px',
                        height: '100%',
                        maxWidth: '100%',
                        aspectRatio: `${maxStars} / 1`,
                    }}
                >
                    {Array.from({ length: maxStars }, (_, index) => {
                        const starValue = index + 1;
                        return renderStar(stat, starValue, filledStars >= starValue, updateScore);
                    })}
                </div>
            </div>
        );
    }

    const groups = Array.from({ length: Math.ceil(maxStars / 5) }, (_, groupIndex) => {
        const start = groupIndex * 5 + 1;
        const end = Math.min(start + 4, maxStars);
        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    });

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
        <div
            role="img"
            aria-label={`${stat.name}: ${filledStars} of ${maxStars}`}
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
                const topStars = group.slice(0, 3);
                const bottomStars = group.slice(3);

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
                                gridTemplateColumns: `repeat(${Math.max(1, topStars.length)}, minmax(0, 1fr))`,
                                gap: '3px',
                            }}
                        >
                            {topStars.map((starValue) => renderStar(stat, starValue, filledStars >= starValue, updateScore))}
                        </div>

                        {bottomStars.length > 0 && (
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${bottomStars.length}, minmax(0, 1fr))`,
                                    gap: '3px',
                                    width: '72%',
                                    margin: '-2px auto 0',
                                }}
                            >
                                {bottomStars.map((starValue) => renderStar(stat, starValue, filledStars >= starValue, updateScore))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
        </div>
    );
};