import { FC, useEffect, useState } from "react";
import { Stage } from "../Stage";
import { ScreenType } from "./BaseScreen";
import { FiberNew, Folder, PlayArrow, Save, SaveAlt, Settings } from "@mui/icons-material";
import { SettingsScreen } from "./SettingsScreen";
import { BlurredBackground } from "@lord-raven/novel-visualizer";
import { Button, GridOverlay } from "./UiComponents";
import { motion, AnimatePresence } from "framer-motion";
import { Box } from "@mui/material";
import { useTooltip } from "./TooltipContext";
import React from "react";
import { SaveLoadScreen } from "./SaveLoadScreen";

interface MenuScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
}

export const MenuScreen: FC<MenuScreenProps> = ({ stage, setScreenType }) => {
    const [hoveredButton, setHoveredButton] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [isNewGameSettings, setIsNewGameSettings] = useState(false);
    const [expandedSection, setExpandedSection] = useState<'menu' | 'version' | 'attribution'>('menu');
    const { setTooltip, clearTooltip } = useTooltip();
    const disableAllButtons = false; // When true, disable all options on this menu, including escape to continue; this is being used to effectively shut down the game at the moment.
    const [showSaveLoad, setShowSaveLoad] = React.useState(false);
    const [saveLoadMode, setSaveLoadMode] = React.useState<'save' | 'load'>('save');
    const configuredTitle = stage().getConfiguration().title || 'Agenda VN';
    const configuredTitleImageUrl = (stage().getConfiguration().titleImageUrl || '').trim();

    // Check if a save exists (if there are any actors or the layout has been modified)
    const saveExists = () => {
        return stage().getSave() && Object.keys(stage().getSave().actors).length > 2;
    };

    // Handle escape key to continue game if available
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !disableAllButtons) {
                if (showSettings) {
                    console.log('close settings');
                    handleSettingsCancel();
                } else if (showSaveLoad) {
                    console.log('close save/load');
                    setShowSaveLoad(false);
                } else if (saveExists() && !showSettings) {
                    console.log('continue');
                    handleContinue();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSettings]);

    const handleContinue = () => {
        stage().loadCalendarScreen();
        setScreenType(ScreenType.CALENDAR);
    };

    const handleNewGame = () => {
        setIsNewGameSettings(true);
        setShowSettings(true);
    };

    const handleLoad = () => {
        setSaveLoadMode('load');
        setShowSaveLoad(true);
    };

    const handleSave = () => {
        setSaveLoadMode('save');
        setShowSaveLoad(true);
    };

    const handleSettings = () => {
        // Show settings screen
        setIsNewGameSettings(false);
        setShowSettings(true);
    };

    const handleSettingsCancel = () => {
        setShowSettings(false);
        setIsNewGameSettings(false);
    };

    const handleSettingsConfirm = () => {
        setShowSettings(false);
        if (isNewGameSettings) {
            setIsNewGameSettings(false);
            setScreenType(ScreenType.LOADING);
        }
    };
    
    const noSaveSlotsAvailable = () => {
        return stage().saveData.saves.every(save => save);
    }

    const openSection = (section: 'menu' | 'version' | 'attribution') => {
        setExpandedSection(section);
    };

    const getSectionHeaderClass = (section: 'menu' | 'version' | 'attribution') =>
        expandedSection === section ? 'menu-section-header is-active' : 'menu-section-header';

    const menuButtons = [
        ...(saveExists() ? [{ 
            key: 'continue', 
            label: 'Continue', 
            onClick: handleContinue,
            enabled: !disableAllButtons,
            tooltip: disableAllButtons ? 'Currently unavailable' : 'Resume your current game',
            icon: PlayArrow
        }] : []),
        { 
            key: 'new', 
            label: 'New Game', 
            onClick: handleNewGame,
            enabled: !disableAllButtons && !noSaveSlotsAvailable(),
            tooltip: disableAllButtons ? 'Currently unavailable' : 'Start a fresh playthrough',
            icon: FiberNew
        },
        {
            key: 'save',
            label: 'Save Game',
            onClick: handleSave,
            enabled: !disableAllButtons,
            tooltip: disableAllButtons ? 'Currently unavailable' : 'Save progress to a specific slot',
            icon: SaveAlt
        },
        { 
            key: 'load', 
            label: 'Load Game', 
            onClick: handleLoad,
            enabled: !disableAllButtons,
            tooltip: disableAllButtons ? 'Currently unavailable' : 'Load a previously saved game',
            icon: Folder
        },
        { 
            key: 'settings', 
            label: 'Settings', 
            onClick: handleSettings,
            enabled: !disableAllButtons,
            tooltip: disableAllButtons ? 'Currently unavailable' : 'Adjust game settings and preferences',
            icon: Settings
        },
    ];

    return (
        <BlurredBackground
            imageUrl="https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png"
            overlay="linear-gradient(142deg, rgba(19, 24, 39, 0.78) 0%, rgba(37, 45, 66, 0.76) 52%, rgba(31, 47, 43, 0.72) 100%)"
        >
            <Box 
                sx={{
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh', 
                    width: '100%',
                    overflowX: 'visible',
                    position: 'relative',
                }}
            >
                {/* Background grid effect */}
                <GridOverlay />

                {/* Main menu container */}
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="glass-panel-bright agenda-entrance"
                    style={{
                        padding: 'clamp(20px, 5vh, 40px) clamp(20px, 5vw, 40px)',
                        minWidth: '300px',
                        width: 'min(440px, 90vw)',
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        overflowX: 'visible',
                        overflowY: 'visible',
                        boxSizing: 'border-box',
                        position: 'relative',
                        zIndex: 10,
                    }}
                >
                    {/* Logo - need some title text here. */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        style={{
                            marginBottom: 'clamp(18px, 3vh, 28px)',
                            marginInline: 'clamp(-14px, -2.8vw, -24px)',
                        }}
                    >
                        {configuredTitleImageUrl ? (
                            <motion.img
                                initial={{ opacity: 0, y: -14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4, duration: 0.45, ease: 'easeOut' }}
                                src={configuredTitleImageUrl}
                                alt={configuredTitle}
                                style={{
                                    display: 'block',
                                    width: 'calc(100% + clamp(28px, 5.6vw, 48px))',
                                    maxWidth: 'min(580px, 94vw)',
                                    maxHeight: 'min(320px, 36vh)',
                                    objectFit: 'contain',
                                    margin: '0 auto',
                                    filter: 'drop-shadow(0 10px 28px rgba(0, 0, 0, 0.32))',
                                }}
                            />
                        ) : (
                            <motion.h1
                                initial={{ opacity: 0, y: -14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4, duration: 0.45, ease: 'easeOut' }}
                                style={{
                                    margin: 0,
                                    textAlign: 'center',
                                    color: 'var(--agenda-primary)',
                                    fontFamily: 'var(--agenda-font-flavor)',
                                    fontSize: 'clamp(2.4rem, 8vw, 4.6rem)',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    lineHeight: 0.95,
                                    textTransform: 'uppercase',
                                    textShadow: '0 10px 28px rgba(0, 0, 0, 0.32)',
                                    overflowWrap: 'anywhere',
                                }}
                            >
                                {configuredTitle}
                            </motion.h1>
                        )}
                    </motion.div>

                    {/* Menu sections */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 2vh, 15px)' }}>
                            <div>
                                <Button
                                    variant="menu"
                                    onClick={() => openSection('attribution')}
                                    className={getSectionHeaderClass('attribution')}
                                style={{
                                    width: '100%',
                                    fontSize: 'clamp(11px, 2.2vw, 14px)',
                                    padding: 'clamp(6px, 1.2vh, 10px) clamp(12px, 2.6vw, 18px)',
                                }}
                            >
                                <span className="menu-section-header-track">
                                    <motion.span
                                        layout="position"
                                        className="menu-section-header-label-shell"
                                        transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.8 }}
                                    >
                                        <motion.span
                                            className="menu-section-header-label"
                                            initial={false}
                                            animate={{ x: expandedSection === 'attribution' ? -14 : 14 }}
                                            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.8 }}
                                        >
                                            {"Agenda VN"}
                                        </motion.span>
                                    </motion.span>
                                </span>
                            </Button>
                            <AnimatePresence mode="wait">
                                {expandedSection === 'attribution' && (
                                    <motion.div
                                        key="attribution-content"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                                        style={{
                                            overflow: 'hidden',
                                            width: '100%',
                                            boxSizing: 'border-box',
                                        }}
                                    >
                                        <div
                                            style={{
                                                marginTop: 'clamp(8px, 1.5vh, 12px)',
                                                color: 'rgba(185, 210, 227, 0.72)',
                                                fontSize: 'clamp(10px, 1.5vw, 12px)',
                                                lineHeight: 1.5,
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                wordBreak: 'break-word',
                                                overflowWrap: 'break-word',
                                            }}
                                        >
                                            {`This project is powered by the Agenda VN system by JakeH, a stage that allows for the creation of generative visual novels.`}

                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div>
                            <Button
                                variant="menu"
                                onClick={() => openSection('menu')}
                                className={getSectionHeaderClass('menu')}
                                style={{
                                    width: '100%',
                                    fontSize: 'clamp(11px, 2.2vw, 14px)',
                                    padding: 'clamp(6px, 1.2vh, 10px) clamp(12px, 2.6vw, 18px)',
                                }}
                            >
                                <span className="menu-section-header-track">
                                    <motion.span
                                        layout="position"
                                        className="menu-section-header-label-shell"
                                        transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.8 }}
                                    >
                                        <motion.span
                                            className="menu-section-header-label"
                                            initial={false}
                                            animate={{ x: expandedSection === 'menu' ? -14 : 14 }}
                                            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.8 }}
                                        >
                                            Menu
                                        </motion.span>
                                    </motion.span>
                                </span>
                            </Button>
                            <AnimatePresence mode="wait">
                                {expandedSection === 'menu' && (
                                    <motion.div
                                        key="menu-content"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                                        style={{
                                            overflow: 'visible',
                                            width: '100%',
                                            boxSizing: 'border-box',
                                        }}
                                    >
                                        <div style={{ marginTop: 'clamp(8px, 1.5vh, 12px)', display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 2vh, 15px)' }}>
                                            {menuButtons.map((button, index) => (
                                                <motion.div
                                                    key={button.key}
                                                    initial={{ opacity: 0, x: -30 }}
                                                    animate={{
                                                        opacity: 1,
                                                        x: hoveredButton === button.key && button.enabled ? 10 : 0
                                                    }}
                                                    transition={{
                                                        opacity: { delay: 0.15 + (index * 0.08), duration: 0.4, ease: 'easeOut' },
                                                        x: { duration: 0.2, ease: 'easeOut' }
                                                    }}
                                                    onMouseEnter={() => {
                                                        setHoveredButton(button.enabled ? button.key : null);
                                                        setTooltip(button.tooltip, button.icon);
                                                    }}
                                                    onMouseLeave={() => {
                                                        setHoveredButton(null);
                                                        clearTooltip();
                                                    }}
                                                >
                                                    <Button
                                                        variant="menu"
                                                        onClick={button.enabled ? button.onClick : undefined}
                                                        disabled={!button.enabled}
                                                        style={{
                                                            width: '100%',
                                                            fontSize: 'clamp(12px, 2.5vw, 16px)',
                                                            padding: 'clamp(8px, 1.5vh, 12px) clamp(16px, 3vw, 24px)',
                                                        }}
                                                    >
                                                        {button.label}
                                                    </Button>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div>
                            <Button
                                variant="menu"
                                onClick={() => openSection('version')}
                                className={getSectionHeaderClass('version')}
                                style={{
                                    width: '100%',
                                    fontSize: 'clamp(11px, 2.2vw, 14px)',
                                    padding: 'clamp(6px, 1.2vh, 10px) clamp(12px, 2.6vw, 18px)',
                                }}
                            >
                                <span className="menu-section-header-track">
                                    <motion.span
                                        layout="position"
                                        className="menu-section-header-label-shell"
                                        transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.8 }}
                                    >
                                        <motion.span
                                            className="menu-section-header-label"
                                            initial={false}
                                            animate={{ x: expandedSection === 'version' ? -14 : 14 }}
                                            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.8 }}
                                        >
                                            Version Notes
                                        </motion.span>
                                    </motion.span>
                                </span>
                            </Button>
                            <AnimatePresence mode="wait">
                                {expandedSection === 'version' && (
                                    <motion.div
                                        key="version-content"
                                        initial={{opacity: 0, height: 0}}
                                        animate={{opacity: 1, height: 'auto'}}
                                        exit={{opacity: 0, height: 0}}
                                        transition={{duration: 0.3, ease: 'easeInOut'}}
                                        style={{
                                            overflow: 'hidden',
                                            width: '100%',
                                            boxSizing: 'border-box',
                                        }}
                                    >
                                        <div
                                            style={{
                                                textAlign: 'center',
                                                marginTop: 'clamp(8px, 1.5vh, 12px)',
                                                color: 'rgba(185, 210, 227, 0.72)',
                                                fontSize: 'clamp(10px, 1.5vw, 12px)',
                                                letterSpacing: '0.04em',
                                                width: '100%',
                                                boxSizing: 'border-box',
                                            }}
                                        >
                                            {'v2026.07.06 - Attempting to repair prompting damaged by recent Soji changes.'}
                                        </div>
                                        <div
                                            style={{
                                                textAlign: 'center',
                                                marginTop: 'clamp(8px, 1.5vh, 12px)',
                                                color: 'rgba(185, 210, 227, 0.72)',
                                                fontSize: 'clamp(10px, 1.5vw, 12px)',
                                                letterSpacing: '0.04em',
                                                width: '100%',
                                                boxSizing: 'border-box',
                                            }}
                                        >
                                            {'v2026.04.22 - Initial Release.'}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </motion.div>
            </Box>

            {/* Settings Modal */}
            {showSettings && (
                <SettingsScreen
                    stage={stage}
                    onCancel={handleSettingsCancel}
                    onConfirm={handleSettingsConfirm}
                    isNewGame={isNewGameSettings}
                    setScreenType={setScreenType}
                />
            )}

            {/* Save/Load Modal */}
            {showSaveLoad && (
                <SaveLoadScreen
                    stage={stage}
                    mode={saveLoadMode}
                    onClose={() => setShowSaveLoad(false)}
                    setScreenType={setScreenType}
                />
            )}

        </BlurredBackground>
    );
};