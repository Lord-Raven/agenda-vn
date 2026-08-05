import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, UiSettings } from '../Stage';
import { AlphaColorPickerInput, buildHexColorSwatches, ColorPickerInput, GlassPanel, TextInput, Title } from './UiComponents';

interface StyleManagementPanelProps {
    stage: () => Stage;
}

const applyUiSettingsToRoot = (uiSettings: UiSettings) => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--agenda-accent', uiSettings.accentColor);
    rootStyle.setProperty('--agenda-active', uiSettings.activeColor);
    rootStyle.setProperty('--agenda-primary', uiSettings.primaryColor);
    rootStyle.setProperty('--agenda-inactive', uiSettings.inactiveColor);
    rootStyle.setProperty('--agenda-bg-deep', uiSettings.bgDeepColor);
    rootStyle.setProperty('--agenda-bg-mid', uiSettings.bgMidColor);
    rootStyle.setProperty('--agenda-bg-soft', uiSettings.bgSoftColor);
    rootStyle.setProperty('--agenda-border', uiSettings.borderColor);
    rootStyle.setProperty('--agenda-border-strong', uiSettings.borderStrongColor);
    rootStyle.setProperty('--agenda-font-ui', uiSettings.uiFontFamily);
    rootStyle.setProperty('--agenda-font-flavor', uiSettings.flavorFontFamily);
    rootStyle.setProperty('--agenda-calendar-overlay-start', uiSettings.calendarOverlayStart);
    rootStyle.setProperty('--agenda-calendar-overlay-mid', uiSettings.calendarOverlayMid);
    rootStyle.setProperty('--agenda-calendar-overlay-end', uiSettings.calendarOverlayEnd);
    rootStyle.setProperty('--agenda-calendar-card-bg', uiSettings.calendarCardBackground);
    rootStyle.setProperty('--agenda-calendar-card-border', uiSettings.calendarCardBorder);

    rootStyle.setProperty('--agenda-fog', uiSettings.primaryColor);
    rootStyle.setProperty('--agenda-verdant', uiSettings.activeColor);
    rootStyle.setProperty('--agenda-mist', uiSettings.accentColor);
    rootStyle.setProperty('--agenda-text-secondary', uiSettings.inactiveColor);
};

export const StyleManagementPanel: FC<StyleManagementPanelProps> = ({ stage }) => {
    const stageInstance = stage();
    const [uiSettings, setUiSettings] = useState<UiSettings>(() => ({ ...stageInstance.getUiSettings() }));
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>UI Theme</Title>

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
        </div>
    );
};

export default StyleManagementPanel;