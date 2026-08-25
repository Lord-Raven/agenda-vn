import { FC, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AllInclusive,
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
    SwapHoriz,
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
import { Stat } from '../content/Stat';

const KEEP_FIRST_ICONS = ['star', 'heart', 'favorite', 'wrench', 'coin', 'shield', 'sun', 'moon', 'fire', 'flake', 'bolt', 'happy', 'sad', 'battery'];
const RATING_ICON_OPTIONS: { key: string; labels: string[]; icon: any }[] = [
    { key: 'star', labels: ['Star', 'Space', 'Rating'], icon: Star },
    { key: 'heart', labels: ['Heart', 'Health'], icon: Favorite },
    { key: 'favorite', labels: ['Favorite', 'Heart', 'Health'], icon: FavoriteBorder },
    { key: 'wrench', labels: ['Wrench', 'Repair', 'Fix', 'Tool'], icon: Build },
    { key: 'coin', labels: ['Coin', 'Money', 'Wealth'], icon: MonetizationOn },
    { key: 'money', labels: ['Money', 'Wealth'], icon: AttachMoney },
    { key: 'cash', labels: ['Cash', 'Money', 'Wealth'], icon: Payments },
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
].sort((a, b) => {
    const aIndex = KEEP_FIRST_ICONS.indexOf(a.key);
    const bIndex = KEEP_FIRST_ICONS.indexOf(b.key);

    if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
    }

    if (aIndex !== -1) {
        return -1;
    }

    if (bIndex !== -1) {
        return 1;
    }

    return a.key.localeCompare(b.key);
});

type RatingIconKey = (typeof RATING_ICON_OPTIONS)[number]['key'];

const resolveIcon = (iconName?: string) => {
    const match = RATING_ICON_OPTIONS.find(option => option.key === iconName);
    return match?.icon || Star;
};

interface IconPickerProps {
    value?: string;
    onChange: (iconName: string | undefined) => void;
    allowClear?: boolean;
    placeholder?: string;
}

export const IconPicker: FC<IconPickerProps> = ({ value, onChange, allowClear = false, placeholder = 'Search icon' }) => {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const filteredOptions = useMemo(() => {
        const query = search.trim().toLowerCase();
        return RATING_ICON_OPTIONS.filter((option) => {
            if (!query) {
                return true;
            }
            return option.labels.join(' ').toLowerCase().includes(query) || option.key.toLowerCase().includes(query);
        });
    }, [search]);

    const selectedValue = value ?? (allowClear ? undefined : 'star');
    const previewIconName = value ?? (allowClear ? undefined : 'star');
    const PreviewIcon = previewIconName ? resolveIcon(previewIconName) : DoNotDisturb;

    const handleSelect = (nextValue?: string) => {
        onChange(nextValue);
        setIsOpen(false);
    };

    const pickerContent = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
                type="text"
                className="input-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                autoFocus
            />
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
                    gap: '8px',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    paddingRight: '4px',
                }}
            >
                {allowClear && (
                    <button
                        key="icon-clear"
                        type="button"
                        onClick={() => handleSelect(undefined)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            background: selectedValue === undefined ? 'color-mix(in srgb, var(--agenda-highlight) 16%, transparent)' : 'var(--agenda-surface-raised)',
                            border: selectedValue === undefined ? '1px solid var(--agenda-highlight)' : '1px solid var(--agenda-line-subtle)',
                            borderRadius: '8px',
                            color: 'var(--agenda-text-primary)',
                            cursor: 'pointer',
                            padding: '10px 8px',
                            minHeight: '72px',
                            fontSize: '11px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <DoNotDisturb style={{ fontSize: 24, color: selectedValue === undefined ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)' }} />
                        <span>None</span>
                    </button>
                )}
                {filteredOptions.map((option) => {
                    const Icon = option.icon;
                    const active = selectedValue === option.key;
                    return (
                        <button
                            key={`icon-${option.key}`}
                            type="button"
                            onClick={() => handleSelect(option.key)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                background: active ? 'color-mix(in srgb, var(--agenda-highlight) 16%, transparent)' : 'var(--agenda-surface-raised)',
                                border: active ? '1px solid var(--agenda-highlight)' : '1px solid var(--agenda-line-subtle)',
                                borderRadius: '8px',
                                color: 'var(--agenda-text-primary)',
                                cursor: 'pointer',
                                padding: '10px 8px',
                                minHeight: '72px',
                                fontSize: '11px',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <Icon style={{ fontSize: 24, color: active ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)' }} />
                            <span>{option.labels[0]}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '52px',
                    minHeight: '38px',
                    border: '1px solid var(--agenda-line-subtle)',
                    borderRadius: '8px',
                    background: 'var(--agenda-surface-raised)',
                    color: 'var(--agenda-text-primary)',
                    cursor: 'pointer',
                    padding: '6px 10px',
                }}
                aria-label={value ? `Selected icon: ${value}` : 'Pick an icon'}
            >
                {value ? (
                    <PreviewIcon style={{ fontSize: 22, color: 'var(--agenda-text-primary)' }} />
                ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--agenda-text-muted)' }}>
                        <DoNotDisturb style={{ fontSize: 18 }} />
                        None
                    </span>
                )}
            </button>

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'color-mix(in srgb, var(--agenda-surface-base) 72%, transparent)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        zIndex: 2000,
                    }}
                    onClick={() => setIsOpen(false)}
                >
                    <div
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: 'min(560px, 100%)',
                            background: 'linear-gradient(135deg, var(--agenda-panel-surface) 0%, color-mix(in srgb, var(--agenda-surface-base) 92%, var(--agenda-panel-surface)) 100%)',
                            border: '1px solid var(--agenda-panel-border)',
                            borderRadius: '12px',
                            padding: '18px',
                            boxShadow: 'var(--agenda-shadow)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--agenda-text-primary)' }}>Choose icon</div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                style={{
                                    border: '1px solid var(--agenda-line-subtle)',
                                    borderRadius: '8px',
                                    background: 'var(--agenda-surface-raised)',
                                    color: 'var(--agenda-text-primary)',
                                    cursor: 'pointer',
                                    padding: '6px 10px',
                                }}
                            >
                                Close
                            </button>
                        </div>
                        {pickerContent}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

interface StatRatingProps {
    stat: Stat;
    value: number;
    updateScore?: (value: number) => void;
    readOnly?: boolean;
    style?: React.CSSProperties;
}

const resolvePipCount = (stat: Stat): number => {
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
    stat: Stat,
    pipValue: number,
    filled: boolean,
    updateScore?: (value: number) => void,
) => {
    const IconComponent = resolveIcon(stat.iconName);
    const label = `${stat.name} ${pipValue} of ${resolvePipCount(stat)}`;
    const fillColor = filled ? (stat.displayColor || 'var(--agenda-highlight)') : 'rgba(11, 17, 28, 0.9)';
    const shadow = filled
        ? `drop-shadow(0 0 2px color-mix(in srgb, ${fillColor} 35%, transparent))`
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

export const StatRating: FC<StatRatingProps> = ({
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