import { ReactNode } from 'react';
import { Stage } from '../Stage';
import { LORE_ICON_TOKEN_COLOR_SEPARATOR, LORE_ICON_TOKEN_PATTERN, LORE_ICON_TOKEN_START, LoreTextActor, processLoreText } from '../content/Lore';
import { FunctionVariableBindings, isValueReference } from '../content/Function';
import { resolveIcon } from './StatRating';

// Renders text produced by processLoreText with { icons: 'token' }: plain segments stay text and each
// {{icon: ...}} token becomes its MUI icon, sized and aligned to the surrounding font. Text without
// tokens passes through unchanged, so this is safe to apply to any display string.
export const renderLoreIcons = (text: string, stage?: Stage): ReactNode => {
    if (!text || !text.includes(LORE_ICON_TOKEN_START)) {
        return text;
    }
    const parts: ReactNode[] = [];
    const pattern = new RegExp(LORE_ICON_TOKEN_PATTERN.source, 'g');
    let lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        const [name, color] = match[1].split(LORE_ICON_TOKEN_COLOR_SEPARATOR);
        // Token names are already resolved; guard the reference case so a missing stage can't throw.
        const Icon = resolveIcon(isValueReference(name) && !stage ? undefined : name, stage);
        parts.push(<Icon key={match.index} sx={{ fontSize: '1em', verticalAlign: '-0.125em', color: color || undefined }} titleAccess={name} />);
        lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
};

// Resolves lore/control text and renders any {{icon: ...}} tags as inline icons.
export const renderLoreTextWithIcons = (text: string | undefined, stage: Stage, targetActor?: LoreTextActor, variables?: FunctionVariableBindings): ReactNode =>
    renderLoreIcons(processLoreText(text, stage, targetActor, variables, undefined, { icons: 'token' }), stage);
