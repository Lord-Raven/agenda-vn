import React, { FC, useMemo, useState } from 'react';
import { Stage, UiSettings } from '../Stage';
import { buildHexColorSwatches, Button, ColorPickerInput, GlassPanel, TextInput, Title } from './UiComponents';

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

    const saveStyleSettings = () => {
        stageInstance.updateUiSettings(uiSettings);
        applyUiSettingsToRoot(uiSettings);
        stageInstance.saveGame();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>UI Theme</Title>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Game Title</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.gameTitle}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, gameTitle: e.target.value }))}
                            placeholder="Agenda VN"
                        />
                    </div>

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
                        <TextInput
                            fullWidth
                            value={uiSettings.borderColor}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, borderColor: e.target.value }))}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Border Strong Color</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.borderStrongColor}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, borderStrongColor: e.target.value }))}
                        />
                    </div>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Calendar Styling</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay Start</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarOverlayStart}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarOverlayStart: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay Mid</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarOverlayMid}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarOverlayMid: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay End</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarOverlayEnd}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarOverlayEnd: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Card Background</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarCardBackground}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarCardBackground: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Card Border</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarCardBorder}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarCardBorder: e.target.value }))}
                        />
                    </div>
                </div>
            </GlassPanel>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Button variant="primary" onClick={saveStyleSettings}>Save Style</Button>
            </div>
        </div>
    );
};

export default StyleManagementPanel;