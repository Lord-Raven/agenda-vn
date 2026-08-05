import React, { FC, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Stage } from '../Stage';
import { Close, Person, Book, Place, Tune, CalendarMonth, Palette } from '@mui/icons-material';
import { Button, GlassPanel, Title } from './UiComponents';
import { ActorManagementPanel } from './ActorManagementPanel';
import { LocationManagementPanel } from './LocationManagementPanel';
import { LorebookManagementPanel } from './LorebookManagementPanel';
import { StyleManagementPanel } from './StyleManagementPanel';
import { GameManagementPanel } from './GameManagementPanel';
import { CalendarEventManagementPanel } from './CalendarEventManagementPanel';

interface ContentManagementScreenProps {
    stage: () => Stage;
    onClose: () => void;
}

type TabType = 'style' | 'game' | 'lorebook' | 'actors' | 'locations' | 'calendarEvents';

export const ContentManagementScreen: FC<ContentManagementScreenProps> = ({ stage, onClose }) => {
    const [activeTab, setActiveTab] = useState<TabType>('style');

    const sortByName = <T extends { name?: string }>(a: T, b: T) =>
        (a.name ?? '').trim().localeCompare((b.name ?? '').trim(), undefined, { sensitivity: 'base' });

    // Get all actors from the save
    const actors = Object.values(stage().getSave().actors)
        .filter(actor => actor.id !== stage().getSave().playerId)
        .filter(actor => actor.active !== false)
        .sort(sortByName);

    // Get all locations from the save atlas
    const locations = Object.values(stage().getSave().atlas || {})
        .filter(location => location.active !== false)
        .sort(sortByName);

    return (
        <>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 10, 20, 0.85)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '10px 20px 30px',
                    }}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 50 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 50 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '90vw',
                            maxWidth: '1400px',
                            maxHeight: '90vh',
                        }}
                    >
                        <GlassPanel 
                            variant="bright"
                            style={{
                                height: '90vh',
                                overflow: 'hidden',
                                position: 'relative',
                                padding: '30px',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            {/* Header with close button */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '20px',
                            }}>
                                <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>
                                    Content Management
                                </Title>
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={onClose}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--agenda-highlight)',
                                        cursor: 'pointer',
                                        fontSize: '24px',
                                        padding: '5px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Close />
                                </motion.button>
                            </div>

                            {/* Tab Navigation */}
                            <div style={{
                                display: 'flex',
                                gap: '10px',
                                marginBottom: '20px',
                                borderBottom: '2px solid var(--agenda-line-strong)',
                                paddingBottom: '10px',
                            }}>
                                <Button
                                    onClick={() => setActiveTab('style')}
                                    variant={activeTab === 'style' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        opacity: activeTab === 'style' ? 1 : 0.6,
                                    }}
                                >
                                    <Palette />
                                    Style
                                </Button>
                                <Button
                                    onClick={() => setActiveTab('game')}
                                    variant={activeTab === 'game' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        opacity: activeTab === 'game' ? 1 : 0.6,
                                    }}
                                >
                                    <Tune />
                                    Game
                                </Button>
                                <Button
                                    onClick={() => setActiveTab('lorebook')}
                                    variant={activeTab === 'lorebook' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        opacity: activeTab === 'lorebook' ? 1 : 0.6,
                                    }}
                                >
                                    <Book />
                                    Lorebook ({stage().getSave().lorebook?.length || 0})
                                </Button>
                                <Button
                                    onClick={() => setActiveTab('actors')}
                                    variant={activeTab === 'actors' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        opacity: activeTab === 'actors' ? 1 : 0.6,
                                    }}
                                >
                                    <Person />
                                    Actors ({actors.length})
                                </Button>
                                <Button
                                    onClick={() => setActiveTab('locations')}
                                    variant={activeTab === 'locations' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        opacity: activeTab === 'locations' ? 1 : 0.6,
                                    }}
                                >
                                    <Place />
                                    Locations ({locations.length})
                                </Button>
                                <Button
                                    onClick={() => setActiveTab('calendarEvents')}
                                    variant={activeTab === 'calendarEvents' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        opacity: activeTab === 'calendarEvents' ? 1 : 0.6,
                                    }}
                                >
                                    <CalendarMonth />
                                    Calendar Events ({stage().getManagedCalendarEvents().length})
                                </Button>
                            </div>

                            {/* Content Area */}
                            <div style={{
                                flex: 1,
                                overflow: 'auto',
                                paddingRight: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                minHeight: 0,
                            }}>
                                {/* Style Tab */}
                                {activeTab === 'style' && (
                                    <StyleManagementPanel stage={stage} />
                                )}

                                {/* Game Tab */}
                                {activeTab === 'game' && (
                                    <GameManagementPanel stage={stage} />
                                )}

                                {/* Lorebook Tab */}
                                {activeTab === 'lorebook' && (
                                    <LorebookManagementPanel stage={stage} />
                                )}

                                {/* Calendar Events Tab */}
                                {activeTab === 'calendarEvents' && (
                                    <CalendarEventManagementPanel stage={stage} />
                                )}

                                {/* Actors Tab */}
                                {activeTab === 'actors' && (
                                    <ActorManagementPanel stage={stage} />
                                )}

                                {/* Locations Tab */}
                                {activeTab === 'locations' && (
                                    <LocationManagementPanel stage={stage} />
                                )}
                            </div>
                        </GlassPanel>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </>
    );
};
