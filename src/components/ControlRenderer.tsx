import { FC } from 'react';
import { Box, Typography } from '@mui/material';
import { Stage } from '../Stage';
import { Control } from '../content/Control';
import { findStatOptionByValue, formatStatOptionValueText, isReferenceListDisplayType, normalizeReferenceListValue, normalizeStatValue, resolveReferenceKind, resolveStatText, Stat } from '../content/Stat';
import { resolveIcon } from './StatRating';
import { StatValueDisplay } from './StatDisplay';
import { StatValueInput } from './StatValueInput';
import { Button } from './UiComponents';
import { ContentListControl } from './ContentListControl';
import { isValueReference } from '../content/Function';
import { Skit } from '../content/Skit';
import { processLoreText } from '../content/Lore';

interface ControlRendererProps {
    control: Control;
    stage: () => Stage;
    isVerticalLayout?: boolean;
    // Called after a button fires or a stat editor's value changes, so the caller can force a re-render to
    // reflect the resulting save/config state (this component otherwise has no reactive subscription to it).
    onActivate: (skit?: Skit | null) => void;
}

const boxStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0.5,
    padding: '6px 10px',
    borderRadius: '12px',
    border: '1px solid var(--agenda-panel-border)',
    background: 'color-mix(in srgb, var(--agenda-panel-surface) 88%, transparent)',
    boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--agenda-text-primary) 4%, transparent)',
};

const valueFontSize = 'clamp(1rem, 10cqi, 1.75rem)';

const resolveDisplayValue = (stat: Stat, value: unknown, atlas?: { [key: string]: { name: string } }): string => {
    const normalized = normalizeStatValue(value, stat);
    if (stat.type === 'location') {
        return atlas?.[String(normalized)]?.name || '';
    }
    if (stat.type === 'option' || stat.type === 'optionList') {
        return formatStatOptionValueText(stat, normalized) || '';
    }
    if (stat.type === 'checkbox') {
        return normalized === true ? 'True' : 'False';
    }
    return typeof normalized === 'string' ? normalized : `${Number(normalized)}`;
};

// Renders a single Control per its type: 'button' as a clickable action, 'statDisplay'/'statEditor' as the
// same labeled box the Global Stat Bar used to render directly from globalStats. Used by both GlobalStatBar
// (placement 'top') and the bottom control dock (placement 'bottom').
export const ControlRenderer: FC<ControlRendererProps> = ({ control, stage, onActivate, isVerticalLayout = false }) => {
    const stageInstance = stage();
    const fontSize = isVerticalLayout ? 'clamp(0.8rem, 10cqi, 1rem)' : valueFontSize;

    if (control.type === 'actorStatDisplay' || control.type === 'statOutcome') {
        return null;
    }

    const widthWeight = control.widthWeight ?? 1;
    // Floated top controls use the same preferred width as flex-based control rows.
    const preferredWidth = `calc(${isVerticalLayout ? 96 : 150}px * ${widthWeight})`;
    const sizingStyle = {
        flex: `${widthWeight} 1 ${preferredWidth}`,
        width: preferredWidth,
        minWidth: 0,
        boxSizing: 'border-box' as const,
    };

    if (control.type === 'button') {
        const Icon = control.iconName ? resolveIcon(control.iconName, stageInstance) : null;
        return (
            <Button
                variant="secondary"
                title={processLoreText(control.description, stageInstance).trim() || undefined}
                onClick={() => {
                    let skit: Skit | null;
                    try {
                        skit = stageInstance.runControlActions(control);
                    } catch (error) {
                        console.error('Failed to run control actions:', error);
                        stageInstance.showPriorityMessage(`Failed to run button actions: ${error instanceof Error ? error.message : String(error)}`);
                        onActivate();
                        return;
                    }
                    onActivate(skit);
                }}
                style={{ ...sizingStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isVerticalLayout ? 4 : 6, padding: isVerticalLayout ? '4px 6px' : '8px 14px', ...(isVerticalLayout ? { fontSize: '0.8rem', minHeight: 32 } : {}), whiteSpace: 'normal', overflowWrap: 'anywhere' }}
            >
                {Icon && <Icon fontSize="small" />}
                {processLoreText(control.label?.trim() || control.name?.trim() || 'Button', stageInstance)}
            </Button>
        );
    }

    const stat = (stageInstance.getConfiguration().globalStats || []).find((candidate) => candidate.id === control.statId);
    const statName = stat?.name?.trim();
    if (!stat || !statName) {
        return null;
    }

    const rawValue = stageInstance.getSave()?.globalStatValues?.[stat.id]
        ?? stageInstance.getConfiguration()?.globalStatValues?.[stat.id]
        ?? stat.default;
    const normalizedValue = control.type === 'statEditor' ? normalizeStatValue(rawValue, stat) : stageInstance.readStatValue(rawValue, stat);
    const StatIcon = control.iconName ? resolveIcon(control.iconName, stageInstance) : null;
    const label = processLoreText(control.label.trim() || statName, stageInstance);
    const selectedOptionDescription = stat.type === 'option'
        ? resolveStatText(findStatOptionByValue(stat, normalizedValue)?.option.description, stageInstance).trim()
        : '';
    const tooltipText = [processLoreText(control.description, stageInstance).trim(), selectedOptionDescription]
        .filter(Boolean)
        .join('\n\n');
    const referenceKind = resolveReferenceKind(stat.type);
    const displaysImageList = Boolean(
        referenceKind
        && isReferenceListDisplayType(stat.type)
        && control.contentListDisplay !== 'abbreviated'
        && !(control.type === 'statEditor' && isValueReference(rawValue)),
    );
    const imageListMinWidth = isVerticalLayout ? 150 : 180;

    return (
        <Box
            title={tooltipText || undefined}
            sx={{
                ...boxStyle,
                ...sizingStyle,
                ...(displaysImageList ? {
                    gap: 0.25,
                    padding: isVerticalLayout ? '2px 6px' : '2px 10px',
                    minWidth: imageListMinWidth,
                    ...(isVerticalLayout ? { borderRadius: '8px' } : {}),
                } : isVerticalLayout ? { gap: 0.25, padding: '4px 6px', borderRadius: '8px' } : {}),
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, color: 'var(--agenda-text-muted)', lineHeight: 1.2 }}>
                {StatIcon && <StatIcon sx={{ fontSize: '0.8rem', color: 'var(--agenda-highlight)' }} />}
                <Typography sx={{ color: 'var(--agenda-text-muted)', fontSize: isVerticalLayout ? '0.6rem' : '0.66rem', letterSpacing: isVerticalLayout ? '0.05em' : '0.1em', textTransform: 'uppercase', lineHeight: 1.2 }}>
                    {label}
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minWidth: 0, minHeight: isVerticalLayout ? 20 : 32, containerType: 'inline-size' }}>
            {referenceKind && isReferenceListDisplayType(stat.type) && !(control.type === 'statEditor' && isValueReference(rawValue)) ? (
                <ContentListControl
                    kind={referenceKind}
                    values={normalizeReferenceListValue(control.type === 'statEditor' ? rawValue : normalizedValue)}
                    stage={stageInstance}
                    display={control.contentListDisplay}
                    label={label}
                    onChange={control.type === 'statEditor' ? (nextValue) => {
                        stageInstance.setGlobalStatValue(stat.id, nextValue);
                        onActivate();
                    } : undefined}
                />
            ) : control.type === 'statEditor' ? (
                <StatValueInput
                    stat={stat}
                    value={rawValue}
                    onChange={(nextValue) => {
                        stageInstance.setGlobalStatValue(stat.id, nextValue);
                        onActivate();
                    }}
                    stage={stage}
                    actors={Object.values(stageInstance.getSave().actors || {})}
                    items={stageInstance.getSave().inventory || []}
                    locations={Object.values(stageInstance.getSave().atlas || {})}
                />
            ) : stat.type === 'number' ? (
                <StatValueDisplay
                    stat={stat}
                    display={{ ...control, ratingIconName: control.displayType === 'rating' ? String(stageInstance.resolveValue(control.ratingIconName, 'text')) : control.ratingIconName }}
                    value={Number(normalizedValue)}
                    style={{ minHeight: isVerticalLayout ? 16 : 20, ...(control.displayType === 'rating' ? { justifyContent: 'flex-start', ...(isVerticalLayout ? { height: 20 } : {}) } : { fontSize }) }}
                />
            ) : (
                <Typography sx={{ color: control.displayColor || 'var(--agenda-text-primary)', fontSize, fontWeight: 700, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                    {resolveDisplayValue(stat, normalizedValue, stageInstance.getSave()?.atlas)}
                </Typography>
            )}
            </Box>
        </Box>
    );
};
