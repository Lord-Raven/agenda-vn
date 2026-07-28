import React, { FC } from 'react';
import { Stage } from '../Stage';
import { ThemeProvider } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { TooltipProvider, useTooltip } from './TooltipContext';
import { MenuScreen } from './MenuScreen';
import { TooltipBar } from './TooltipBar';
import { theme } from './Theme';
import { CalendarScreen } from './CalendarScreen';
import { CalendarSkitScreen } from './CalendarSkitScreen';
import { LoadingScreen } from './LoadingScreen';

/*
 * Base screen management; the Stage class will display this, and this will track the current screen being displayed.
 */

export enum ScreenType {
    MENU = 'menu',
    LOADING = 'loading',
    CALENDAR = 'calendar',
    SKIT = 'skit',
}

interface BaseScreenProps {
    stage: () => Stage;
}

const BaseScreenContent: FC<{ stage: () => Stage }> = ({ stage }) => {
    const [screenType, setScreenType] = React.useState<ScreenType>(ScreenType.MENU);
    const [isVerticalLayout, setIsVerticalLayout] = React.useState<boolean>(stage().isVerticalLayout());
    const { message, icon, clearTooltip, setPriorityMessage } = useTooltip();

    // Set up the priority message callback in the stage
    React.useEffect(() => {
        stage().setPriorityMessageCallback(setPriorityMessage);
    }, [setPriorityMessage]);

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
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={screenType}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.24, ease: 'easeOut' }}
                    style={{ position: 'absolute', inset: 0 }}
                >
                    {screenType === ScreenType.MENU && (
                        <MenuScreen stage={stage} setScreenType={setScreenType} />
                    )}
                    {screenType === ScreenType.CALENDAR && (
                        <CalendarScreen stage={stage} setScreenType={setScreenType} isVerticalLayout={isVerticalLayout} />
                    )}
                    {screenType === ScreenType.SKIT && (
                        <CalendarSkitScreen stage={stage} setScreenType={setScreenType} isVerticalLayout={isVerticalLayout} />
                    )}
                    {screenType === ScreenType.LOADING && (
                        <LoadingScreen
                            stage={stage}
                            setScreenType={setScreenType}
                        />
                    )}
                </motion.div>
            </AnimatePresence>
            {/* Unified tooltip bar that renders over all screens */}
            <TooltipBar 
                message={message} 
                Icon={icon}
                onDismiss={clearTooltip}
                isVerticalLayout={isVerticalLayout}
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