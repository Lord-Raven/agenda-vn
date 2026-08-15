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
import {
    Payments,
    Bedtime,
    AcUnit,
    Sell,
    WatchLater,
    HourglassBottom,
    SentimentSatisfied,
    SentimentDissatisfied,
    Anchor,
    Bolt,
    BackHand,
    Audiotrack,
    AttachFile,
    BatteryFull,
    BatterySaver,
    BatteryAlert,
    BatteryChargingFull,
    Bookmark,
    BugReport,
    Cake,
    CameraAlt,
    Camera,
    DirectionsCar,
    Cloud,
    Cancel,
    CameraRoll,
    CalendarToday,
    Castle,
    CatchingPokemon,
    Chair,
    CheckCircle,
    Church,
    Coffee,
    ColorLens,
    Colorize,
    CompassCalibration,
    Construction,
    Cookie,
    Cottage,
    Dangerous,
    Diamond,
    Directions,
    Coronavirus,
    Delete,
    DoNotDisturb,
    Email,
    Error,
    Feedback,
    Female,
    Explore,
    FilterVintage,
    FilterAlt,
    FilterHdr,
    FlashOn,
    Flight,
    Forest,
    Fort,
    FormatPaint,
    FreeBreakfast,
} from '@mui/icons-material';
import { ActorStat } from '../Stage';

const RATING_ICON_OPTIONS: { key: string; labels: string[]; icon: any }[] = [
    { key: 'star', labels: ['Star'], icon: Star },
    { key: 'heart', labels: ['Heart'], icon: Favorite },
    { key: 'favorite', labels: ['Favorite'], icon: FavoriteBorder },
    { key: 'wrench', labels: ['Wrench'], icon: Build },
    { key: 'coin', labels: ['Coin'], icon: MonetizationOn },
    { key: 'money', labels: ['Money'], icon: AttachMoney },
    { key: 'cash', labels: ['Cash'], icon: Payments },
    { key: 'shield', labels: ['Shield'], icon: Shield },
    { key: 'sun', labels: ['Sun'], icon: WbSunny },
    { key: 'moon', labels: ['Moon'], icon: Bedtime },
    { key: 'fire', labels: ['Fire'], icon: LocalFireDepartment },
    { key: 'flake', labels: ['Flake'], icon: AcUnit },
    { key: 'spark', labels: ['Spark'], icon: Whatshot },
    { key: 'award', labels: ['Award'], icon: WorkspacePremium },
    { key: 'thumbs-up', labels: ['Thumbs Up'], icon: ThumbUp },
    { key: 'gavel', labels: ['Gavel'], icon: Gavel },
    { key: 'heart-broken', labels: ['Broken Heart'], icon: HeartBroken },
    { key: 'chevron', labels: ['Chevron'], icon: LabelImportant },
    { key: 'world', labels: ['World'], icon: Public },
    { key: 'tag', labels: ['Tag'], icon: Sell },
    { key: 'clock', labels: ['Clock'], icon: WatchLater },
    { key: 'time', labels: ['Time'], icon: HourglassBottom },
    { key: 'happy', labels: ['Happy'], icon: SentimentSatisfied },
    { key: 'sad', labels: ['Sad'], icon: SentimentDissatisfied },
    { key: 'anchor', labels: ['Anchor'], icon: Anchor },
    { key: 'bolt', labels: ['Bolt'], icon: Bolt },
    { key: 'hand', labels: ['Hand'], icon: BackHand },
    { key: 'music', labels: ['Music'], icon: Audiotrack },
    { key: 'clip', labels: ['Clip'], icon: AttachFile },
    { key: 'battery', labels: ['Battery'], icon: BatteryFull },
    { key: 'battery-plus', labels: ['Battery Plus'], icon: BatterySaver },
    { key: 'battery-alert', labels: ['Battery Alert'], icon: BatteryAlert },
    { key: 'battery-charging', labels: ['Battery Charging'], icon: BatteryChargingFull },
    { key: 'bookmark', labels: ['Bookmark'], icon: Bookmark },
    { key: 'bug', labels: ['Bug'], icon: BugReport },
    { key: 'cake', labels: ['Cake'], icon: Cake },
    { key: 'camera', labels: ['Camera'], icon: CameraAlt },
    { key: 'aperture', labels: ['Aperture'], icon: Camera },
    { key: 'car', labels: ['Car'], icon: DirectionsCar },
    { key: 'cloud', labels: ['Cloud'], icon: Cloud },
    { key: 'cancel', labels: ['Cancel'], icon: Cancel },
    { key: 'camera-roll', labels: ['Camera Roll'], icon: CameraRoll },
    { key: 'calendar', labels: ['Calendar'], icon: CalendarToday },
    { key: 'castle', labels: ['Castle'], icon: Castle },
    { key: "pokemon", labels: ["Pokemon"], icon: CatchingPokemon },
    { key: 'chair', labels: ['Chair'], icon: Chair },
    { key: 'check', labels: ['Check'], icon: CheckCircle },
    { key: 'church', labels: ['Church'], icon: Church },
    { key: 'coffee', labels: ['Coffee'], icon: Coffee },
    { key: 'palette', labels: ['Palette'], icon: ColorLens },
    { key: 'color-picker', labels: ['Color Picker'], icon: Colorize },
    { key: 'compass', labels: ['Compass'], icon: CompassCalibration },
    { key: 'construction', labels: ['Construction'], icon: Construction },
    { key: 'cookie', labels: ['Cookie'], icon: Cookie },
    { key: 'cottage', labels: ['Cottage'], icon: Cottage },
    { key: 'dangerous', labels: ['Dangerous'], icon: Dangerous },
    { key: 'diamond', labels: ['Diamond'], icon: Diamond },
    { key: 'directions', labels: ['Directions'], icon: Directions },
    { key: 'virus', labels: ['Virus'], icon: Coronavirus },
    { key: 'trash', labels: ['Trash'], icon: Delete },
    { key: 'do-not-disturb', labels: ['Do Not Disturb'], icon: DoNotDisturb },
    { key: 'email', labels: ['Email'], icon: Email },
    { key: 'error', labels: ['Error'], icon: Error },
    { key: 'favorite', labels: ['Favorite'], icon: Favorite },
    { key: 'feedback', labels: ['Feedback'], icon: Feedback },
    { key: 'female', labels: ['Female'], icon: Female },
    { key: 'explore', labels: ['Explore'], icon: Explore },
    { key: 'flower', labels: ['Flower'], icon: FilterVintage },
    { key: 'filter', labels: ['Filter'], icon: FilterAlt },
    { key: 'mountain', labels: ['Mountain'], icon: FilterHdr },
    { key: 'lightning', labels: ['Lightning'], icon: FlashOn },
    { key: 'airplane', labels: ['Airplane'], icon: Flight },
    { key: 'forest', labels: ['Forest'], icon: Forest },
    { key: 'fortress', labels: ['Fortress'], icon: Fort },
    { key: 'paint', labels: ['Paint'], icon: FormatPaint },
    { key: 'coffee-cup', labels: ['Coffee Cup'], icon: FreeBreakfast }
];

type RatingIconKey = (typeof RATING_ICON_OPTIONS)[number]['key'];

const resolveIcon = (iconName?: string) => {
    const match = RATING_ICON_OPTIONS.find(option => option.key === iconName);
    return match?.icon || Star;
};

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