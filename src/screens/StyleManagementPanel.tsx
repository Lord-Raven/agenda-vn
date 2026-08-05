import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { AutoAwesome } from '@mui/icons-material';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { Stage } from '../Stage';
import {
    applyUiSettingsToRoot,
    buildUiSettingsGenerationPrompt,
    mergeGeneratedUiSettings,
    renderContextSegment,
    UiSettings,
    UI_SETTINGS_GENERATION_FIELDS,
} from '../content/Style';
import { parseStructuredResponse } from '../utils/StructuredResponse.js';
import { AlphaColorPickerInput, buildHexColorSwatches, Button, ColorPickerInput, GlassPanel, TextInput, Title } from './UiComponents';

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
        { label: 'Primary Text', key: 'primaryColor' },
        { label: 'Secondary Text', key: 'inactiveColor' },
        { label: 'Active Text', key: 'activeColor' },
        { label: 'Accent Text', key: 'accentColor' },
        { label: 'Background Deep', key: 'bgDeepColor' },
        { label: 'Background Mid', key: 'bgMidColor' },
        { label: 'Background Soft', key: 'bgSoftColor' },
    ];

    const groupedStyleSwatches = useMemo(() => ({
        text: buildHexColorSwatches([
            uiSettings.primaryColor,
            uiSettings.inactiveColor,
            uiSettings.activeColor,
            uiSettings.accentColor,
        ]),
        background: buildHexColorSwatches([
            uiSettings.bgDeepColor,
            uiSettings.bgMidColor,
            uiSettings.bgSoftColor,
        ]),
        all: buildHexColorSwatches([
            uiSettings.primaryColor,
            uiSettings.inactiveColor,
            uiSettings.activeColor,
            uiSettings.accentColor,
            uiSettings.bgDeepColor,
            uiSettings.bgMidColor,
            uiSettings.bgSoftColor,
        ]),
    }), [
        uiSettings.activeColor,
        uiSettings.accentColor,
        uiSettings.bgDeepColor,
        uiSettings.bgMidColor,
        uiSettings.bgSoftColor,
        uiSettings.inactiveColor,
        uiSettings.primaryColor,
    ]);

    const getSwatchesForStyleKey = (key: keyof UiSettings): string[] => {
        if (key === 'primaryColor' || key === 'inactiveColor' || key === 'activeColor' || key === 'accentColor') {
            return groupedStyleSwatches.text;
        }

        if (key === 'bgDeepColor' || key === 'bgMidColor' || key === 'bgSoftColor') {
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
            const contextText = (configuration.context || [])
                .map((segment) => `${segment.title}:\n${renderContextSegment(segment)}`)
                .join('\n\n') || 'None provided.';

            const selectedSettingContext = (configuration.settings || []).map((setting) => {
                const selectedOptionName = configuration.selectedSettings?.[setting.title] || '';
                if (!selectedOptionName) {
                    return '';
                }

                const selectedSegment = setting.options?.[selectedOptionName];
                if (!selectedSegment) {
                    return `${setting.title}: ${selectedOptionName}`;
                }

                return `${setting.title}: ${selectedOptionName}\n${renderContextSegment(selectedSegment)}`;
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
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>UI Font Family</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.uiFontFamily}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, uiFontFamily: e.target.value }))}
                            placeholder='"Geologica", sans-serif'
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Flavor Font Family</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.flavorFontFamily}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, flavorFontFamily: e.target.value }))}
                            placeholder='"Lora", Georgia, serif'
                        />
                    </div>

                    {styleColorFields.map(({ label, key }) => (
                        <div key={key}>
                            <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>{label}</label>
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
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Border Color</label>
                        <AlphaColorPickerInput
                            value={uiSettings.borderColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, borderColor: value }))}
                            popoverTitle="Choose Border Color"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Border Strong Color</label>
                        <AlphaColorPickerInput
                            value={uiSettings.borderStrongColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, borderStrongColor: value }))}
                            popoverTitle="Choose Border Strong Color"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Calendar Styling</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay Start</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarOverlayStart}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarOverlayStart: value }))}
                            popoverTitle="Choose Overlay Start"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay Mid</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarOverlayMid}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarOverlayMid: value }))}
                            popoverTitle="Choose Overlay Mid"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay End</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarOverlayEnd}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarOverlayEnd: value }))}
                            popoverTitle="Choose Overlay End"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Card Background</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarCardBackground}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarCardBackground: value }))}
                            popoverTitle="Choose Card Background"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Card Border</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarCardBorder}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarCardBorder: value }))}
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
                            backgroundColor: 'rgba(0, 20, 40, 0.95)',
                            backdropFilter: 'blur(10px)',
                            border: '2px solid rgba(0, 255, 136, 0.3)',
                            borderRadius: '8px',
                            color: '#e0f0ff',
                            minWidth: '400px',
                        },
                    },
                }}
            >
                <DialogTitle style={{
                    color: '#00ff88',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    borderBottom: '2px solid rgba(0, 255, 136, 0.3)',
                    paddingBottom: '10px',
                }}>
                    {confirmDialog.title}
                </DialogTitle>
                <DialogContent style={{ paddingTop: '20px' }}>
                    <div style={{
                        color: '#e0f0ff',
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