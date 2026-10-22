import { FC, useMemo } from 'react';
import { Box, Link } from '@mui/material';
import { Link as LinkIcon } from '@mui/icons-material';
import { Stage } from '../Stage';
import { isReferenceDisplayType, isReferenceListDisplayType, formatReferenceStatText, formatStatOptionValueText, Stat, StatValue } from '../content/Stat';
import { Actor } from '../content/Actor';
import { Control } from '../content/Control';
import { NamePlate } from './UiComponents';
import { resolveIcon } from './StatRating';
import { StatValueDisplay } from './StatDisplay';
import { processLoreText } from '../content/Lore';

interface ActorCardProps {
    actor?: Actor;
    stage: () => Stage;
    style?: React.CSSProperties;
    className?: string;
}

const resolveStatValue = (actor: Actor, stat: Stat, stage: Stage): StatValue => {
    const raw = (actor.statMap as { [key: string]: StatValue } | undefined)?.[stat.id];
    return stage.readStatValue(raw === undefined || raw === null || raw === '' ? stat.default : raw, stat);
};

const StatValueContainer: FC<{ stat: Stat; control: Control; value: StatValue; save: ReturnType<Stage['getSave']> }> = ({ stat, control, value, save }) => {
    if (stat.type === 'option' || stat.type === 'optionList') {
        return <Box sx={{ color: 'var(--agenda-highlight)', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatStatOptionValueText(stat, value)}</Box>;
    }
    if (isReferenceListDisplayType(stat.type) || isReferenceDisplayType(stat.type)) {
        const displayValue = formatReferenceStatText(stat, value, { actors: save.actors, items: save.inventory, locations: save.atlas });
        return (
            <Box sx={{ color: 'var(--agenda-highlight)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {displayValue}
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
        const isBarType = control.displayType === 'percentage' || control.displayType === 'bar';
        return (
            <Box sx={{ width: isBarType ? '90px' : undefined, height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <StatValueDisplay stat={stat} display={control} value={numericValue} />
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
    const stageInstance = stage();
    const isCalendarMode = stageInstance.getDateMode() === 'calendar';
    const configuredStats = stageInstance.getConfiguration().actorStats || [];
    const statControls = actor ? stageInstance.getVisibleControls('actorCard', actor).flatMap(control => {
        const stat = configuredStats.find(candidate => candidate.id === control.statId);
        return control.type === 'actorStatDisplay' && stat?.name?.trim()
            ? [{ control, stat }]
            : [];
    }) : [];

    const actorAge = useMemo(() => {
        const birthDate = (actor?.birthDate || '').trim();
        if (!isCalendarMode || !birthDate) {
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
    }, [actor?.birthDate, stage, actor?.id, isCalendarMode]);

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

            {actor.summary && (
                <Box sx={{ fontSize: '0.85rem', lineHeight: 1.45, color: 'var(--agenda-text-primary)', textAlign: 'left' }}>
                    {actor.summary}
                </Box>
            )}

            {statControls.length > 0 && (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.75,
                        paddingTop: 1,
                        borderTop: `1px solid color-mix(in srgb, ${themeColor} 40%, transparent)`,
                    }}
                >
                    {statControls.map(({ control, stat }) => {
                        const LabelIcon = control.iconName ? resolveIcon(control.iconName, stageInstance) : null;

                        return (
                            <Box
                                key={control.id}
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto',
                                    alignItems: 'center',
                                    gap: 1,
                                    fontSize: '0.85rem',
                                }}
                                title={processLoreText(control.description, stageInstance, actor) || undefined}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, color: 'var(--agenda-text-muted)', minWidth: 0 }}>
                                    {LabelIcon && <LabelIcon sx={{ fontSize: '0.9rem', color: 'var(--agenda-highlight)' }} />}
                                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{processLoreText(control.label.trim() || stat.name, stageInstance, actor)}</Box>
                                </Box>
                                <StatValueContainer stat={stat} control={{ ...control, ratingIconName: control.displayType === 'rating' ? String(stageInstance.resolveValue(control.ratingIconName, 'text')) : control.ratingIconName }} value={resolveStatValue(actor, stat, stageInstance)} save={stage().getSave()} />
                            </Box>
                        );
                    })}
                </Box>
            )}

            {actor.sourcePath && (
                <Link
                    href={`https://chub.ai/characters/${actor.sourcePath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        alignSelf: 'center',
                        gap: 0.5,
                        marginTop: 'auto',
                        fontSize: '0.75rem',
                        color: 'var(--agenda-text-muted)',
                    }}
                >
                    <LinkIcon sx={{ fontSize: '1rem' }} />
                    {actor.sourcePath.split('/')[0]}
                </Link>
            )}
        </Box>
    );
};
