import { buildPrompt } from '../utils/PromptBuilder.js';
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
    StructuredFieldDefinition,
} from '../utils/StructuredResponse.js';

export type UiSettings = {
    uiFontFamily: string;
    flavorFontFamily: string;
    primaryColor: string;
    activeColor: string;
    inactiveColor: string;
    accentColor: string;
    bgDeepColor: string;
    bgMidColor: string;
    bgSoftColor: string;
    borderColor: string;
    borderStrongColor: string;
    calendarOverlayStart: string;
    calendarOverlayMid: string;
    calendarOverlayEnd: string;
    calendarCardBackground: string;
    calendarCardBorder: string;
};

export const DEFAULT_UI_SETTINGS: UiSettings = {
    uiFontFamily: '"Geologica", sans-serif',
    flavorFontFamily: '"Lora", Georgia, serif',
    accentColor: '#8ab0cc',
    activeColor: '#89cd87',
    primaryColor: '#edf2f2',
    inactiveColor: '#b9d2e3',
    bgDeepColor: '#1a1e30',
    bgMidColor: '#24293f',
    bgSoftColor: '#2e354d',
    borderColor: 'rgba(138, 176, 204, 0.34)',
    borderStrongColor: 'rgba(137, 205, 135, 0.44)',
    calendarOverlayStart: 'rgba(10, 28, 37, 0.79)',
    calendarOverlayMid: 'rgba(21, 41, 30, 0.73)',
    calendarOverlayEnd: 'rgba(35, 24, 56, 0.78)',
    calendarCardBackground: 'rgba(28, 34, 52, 0.92)',
    calendarCardBorder: 'rgba(138, 176, 204, 0.34)',
};

export const UI_SETTINGS_GENERATION_FIELDS: StructuredFieldDefinition[] = [
    { key: 'ui_font_family', label: 'UI FONT FAMILY', description: 'Primary UI font stack for controls and interface text.' },
    { key: 'flavor_font_family', label: 'FLAVOR FONT FAMILY', description: 'Secondary flavor font stack for decorative or narrative-forward headings/body copy.' },
    { key: 'primary_color', label: 'PRIMARY COLOR', description: 'Main readable UI text color for high-emphasis content.' },
    { key: 'inactive_color', label: 'INACTIVE COLOR', description: 'Muted text color for secondary or de-emphasized UI text.' },
    { key: 'active_color', label: 'ACTIVE COLOR', description: 'Highlight color for selected, active, or currently focused states.' },
    { key: 'accent_color', label: 'ACCENT COLOR', description: 'Accent color for icons, special labels, and differentiation points.' },
    { key: 'bg_deep_color', label: 'BG DEEP COLOR', description: 'Deepest background layer color for base canvas and depth.' },
    { key: 'bg_mid_color', label: 'BG MID COLOR', description: 'Middle background layer color for panels and transitions.' },
    { key: 'bg_soft_color', label: 'BG SOFT COLOR', description: 'Soft background layer color for elevated sections and gentle contrast.' },
    { key: 'border_color', label: 'BORDER COLOR', description: 'Standard border color for panels and common framing.' },
    { key: 'border_strong_color', label: 'BORDER STRONG COLOR', description: 'Stronger border color for key callouts and emphasized framing.' },
    { key: 'calendar_overlay_start', label: 'CALENDAR OVERLAY START', description: 'Gradient overlay start color for the calendar background atmosphere.' },
    { key: 'calendar_overlay_mid', label: 'CALENDAR OVERLAY MID', description: 'Gradient overlay midpoint color for calendar depth transitions.' },
    { key: 'calendar_overlay_end', label: 'CALENDAR OVERLAY END', description: 'Gradient overlay end color for calendar finish and mood.' },
    { key: 'calendar_card_background', label: 'CALENDAR CARD BACKGROUND', description: 'Background color for calendar day/event cards.' },
    { key: 'calendar_card_border', label: 'CALENDAR CARD BORDER', description: 'Border color for calendar day/event cards.' },
];

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA_COLOR_REGEX = /^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|0?\.\d+|1(?:\.0+)?))?\s*\)$/i;

export const cloneUiSettings = (settings?: Partial<UiSettings>): UiSettings => ({
    ...DEFAULT_UI_SETTINGS,
    ...(settings || {}),
});

export const renderContextSegment = (segment: any): string => {
    if (typeof segment?.body === 'string') {
        return segment.body;
    }
    if (Array.isArray(segment?.body)) {
        return segment.body
            .map((child: any) => `${child.title}:\n${renderContextSegment(child)}`)
            .join('\n\n');
    }
    return '';
};

export const applyUiSettingsToRoot = (uiSettings: UiSettings) => {
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

const isValidHexColor = (value: string): boolean => HEX_COLOR_REGEX.test((value || '').trim());

const isValidCssColor = (value: string): boolean => {
    const normalized = (value || '').trim();
    return HEX_COLOR_REGEX.test(normalized) || RGBA_COLOR_REGEX.test(normalized);
};

const buildStyleUsageGuide = () => [
    'uiFontFamily: Main font for controls, labels, and core interface text.',
    'flavorFontFamily: Flavor font for stylized tone, dramatic emphasis, and thematic text moments.',
    'primaryColor: Main high-contrast text color.',
    'inactiveColor: Subdued text color for secondary information.',
    'activeColor: Active/selected/highlight color for actionable or focused UI states.',
    'accentColor: Accent color for icons and visual differentiation.',
    'bgDeepColor: Deepest layer of the background palette.',
    'bgMidColor: Mid-layer background color supporting panel separation.',
    'bgSoftColor: Soft elevated background tone for nearby surfaces.',
    'borderColor: Regular border stroke color.',
    'borderStrongColor: Strong border stroke color for emphasis.',
    'calendarOverlayStart: Calendar atmospheric overlay gradient start.',
    'calendarOverlayMid: Calendar atmospheric overlay gradient midpoint.',
    'calendarOverlayEnd: Calendar atmospheric overlay gradient end.',
    'calendarCardBackground: Calendar card fill color.',
    'calendarCardBorder: Calendar card border color.',
].join('\n');

export type UiStyleGenerationInput = {
    gameTitle: string;
    worldContext: string;
    selectedSettingsContext: string;
    actorContext: string;
    locationContext: string;
    currentUiSettings: UiSettings;
};

export const buildUiSettingsGenerationPrompt = (input: UiStyleGenerationInput): string => {
    return buildPrompt()
        .addBlock(
            'Instructions',
            'This is a structured request for generating a complete UI style profile for a calendar-driven visual novel. ' +
            'Select font stacks and colors that match the game world and current cast/location tone. ' +
            'Return every field in the required format. ' +
            'Use valid CSS font-family values. ' +
            'For primary/inactive/active/accent/background fields, output hex colors (#RRGGBB preferred). ' +
            'For border and calendar overlay/card fields, output valid CSS colors (hex or rgba).',
        )
        .addBlock('Game Title', input.gameTitle || 'Agenda VN')
        .addBlock('World Context', input.worldContext || 'None provided.')
        .addBlock('Selected Settings Context', input.selectedSettingsContext || 'None selected.')
        .addBlock('Active Characters', input.actorContext || 'None.')
        .addBlock('Active Locations', input.locationContext || 'None.')
        .addBlock('Field Usage Guide', buildStyleUsageGuide())
        .addBlock('Current Style Values', JSON.stringify(input.currentUiSettings, null, 2))
        .addBlock('Response Format', buildStructuredResponseFormat(UI_SETTINGS_GENERATION_FIELDS, { includeEndTag: true }))
        .addBlock('Example Response', buildStructuredExampleResponse(UI_SETTINGS_GENERATION_FIELDS, {
            ui_font_family: '"Nunito Sans", "Segoe UI", sans-serif',
            flavor_font_family: '"Cormorant Garamond", "Times New Roman", serif',
            primary_color: '#f0f5f9',
            inactive_color: '#adc2d3',
            active_color: '#8dd1a2',
            accent_color: '#9abed9',
            bg_deep_color: '#141c2a',
            bg_mid_color: '#1f2a3d',
            bg_soft_color: '#28344a',
            border_color: 'rgba(154, 190, 217, 0.35)',
            border_strong_color: 'rgba(141, 209, 162, 0.5)',
            calendar_overlay_start: 'rgba(11, 22, 37, 0.82)',
            calendar_overlay_mid: 'rgba(24, 41, 46, 0.74)',
            calendar_overlay_end: 'rgba(35, 27, 59, 0.79)',
            calendar_card_background: 'rgba(25, 33, 50, 0.92)',
            calendar_card_border: 'rgba(154, 190, 217, 0.37)',
        }, { includeEndTag: true }))
        .format();
};

export const mergeGeneratedUiSettings = (current: UiSettings, parsed: { [key: string]: string }): UiSettings => ({
    ...current,
    uiFontFamily: (parsed.ui_font_family || current.uiFontFamily).trim() || current.uiFontFamily,
    flavorFontFamily: (parsed.flavor_font_family || current.flavorFontFamily).trim() || current.flavorFontFamily,
    primaryColor: isValidHexColor(parsed.primary_color || '') ? parsed.primary_color.trim() : current.primaryColor,
    inactiveColor: isValidHexColor(parsed.inactive_color || '') ? parsed.inactive_color.trim() : current.inactiveColor,
    activeColor: isValidHexColor(parsed.active_color || '') ? parsed.active_color.trim() : current.activeColor,
    accentColor: isValidHexColor(parsed.accent_color || '') ? parsed.accent_color.trim() : current.accentColor,
    bgDeepColor: isValidHexColor(parsed.bg_deep_color || '') ? parsed.bg_deep_color.trim() : current.bgDeepColor,
    bgMidColor: isValidHexColor(parsed.bg_mid_color || '') ? parsed.bg_mid_color.trim() : current.bgMidColor,
    bgSoftColor: isValidHexColor(parsed.bg_soft_color || '') ? parsed.bg_soft_color.trim() : current.bgSoftColor,
    borderColor: isValidCssColor(parsed.border_color || '') ? parsed.border_color.trim() : current.borderColor,
    borderStrongColor: isValidCssColor(parsed.border_strong_color || '') ? parsed.border_strong_color.trim() : current.borderStrongColor,
    calendarOverlayStart: isValidCssColor(parsed.calendar_overlay_start || '') ? parsed.calendar_overlay_start.trim() : current.calendarOverlayStart,
    calendarOverlayMid: isValidCssColor(parsed.calendar_overlay_mid || '') ? parsed.calendar_overlay_mid.trim() : current.calendarOverlayMid,
    calendarOverlayEnd: isValidCssColor(parsed.calendar_overlay_end || '') ? parsed.calendar_overlay_end.trim() : current.calendarOverlayEnd,
    calendarCardBackground: isValidCssColor(parsed.calendar_card_background || '') ? parsed.calendar_card_background.trim() : current.calendarCardBackground,
    calendarCardBorder: isValidCssColor(parsed.calendar_card_border || '') ? parsed.calendar_card_border.trim() : current.calendarCardBorder,
});
