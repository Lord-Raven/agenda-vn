import React, { FC } from 'react';
import { Stage } from '../Stage';
import { ThemeProvider } from '@mui/material';
import { TooltipProvider, useTooltip } from './TooltipContext';
import { MenuScreen } from './MenuScreen';
import { TooltipBar } from './TooltipBar';
import { theme } from './Theme';
import { CalendarScreen } from './CalendarScreen';
import { LoadingScreen } from './LoadingScreen';
import { usePreloadCriticalImages } from '../utils/useImagePreloading';
import { AffinityPopIn, AffinityChangeInfo } from './AffinityPopIn';

/*
 * Base screen management; the Stage class will display this, and this will track the current screen being displayed.
 */

export enum ScreenType {
    MENU = 'menu',
    LOADING = 'loading',
    CALENDAR = 'calendar',
}

interface BaseScreenProps {
    stage: () => Stage;
}

const BaseScreenContent: FC<{ stage: () => Stage }> = ({ stage }) => {
    const [screenType, setScreenType] = React.useState<ScreenType>(ScreenType.MENU);
    const [isVerticalLayout, setIsVerticalLayout] = React.useState<boolean>(stage().isVerticalLayout());
    const { message, icon, clearTooltip, setPriorityMessage } = useTooltip();

    // Affinity pop-in queue
    const [affinityQueue, setAffinityQueue] = React.useState<AffinityChangeInfo[]>([]);
    const [currentAffinityPopIn, setCurrentAffinityPopIn] = React.useState<AffinityChangeInfo | null>(null);

    // Advance through queue when current pop-in completes
    const handleAffinityComplete = React.useCallback(() => {
        setCurrentAffinityPopIn(null);
        setAffinityQueue(prev => {
            const [, ...rest] = prev;
            return rest;
        });
    }, []);

    // Show next in queue when current finishes
    React.useEffect(() => {
        if (!currentAffinityPopIn && affinityQueue.length > 0) {
            setCurrentAffinityPopIn(affinityQueue[0]);
        }
    }, [currentAffinityPopIn, affinityQueue]);

    // Preload critical images (actor neutrals and location maps) on mount
    const stageInstance = stage();
    const actors = React.useMemo(() => Object.values(stageInstance.getSave()?.actors || {}), [stageInstance.getSave()?.actors]);
    const locations = React.useMemo(() => Object.values(stageInstance.getSave()?.atlas || {}), [stageInstance.getSave()?.atlas]);
    usePreloadCriticalImages(actors, locations);

    // Set up the priority message callback in the stage
    React.useEffect(() => {
        stage().setPriorityMessageCallback(setPriorityMessage);
    }, [setPriorityMessage]);

    // Set up affinity change callback in the stage
    React.useEffect(() => {
        stage().setAffinityChangeCallback((info: AffinityChangeInfo) => {
            setAffinityQueue(prev => [...prev, info]);
        });
    }, []);

    // Update layout orientation on resize
    React.useEffect(() => {
        const handleResize = () => {
            setIsVerticalLayout(stage().isVerticalLayout());
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Clear tooltip whenever screen type changes
    React.useEffect(() => {
        clearTooltip();
    }, [screenType]);

    // Apply save-configured theme variables globally.
    React.useEffect(() => {
        const uiSettings = stage().getUiSettings();
        const rootStyle = document.documentElement.style;

        rootStyle.setProperty('--agenda-mist', uiSettings.mistColor);
        rootStyle.setProperty('--agenda-verdant', uiSettings.verdantColor);
        rootStyle.setProperty('--agenda-fog', uiSettings.fogColor);
        rootStyle.setProperty('--agenda-text-secondary', uiSettings.textSecondaryColor);
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
    }, [stage, screenType]);

    return (
        <div className="agenda-screen-root">
            {screenType === ScreenType.MENU && (
                // Render menu screen
                <MenuScreen stage={stage} setScreenType={setScreenType} />
            )}
            {screenType === ScreenType.CALENDAR && (
                <CalendarScreen stage={stage} setScreenType={setScreenType} isVerticalLayout={isVerticalLayout} />
            )}
            {screenType === ScreenType.LOADING && (
                <LoadingScreen
                    stage={stage}
                    setScreenType={setScreenType}
                />
            )}
            {/* Unified tooltip bar that renders over all screens */}
            <TooltipBar 
                message={message} 
                Icon={icon}
                onDismiss={clearTooltip}
                isVerticalLayout={isVerticalLayout}
            />
            {/* Affinity change pop-in — overlays all screens, non-interactive */}
            <AffinityPopIn
                info={currentAffinityPopIn}
                onComplete={handleAffinityComplete}
            />
        </div>
    );
};

export const BaseScreen: FC<BaseScreenProps> = ({ stage }) => {
    return (
        <ThemeProvider theme={theme}>
            <TooltipProvider>
                <BaseScreenContent stage={stage} />
            </TooltipProvider>
        </ThemeProvider>
    );
}