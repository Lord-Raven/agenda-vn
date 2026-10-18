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

interface ControlRendererProps {
    control: Control;
    stage: () => Stage;
    // Called after a button fires or a stat editor's value changes, so the caller can force a re-render to
    // reflect the resulting save/config state (this component otherwise has no reactive subscription to it).
    onActivate: () => void;
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
export const ControlRenderer: FC<ControlRendererProps> = ({ control, stage, onActivate }) => {
    const stageInstance = stage();

    if (control.type === 'actorStatDisplay' || control.type === 'statOutcome') {
        return null;
    }

    const widthWeight = control.widthWeight ?? 1;
    const sizingStyle = {
        flex: `${widthWeight} 1 calc(150px * ${widthWeight})`,
        minWidth: 0,
        boxSizing: 'border-box' as const,
    };

    if (control.type === 'button') {
        const Icon = control.iconName ? resolveIcon(control.iconName, stageInstance) : null;
        return (
            <Button
                variant="secondary"
                onClick={() => {
                    stageInstance.runControlActions(control);
                    onActivate();
                }}
                style={{ ...sizingStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px', whiteSpace: 'normal', overflowWrap: 'anywhere' }}
            >
                {Icon && <Icon fontSize="small" />}
                {control.label?.trim() || control.name?.trim() || 'Button'}
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
    const label = control.label.trim() || statName;
    const selectedOptionDescription = stat.type === 'option'
        ? resolveStatText(findStatOptionByValue(stat, normalizedValue)?.option.description, stageInstance).trim()
        : '';
    const tooltipText = [resolveStatText(control.description, stageInstance).trim(), selectedOptionDescription]
        .filter(Boolean)
        .join('\n\n');
    const referenceKind = resolveReferenceKind(stat.type);

    return (
        <Box title={tooltipText || undefined} sx={{ ...boxStyle, ...sizingStyle }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, color: 'var(--agenda-text-muted)', lineHeight: 1.2 }}>
                {StatIcon && <StatIcon sx={{ fontSize: '0.8rem', color: 'var(--agenda-highlight)' }} />}
                <Typography sx={{ color: 'var(--agenda-text-muted)', fontSize: '0.66rem', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.2 }}>
                    {label}
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minWidth: 0, minHeight: 32, containerType: 'inline-size' }}>
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
                    style={{ minHeight: 20, ...(control.displayType === 'rating' ? { justifyContent: 'flex-start' } : { fontSize: valueFontSize }) }}
                />
            ) : (
                <Typography sx={{ color: control.displayColor || 'var(--agenda-text-primary)', fontSize: valueFontSize, fontWeight: 700, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                    {resolveDisplayValue(stat, normalizedValue, stageInstance.getSave()?.atlas)}
                </Typography>
            )}
            </Box>
        </Box>
    );
};
