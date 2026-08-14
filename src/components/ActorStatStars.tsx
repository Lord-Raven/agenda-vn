import { FC } from 'react';
import {
    AttachMoney,
    Favorite,
    FavoriteBorder,
    Gavel,
    HeartBroken,
    LabelImportant,
    LocalFireDepartment,
    MonetizationOn,
    Public,
    Shield,
    Star,
    ThumbUp,
    WbSunny,
    Whatshot,
    Build,
    WorkspacePremium,
} from '@mui/icons-material';
import { ActorStat } from '../Stage';

const STAR_ICON_OPTIONS = [
    { key: 'star', label: 'Star', icon: Star },
    { key: 'heart', label: 'Heart', icon: Favorite },
    { key: 'favorite', label: 'Favorite', icon: FavoriteBorder },
    { key: 'wrench', label: 'Wrench', icon: Build },
    { key: 'coin', label: 'Coin', icon: MonetizationOn },
    { key: 'money', label: 'Money', icon: AttachMoney },
    { key: 'shield', label: 'Shield', icon: Shield },
    { key: 'sun', label: 'Sun', icon: WbSunny },
    { key: 'fire', label: 'Fire', icon: LocalFireDepartment },
    { key: 'spark', label: 'Spark', icon: Whatshot },
    { key: 'award', label: 'Award', icon: WorkspacePremium },
    { key: 'thumbs-up', label: 'Thumbs Up', icon: ThumbUp },
    { key: 'gavel', label: 'Gavel', icon: Gavel },
    { key: 'heart-broken', label: 'Broken Heart', icon: HeartBroken },
    { key: 'chevron', label: 'Chevron', icon: LabelImportant },
    { key: 'world', label: 'World', icon: Public },
];

type StarIconKey = (typeof STAR_ICON_OPTIONS)[number]['key'];

const resolveIcon = (iconName?: string) => {
    const match = STAR_ICON_OPTIONS.find(option => option.key === iconName);
    return match?.icon || Star;
};

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
    starValue: number,
    filled: boolean,
    updateScore?: (value: number) => void,
) => {
    const IconComponent = resolveIcon(stat.iconName);
    const label = `${stat.name} ${starValue} of ${resolveStarCount(stat)}`;
    const fillColor = filled ? 'var(--agenda-highlight)' : 'rgba(11, 17, 28, 0.9)';
    const shadow = filled
        ? 'drop-shadow(0 0 2px color-mix(in srgb, var(--agenda-highlight) 35%, transparent))'
        : 'drop-shadow(0 0 7px rgba(0, 0, 0, 0.85))';

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

export { STAR_ICON_OPTIONS, resolveIcon, type StarIconKey };

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
                        return renderStatIcon(stat, starValue, filledStars >= starValue, updateScore);
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
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', ...style }}>
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
                            {topStars.map((starValue) => renderStatIcon(stat, starValue, filledStars >= starValue, updateScore))}
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
                                {bottomStars.map((starValue) => renderStatIcon(stat, starValue, filledStars >= starValue, updateScore))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
        </div>
    );
};