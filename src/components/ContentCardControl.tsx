import { createContext, CSSProperties, FC, ReactNode, useContext, useState } from 'react';
import { Box, Link, Typography } from '@mui/material';
import { Link as LinkIcon } from '@mui/icons-material';
import { ResolvedListCardDetail, Stage } from '../Stage';
import { ContentType } from '../content/Condition';
import { Control } from '../content/Control';
import { Skit } from '../content/Skit';
import { formatStatOptionValueText, resolveReferenceKind } from '../content/Stat';
import { getLocationImageUrl } from '../content/Location';
import { processLoreText } from '../content/Lore';
import { NamePlate } from './UiComponents';
import { ActorPortrait } from './ActorPortrait';
import { ItemPortrait } from './ItemPortrait';
import { CachedBackgroundUrl } from './CachedImage';
import { ContentListPortraits } from './ContentListControl';
import { resolveIcon } from './StatRating';
import { StatValueDisplay } from './StatDisplay';

export const CardActionContext = createContext<((skit?: Skit | null) => void) | undefined>(undefined);

interface ContentCardControlProps {
    stage: () => Stage;
    control: Control;
    kind: ContentType;
    id: string;
    header?: string;
    orientation?: 'horizontal' | 'vertical';
    compact?: boolean;
    disabled?: boolean;
    subtitle?: ReactNode;
    trailing?: ReactNode;
    onClick?: () => void;
    onAction?: (skit?: Skit | null) => void;
    style?: CSSProperties;
    className?: string;
}

export const ContentCardControl: FC<ContentCardControlProps> = ({
    stage, control, kind, id, header = '', orientation = 'horizontal', compact = false,
    disabled = false, subtitle, trailing, onClick, onAction, style, className,
}) => {
    const globalOnAction = useContext(CardActionContext);
    const [, refresh] = useState(0);
    const instance = stage();
    const save = instance.getSave();
    const actor = kind === 'actor' ? save.actors[id] : undefined;
    const item = kind === 'item' ? save.inventory.find(candidate => candidate.id === id) : undefined;
    const location = kind === 'location' ? save.atlas[id] : undefined;
    const entity = actor || item || location;
    const state = instance.resolveCardState(control, kind, id, header);
    if (!entity || !state.visible) return null;

    const vertical = orientation === 'vertical';
    const unavailable = disabled || !state.available;
    const clickable = !!onClick || control.actions.length > 0;
    const text = (value: string) => instance.resolveCardText(value, kind, id, header);
    const label = text(control.label);
    const subLabel = text(control.subLabel);
    const description = text(control.description);
    const LabelIcon = control.iconName ? resolveIcon(control.iconName, instance) : null;
    const color = entity.themeColor || 'var(--agenda-accent-primary)';
    const portraitSize = vertical ? 96 : compact ? 48 : 60;
    const details = control.cardDetails
        .map(reference => instance.resolveListCardDetail(reference, kind, id, header))
        .filter((detail): detail is ResolvedListCardDetail => !!detail);
    const activate = () => {
        const current = instance.resolveCardState(control, kind, id, header);
        if (disabled || !current.visible || !current.available) return;
        try {
            const skit = control.actions.length ? instance.runCardActions(control, kind, id, header) : null;
            if (!skit) onClick?.();
            (onAction || globalOnAction)?.(skit);
        } catch (error) {
            console.error('Failed to run card actions:', error);
            instance.showPriorityMessage(`Failed to run card actions: ${error instanceof Error ? error.message : String(error)}`);
            (onAction || globalOnAction)?.();
        }
        refresh(value => value + 1);
    };
    const body = (
        <Box data-content-card={kind} data-card-control={control.id} data-card-orientation={orientation}
            className={className} role={clickable ? 'button' : undefined}
            tabIndex={clickable && !unavailable ? 0 : undefined} aria-disabled={clickable ? unavailable : undefined}
            onClick={clickable ? activate : undefined}
            onKeyDown={clickable ? event => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    activate();
                }
            } : undefined}
            sx={{
                position: 'relative', display: 'flex', flexDirection: vertical ? 'column' : 'row',
                alignItems: vertical ? 'stretch' : 'center', gap: 1.5, p: 2, minWidth: 0,
                minHeight: location && control.showPortrait ? (vertical ? 240 : compact ? 180 : 210) : undefined,
                maxWidth: vertical ? 320 : undefined, borderRadius: 2, overflow: 'hidden',
                border: `1px solid ${color}`, backgroundColor: 'var(--agenda-panel-surface)',
                backgroundImage: location && control.showPortrait ? 'var(--card-background)' : undefined,
                backgroundSize: 'cover',
                backgroundPosition: `${(location?.focalPoint?.x ?? 0.5) * 100}% ${(location?.focalPoint?.y ?? 0.5) * 100}%`,
                boxShadow: 'var(--agenda-shadow)', color: 'var(--agenda-text-primary)',
                fontFamily: 'var(--agenda-font-primary)', opacity: unavailable ? 0.56 : 1,
                cursor: clickable ? unavailable ? 'not-allowed' : 'pointer' : 'default',
                ...style,
            }}>
            {control.showPortrait && !location && (
                <Box sx={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    {actor ? <ActorPortrait actor={actor} stage={instance} size={portraitSize} borderRadius={12} />
                        : <ItemPortrait item={item} stage={instance} width={portraitSize} height={portraitSize} borderRadius={12} />}
                </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0, textAlign: vertical ? 'center' : 'left' }}>
                {LabelIcon && <LabelIcon sx={{ color: 'var(--agenda-highlight)', mr: 0.75 }} />}
                {label && (control.useNamePlate ? <NamePlate actor={entity} label={label} />
                    : <Typography sx={{ fontWeight: 700, fontSize: '1.2rem', overflowWrap: 'anywhere' }}>{label}</Typography>)}
                {subLabel && <Typography sx={{ fontSize: '0.8rem', color: 'var(--agenda-text-muted)', mt: 0.5 }}>{subLabel}</Typography>}
                {description && <Typography sx={{ fontSize: '0.85rem', textAlign: 'left', whiteSpace: 'pre-wrap', mt: 0.75 }}>{description}</Typography>}
                {subtitle}
            </Box>
            {(details.length > 0 || trailing) && (
                <Box sx={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', flexWrap: 'wrap', gap: 0.75,
                        alignItems: vertical ? 'stretch' : 'center', justifyContent: 'flex-end', minWidth: 0, maxWidth: vertical ? '100%' : '50%' }}>
                    {details.map(detail => <ListCardDetail key={detail.key} detail={detail} stage={instance}
                        isVerticalLayout={compact} kind={kind} id={id} header={header} />)}
                    {trailing && <Box onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{trailing}</Box>}
                </Box>
            )}
            {control.showSourceLink && actor?.sourcePath && (
                <Link href={`https://chub.ai/characters/${actor.sourcePath}`} target="_blank" rel="noopener noreferrer"
                    onClick={event => event.stopPropagation()}
                    sx={{ alignSelf: 'center', display: 'flex', gap: 0.5, color: 'var(--agenda-text-muted)', fontSize: '0.75rem' }}>
                    <LinkIcon sx={{ fontSize: '1rem' }} />{actor.sourcePath.split('/')[0]}
                </Link>
            )}
        </Box>
    );
    if (!location || !control.showPortrait) return body;
    return <CachedBackgroundUrl url={getLocationImageUrl(location, instance)}>{url => (
        <Box sx={{ '--card-background': url
            ? `linear-gradient(110deg, color-mix(in srgb, var(--agenda-surface-base) 82%, transparent), color-mix(in srgb, var(--agenda-surface-base) 55%, transparent)), url(${JSON.stringify(url)})`
            : 'none' }}>{body}</Box>
    )}</CachedBackgroundUrl>;
};

const formatDetailText = (detail: ResolvedListCardDetail): string => {
    if (detail.stat && (detail.type === 'option' || detail.type === 'optionList')) {
        return formatStatOptionValueText(detail.stat, detail.value) ?? '';
    }
    if (detail.type === 'boolean') return detail.value ? 'Yes' : 'No';
    return Array.isArray(detail.value) ? detail.value.join(', ') : String(detail.value ?? '');
};

export const ListCardDetail: FC<{
    detail: ResolvedListCardDetail; stage: Stage; isVerticalLayout: boolean;
    kind?: ContentType; id?: string; header?: string;
}> = ({ detail, stage, isVerticalLayout, kind, id, header }) => {
    const control = detail.control;
    const text = (value: string) => kind && id ? stage.resolveCardText(value, kind, id, header) : processLoreText(value, stage);
    const label = control ? text(control.label.trim()) : detail.label;
    const isReference = ['actor', 'actorList', 'item', 'itemList', 'location', 'locationList', 'contentList'].includes(detail.type);
    if (isReference) {
        const values = (Array.isArray(detail.value) ? detail.value : [detail.value]).map(String).filter(Boolean);
        return values.length ? (
            <Box data-popup-card-detail={detail.key} title={label} sx={{ display: 'flex' }}
                onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                <ContentListPortraits kind={resolveReferenceKind(detail.type)} values={values} stage={stage} label={label} variant="overlay" size={isVerticalLayout ? 30 : 36} />
            </Box>
        ) : null;
    }
    const BadgeIcon = control?.iconName ? resolveIcon(control.iconName, stage) : null;
    // Icon stats render their value as the named icon itself (empty value shows nothing).
    const ValueIcon = detail.type === 'icon' && typeof detail.value === 'string' && detail.value.trim()
        ? resolveIcon(detail.value, stage)
        : null;
    const numericValue = Number(detail.value);
    const display = control && detail.stat && detail.type === 'number' && Number.isFinite(numericValue) && (
        <Box sx={{ width: control.displayType === 'percentage' || control.displayType === 'bar' ? 90 : undefined, height: 16, display: 'flex', alignItems: 'center' }}>
            <StatValueDisplay stat={detail.stat} display={{
                ...control, ratingIconName: String(stage.resolveValue(control.ratingIconName, 'text', stage.getSave(), [], kind && id ? { [kind]: id, header } : undefined)),
            }} value={numericValue} />
        </Box>
    );
    return (
        <Box data-popup-card-detail={detail.key} title={control ? text(control.description).trim() || undefined : undefined} sx={{
            display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.4, borderRadius: '999px',
            border: '1px solid var(--agenda-line-subtle)', background: 'color-mix(in srgb, var(--agenda-surface-base) 70%, transparent)',
            maxWidth: 220, minWidth: 0,
        }}>
            {BadgeIcon && <BadgeIcon sx={{ fontSize: '0.9rem', color: control?.displayColor || 'var(--agenda-text-muted)' }} />}
            {label && <Typography component="span" sx={{ color: 'var(--agenda-text-muted)', fontSize: '0.7rem' }}>{label}</Typography>}
            {display || (detail.type === 'icon'
                ? ValueIcon && <ValueIcon sx={{ fontSize: '0.95rem', color: control?.displayColor || 'var(--agenda-text-primary)' }} titleAccess={label || undefined} />
                : <Typography component="span" sx={{
                    color: control?.displayColor || 'var(--agenda-text-primary)', fontSize: '0.8rem', fontWeight: 700,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{formatDetailText(detail)}</Typography>)}
        </Box>
    );
};
