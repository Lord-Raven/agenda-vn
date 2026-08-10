import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { AutoAwesome } from '@mui/icons-material';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { Stage } from '../Stage';
import {
    applyUiSettingsToRoot,
    buildUiSettingsGenerationPrompt,
    mergeGeneratedUiSettings,
    UiSettings,
    UI_STYLE_FIELD_LABELS,
    UI_SETTINGS_GENERATION_FIELDS,
} from '../content/Style';
import { formatLoreEntriesAsContext, selectConstantLoreEntries } from '../content/Lore';
import { parseStructuredResponse } from '../utils/StructuredResponse.js';
import { AlphaColorPickerInput, buildHexColorSwatches, Button, ColorPickerInput, GlassPanel, TextInput, Title } from '../components/UiComponents';

interface StyleManagementPanelProps {
    stage: () => Stage;
}

export const StyleManagementPanel: FC<StyleManagementPanelProps> = ({ stage }) => {
    const stageInstance = stage();
    const [uiSettings, setUiSettings] = useState<UiSettings>(() => ({ ...stageInstance.getUiSettings() }));
    const [isGeneratingStyles, setIsGeneratingStyles] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        title: string;
        message: string;
        actions?: Array<{ label: string; onClick: () => void; variant?: 'primary' | 'secondary' }>;
    }>({ open: false, title: '', message: '' });
    const hasInitializedAutoSave = useRef(false);

    const styleColorFields: Array<{ label: string; key: keyof UiSettings }> = [
        { label: UI_STYLE_FIELD_LABELS.textPrimaryColor, key: 'textPrimaryColor' },
        { label: UI_STYLE_FIELD_LABELS.textMutedColor, key: 'textMutedColor' },
        { label: UI_STYLE_FIELD_LABELS.highlightColor, key: 'highlightColor' },
        { label: UI_STYLE_FIELD_LABELS.warningColor, key: 'warningColor' },
        { label: UI_STYLE_FIELD_LABELS.dangerTextColor, key: 'dangerTextColor' },
        { label: UI_STYLE_FIELD_LABELS.accentColor, key: 'accentColor' },
        { label: UI_STYLE_FIELD_LABELS.surfaceBaseColor, key: 'surfaceBaseColor' },
        { label: UI_STYLE_FIELD_LABELS.surfaceElevatedColor, key: 'surfaceElevatedColor' },
    ];

    const groupedStyleSwatches = useMemo(() => ({
        text: buildHexColorSwatches([
            uiSettings.textPrimaryColor,
            uiSettings.textMutedColor,
            uiSettings.highlightColor,
            uiSettings.warningColor,
            uiSettings.dangerTextColor,
            uiSettings.accentColor,
        ]),
        background: buildHexColorSwatches([
            uiSettings.surfaceBaseColor,
            uiSettings.surfaceElevatedColor,
        ]),
        all: buildHexColorSwatches([
            uiSettings.textPrimaryColor,
            uiSettings.textMutedColor,
            uiSettings.highlightColor,
            uiSettings.warningColor,
            uiSettings.dangerTextColor,
            uiSettings.accentColor,
            uiSettings.surfaceBaseColor,
            uiSettings.surfaceElevatedColor,
        ]),
    }), [
        uiSettings.highlightColor,
        uiSettings.warningColor,
        uiSettings.dangerTextColor,
        uiSettings.accentColor,
        uiSettings.surfaceBaseColor,
        uiSettings.surfaceElevatedColor,
        uiSettings.textMutedColor,
        uiSettings.textPrimaryColor,
    ]);

    const getSwatchesForStyleKey = (key: keyof UiSettings): string[] => {
        if (
            key === 'textPrimaryColor'
            || key === 'textMutedColor'
            || key === 'highlightColor'
            || key === 'warningColor'
            || key === 'dangerTextColor'
            || key === 'accentColor'
        ) {
            return groupedStyleSwatches.text;
        }

        if (key === 'surfaceBaseColor' || key === 'surfaceElevatedColor') {
            return groupedStyleSwatches.background;
        }

        return groupedStyleSwatches.all;
    };

    useEffect(() => {
        if (!hasInitializedAutoSave.current) {
            hasInitializedAutoSave.current = true;
            return;
        }

        const saveTimer = window.setTimeout(() => {
            stageInstance.updateUiSettings(uiSettings);
            applyUiSettingsToRoot(uiSettings);
        }, 200);

        return () => window.clearTimeout(saveTimer);
    }, [stageInstance, uiSettings]);

    const handleGenerateStyles = async () => {
        if (isGeneratingStyles) {
            return;
        }

        setIsGeneratingStyles(true);

        try {
            const configuration = stageInstance.getConfiguration();
            const save = stageInstance.getSave();
            const activeActors = Object.values(save.actors || {}).filter(actor => actor.active !== false && actor.id !== save.playerId);
            const activeLocations = Object.values(save.atlas || {}).filter(location => location.active !== false);
            const contextText = formatLoreEntriesAsContext(selectConstantLoreEntries(save.lorebook || [], save)) || 'None provided.';

            const selectedSettingContext = (configuration.playerStats || []).map((stat) => {
                const statName = (stat.name || '').trim();
                if (!statName) {
                    return '';
                }

                const selectedValue = save.playerStatValues?.[statName] ?? stat.default;
                const valueText = typeof selectedValue === 'number' ? String(selectedValue) : String(selectedValue || '');
                if (!valueText) {
                    return '';
                }

                if (stat.displayType === 'option') {
                    const selectedOption = (stat.options || []).find(option => option.name === valueText);
                    return [
                        `${statName}: ${valueText}`,
                        stat.description?.trim(),
                        selectedOption?.description?.trim() || '',
                    ].filter(Boolean).join('\n');
                }

                return [
                    `${statName}: ${valueText}`,
                    stat.description?.trim(),
                ].filter(Boolean).join('\n');
            }).filter(Boolean).join('\n\n') || 'None selected.';

            const actorContext = activeActors.slice(0, 12).map((actor) =>
                `${actor.name}: ${actor.profile || actor.description || 'No profile available.'}`,
            ).join('\n') || 'None.';

            const locationContext = activeLocations.slice(0, 12).map((location) =>
                `${location.name}${location.category ? ` (${location.category})` : ''}: ${location.description || 'No description available.'}`,
            ).join('\n') || 'None.';

            const response = await stageInstance.generateText(
                buildUiSettingsGenerationPrompt({
                    gameTitle: configuration.title || 'Agenda VN',
                    worldContext: contextText,
                    selectedSettingsContext: selectedSettingContext,
                    actorContext,
                    locationContext,
                    currentUiSettings: uiSettings,
                }),
                80,
                550,
                UI_SETTINGS_GENERATION_FIELDS,
            );

            const parsed = parseStructuredResponse(response, UI_SETTINGS_GENERATION_FIELDS);

            const nextSettings = mergeGeneratedUiSettings(uiSettings, parsed);

            setUiSettings(nextSettings);
            stageInstance.updateUiSettings(nextSettings);
            applyUiSettingsToRoot(nextSettings);
            stageInstance.showPriorityMessage('Generated style palette and font settings from game context.');
        } catch (error) {
            console.error('Failed to generate style settings:', error);
            stageInstance.showPriorityMessage('Failed to generate style settings. Check console for details.');
        } finally {
            setIsGeneratingStyles(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                    <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>UI Theme</Title>
                    <Button
                        onClick={() => {
                            if (isGeneratingStyles) {
                                return;
                            }

                            setConfirmDialog({
                                open: true,
                                title: 'Generate UI Theme',
                                message: 'Warning: this will overwrite all current font and color settings on this screen.',
                                actions: [
                                    {
                                        label: isGeneratingStyles ? 'Generating...' : 'Generate',
                                        onClick: async () => {
                                            setConfirmDialog((prev) => ({ ...prev, open: false }));
                                            await handleGenerateStyles();
                                        },
                                        variant: 'primary',
                                    },
                                ],
                            });
                        }}
                        disabled={isGeneratingStyles}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <AutoAwesome style={{ fontSize: '18px' }} />
                        {isGeneratingStyles ? 'Generating...' : 'Generate'}
                    </Button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{UI_STYLE_FIELD_LABELS.interfaceFontFamily}</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.interfaceFontFamily}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, interfaceFontFamily: e.target.value }))}
                            placeholder='"Geologica", sans-serif'
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{UI_STYLE_FIELD_LABELS.displayFontFamily}</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.displayFontFamily}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, displayFontFamily: e.target.value }))}
                            placeholder='"Lora", Georgia, serif'
                        />
                    </div>

                    {styleColorFields.map(({ label, key }) => (
                        <div key={key}>
                            <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{label}</label>
                            <ColorPickerInput
                                value={uiSettings[key] as string}
                                onChange={(value) => setUiSettings(prev => ({ ...prev, [key]: value }))}
                                popoverTitle={`Choose ${label}`}
                                swatches={getSwatchesForStyleKey(key)}
                                inputStyle={{ width: '100%' }}
                            />
                        </div>
                    ))}

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{UI_STYLE_FIELD_LABELS.lineSubtleColor}</label>
                        <AlphaColorPickerInput
                            value={uiSettings.lineSubtleColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, lineSubtleColor: value }))}
                            popoverTitle="Choose Border Color"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{UI_STYLE_FIELD_LABELS.lineStrongColor}</label>
                        <AlphaColorPickerInput
                            value={uiSettings.lineStrongColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, lineStrongColor: value }))}
                            popoverTitle="Choose Border Strong Color"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Overlay & Panel Styling</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{UI_STYLE_FIELD_LABELS.atmosphereStartColor}</label>
                        <AlphaColorPickerInput
                            value={uiSettings.atmosphereStartColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, atmosphereStartColor: value }))}
                            popoverTitle="Choose Overlay Start"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{UI_STYLE_FIELD_LABELS.atmosphereEndColor}</label>
                        <AlphaColorPickerInput
                            value={uiSettings.atmosphereEndColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, atmosphereEndColor: value }))}
                            popoverTitle="Choose Overlay End"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{UI_STYLE_FIELD_LABELS.panelSurfaceColor}</label>
                        <AlphaColorPickerInput
                            value={uiSettings.panelSurfaceColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, panelSurfaceColor: value }))}
                            popoverTitle="Choose Card Background"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{UI_STYLE_FIELD_LABELS.panelBorderColor}</label>
                        <AlphaColorPickerInput
                            value={uiSettings.panelBorderColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, panelBorderColor: value }))}
                            popoverTitle="Choose Card Border"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                </div>
            </GlassPanel>

            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                slotProps={{
                    paper: {
                        style: {
                            backgroundColor: 'var(--agenda-surface-base)',
                            backdropFilter: 'blur(10px)',
                            border: '2px solid var(--agenda-line-strong)',
                            borderRadius: '8px',
                            color: 'var(--agenda-text-primary)',
                            minWidth: '400px',
                        },
                    },
                }}
            >
                <DialogTitle style={{
                    color: 'var(--agenda-highlight)',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    borderBottom: '2px solid var(--agenda-line-strong)',
                    paddingBottom: '10px',
                }}>
                    {confirmDialog.title}
                </DialogTitle>
                <DialogContent style={{ paddingTop: '20px' }}>
                    <div style={{
                        color: 'var(--agenda-text-primary)',
                        fontSize: '14px',
                        lineHeight: '1.6',
                    }}>
                        {confirmDialog.message}
                    </div>
                </DialogContent>
                <DialogActions style={{ padding: '15px 20px', display: 'flex', gap: '10px' }}>
                    <Button
                        onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                        variant="secondary"
                    >
                        Cancel
                    </Button>
                    {confirmDialog.actions?.map((action, index) => (
                        <Button
                            key={index}
                            onClick={action.onClick}
                            variant={action.variant || 'primary'}
                        >
                            {action.label}
                        </Button>
                    ))}
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default StyleManagementPanel;