import React, { FC, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Stage } from '../Stage';
import { Close, Person, Book, Place, Tune, CalendarMonth, Palette, Map as MapIcon, BarChart, Inventory2, Code, Rule } from '@mui/icons-material';
import { Button, GlassPanel, Title } from '../components/UiComponents';
import { ActorManagementPanel } from './ActorManagementPanel';
import { LocationManagementPanel } from './LocationManagementPanel';
import { LorebookManagementPanel } from './LorebookManagementPanel';
import { StyleManagementPanel } from './StyleManagementPanel';
import { GameManagementPanel } from './GameManagementPanel';
import { CalendarEventManagementPanel } from './CalendarEventManagementPanel';
import { MapManagementPanel } from './MapManagementPanel';
import { StatManagementPanel } from './StatManagementPanel';
import { RulesManagementPanel } from './RulesManagementPanel';
import { ItemManagementPanel } from './ItemManagementPanel';
import { ControlManagementPanel } from './ControlManagementPanel';
import { FunctionManagementPanel } from './FunctionManagementPanel';

interface ContentManagementScreenProps {
    stage: () => Stage;
    onClose: () => void;
}

type TabType = 'game' | 'style' | 'stats' | 'rules' | 'functions' | 'controls' | 'lorebook' | 'actors' | 'locations' | 'items' | 'maps' | 'calendarEvents';
const tabStorageKey = 'contentManagement.activeTab';
const tabs: TabType[] = ['game', 'style', 'stats', 'rules', 'functions', 'controls', 'lorebook', 'actors', 'locations', 'items', 'maps', 'calendarEvents'];
const creatorTabs: TabType[] = ['game', 'style', 'rules', 'functions', 'controls'];

export const ContentManagementScreen: FC<ContentManagementScreenProps> = ({ stage, onClose }) => {
    const [isCreateMode, setIsCreateMode] = useState(() => stage().isOwner);
    const isCreatorMode = stage().isOwner && isCreateMode;
    const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'published' | 'failed'>('idle');
    const [applyStatus, setApplyStatus] = useState<'idle' | 'applying' | 'applied' | 'failed'>('idle');
    const [applyError, setApplyError] = useState<string | null>(null);
    const applyInProgress = React.useRef(false);
    const isBusy = publishStatus === 'publishing' || applyStatus === 'applying';
    const hasSave = !!stage().saveData.saves[stage().saveData.lastSaveSlot];
    const eventsEnabled = stage().areEventsEnabled();

    useEffect(() => {
        if (publishStatus !== 'published' && publishStatus !== 'failed') {
            return;
        }
        const timeout = window.setTimeout(() => setPublishStatus('idle'), 2500);
        return () => window.clearTimeout(timeout);
    }, [publishStatus]);

    useEffect(() => {
        if (applyStatus !== 'applied') return;
        const timeout = window.setTimeout(() => setApplyStatus('idle'), 2500);
        return () => window.clearTimeout(timeout);
    }, [applyStatus]);

    const handleApply = async () => {
        if (applyInProgress.current || isBusy) return;
        applyInProgress.current = true;
        setApplyError(null);
        try {
            // Unmount editors first so their pending debounced changes flush before taking the draft snapshot.
            flushSync(() => setApplyStatus('applying'));
            await stage().applyConfigurationToSave();
            setApplyStatus('applied');
        } catch (error) {
            console.error('Failed to apply creator configuration', error);
            setApplyStatus('failed');
            setApplyError(error instanceof Error ? error.message : 'Failed to apply configuration.');
        } finally {
            applyInProgress.current = false;
        }
    };

    const handlePublish = async () => {
        if (isBusy) return;
        flushSync(() => setPublishStatus('publishing'));
        const success = await stage().publishStageConfiguration();
        setPublishStatus(success ? 'published' : 'failed');
    };
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        const savedTab = sessionStorage.getItem(tabStorageKey) as TabType | null;
        return savedTab && tabs.includes(savedTab) && (isCreatorMode || !creatorTabs.includes(savedTab)) && (eventsEnabled || savedTab !== 'calendarEvents') ? savedTab : 'actors';
    });

    useEffect(() => {
        if ((!isCreatorMode && creatorTabs.includes(activeTab)) || (!eventsEnabled && activeTab === 'calendarEvents')) {
            setActiveTab('actors');
        }
    }, [activeTab, isCreatorMode, eventsEnabled]);

    useEffect(() => {
        if (isCreatorMode || !creatorTabs.includes(activeTab)) {
            sessionStorage.setItem(tabStorageKey, activeTab);
        }
    }, [activeTab, isCreatorMode]);

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

    const items = (stage().getSave().inventory || [])
        .filter(item => item.active !== false)
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
                            maxWidth: '2000px',
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {stage().isOwner && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                color: isCreatorMode ? 'var(--agenda-text-muted)' : 'var(--agenda-highlight)',
                                                fontSize: '14px',
                                                fontWeight: isCreatorMode ? 400 : 700,
                                            }}>
                                                Manage
                                            </span>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-label="Create mode"
                                                aria-checked={isCreatorMode}
                                                title={isCreatorMode ? 'Switch to manage mode' : 'Switch to create mode'}
                                                onClick={() => setIsCreateMode((current) => !current)}
                                                disabled={isBusy}
                                                style={{
                                                    position: 'relative',
                                                    width: '46px',
                                                    height: '26px',
                                                    padding: 0,
                                                    border: '1px solid var(--agenda-line-strong)',
                                                    borderRadius: '13px',
                                                    background: isCreatorMode ? 'var(--agenda-highlight)' : 'var(--agenda-surface-base)',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.2s ease',
                                                }}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    style={{
                                                        position: 'absolute',
                                                        top: '2px',
                                                        left: '3px',
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '50%',
                                                        background: 'var(--agenda-text-primary)',
                                                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
                                                        transform: isCreatorMode ? 'translateX(18px)' : 'translateX(0)',
                                                        transition: 'transform 0.2s ease',
                                                    }}
                                                />
                                            </button>
                                            <span style={{
                                                color: isCreatorMode ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)',
                                                fontSize: '14px',
                                                fontWeight: isCreatorMode ? 700 : 400,
                                            }}>
                                                Create
                                            </span>
                                            <Button
                                                variant="secondary"
                                                disabled={isBusy}
                                                onClick={handlePublish}
                                                title="Publish the current configuration so other users receive it"
                                                style={{ marginLeft: '8px', padding: '6px 14px', fontSize: '14px' }}
                                            >
                                                {publishStatus === 'publishing' ? 'Publishing...'
                                                    : publishStatus === 'published' ? 'Published'
                                                    : publishStatus === 'failed' ? 'Publish Failed'
                                                    : 'Publish'}
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                disabled={isBusy || !hasSave}
                                                onClick={handleApply}
                                                title={hasSave
                                                    ? 'Apply all draft configuration and content to the current save without cloning or publishing. Matching content is replaced.'
                                                    : 'Start or load a game before applying the draft'}
                                                style={{ padding: '6px 14px', fontSize: '14px' }}
                                            >
                                                {applyStatus === 'applying' ? 'Applying...'
                                                    : applyStatus === 'applied' ? 'Applied'
                                                    : applyStatus === 'failed' ? 'Apply Failed'
                                                    : 'Apply'}
                                            </Button>
                                        </div>
                                    )}
                                    <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={onClose}
                                        disabled={isBusy}
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
                            </div>
                            {applyError && <div role="alert" style={{ color: 'var(--agenda-danger-text)', marginBottom: '12px' }}>{applyError}</div>}
                            {applyStatus === 'applied' && <div role="status">Applied draft configuration and content to the current save.</div>}

                            {/* Tab Navigation */}
                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '10px',
                                marginBottom: '20px',
                                borderBottom: '2px solid var(--agenda-line-strong)',
                                paddingBottom: '10px',
                            }}>
                                {isCreatorMode && (
                                    <Button
                                        onClick={() => setActiveTab('game')}
                                        variant={activeTab === 'game' ? 'primary' : 'secondary'}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            flex: '0 0 auto',
                                            gap: '8px',
                                            opacity: activeTab === 'game' ? 1 : 0.6,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <Tune />
                                        Game
                                    </Button>
                                )}
                                {isCreatorMode && (
                                    <Button
                                        onClick={() => setActiveTab('style')}
                                        variant={activeTab === 'style' ? 'primary' : 'secondary'}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            flex: '0 0 auto',
                                            gap: '8px',
                                            opacity: activeTab === 'style' ? 1 : 0.6,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <Palette />
                                        Style
                                    </Button>
                                )}
                                <Button
                                    onClick={() => setActiveTab('stats')}
                                    variant={activeTab === 'stats' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flex: '0 0 auto',
                                        gap: '8px',
                                        opacity: activeTab === 'stats' ? 1 : 0.6,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <BarChart />
                                    Stats ({stage().getConfiguration().globalStats.length + stage().getConfiguration().actorStats.length + stage().getConfiguration().locationStats.length + stage().getConfiguration().itemStats.length})
                                </Button>
                                {isCreatorMode && (
                                    <Button
                                        onClick={() => setActiveTab('rules')}
                                        variant={activeTab === 'rules' ? 'primary' : 'secondary'}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: activeTab === 'rules' ? 1 : 0.6 }}
                                    >
                                        <Rule /> Rules
                                    </Button>
                                )}
                                {isCreatorMode && (
                                    <Button onClick={() => setActiveTab('functions')} variant={activeTab === 'functions' ? 'primary' : 'secondary'}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: activeTab === 'functions' ? 1 : 0.6 }}>
                                        <Code /> Functions ({stage().getConfiguration().functions.length})
                                    </Button>
                                )}
                                {isCreatorMode && (
                                    <Button
                                        onClick={() => setActiveTab('controls')}
                                        variant={activeTab === 'controls' ? 'primary' : 'secondary'}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            flex: '0 0 auto',
                                            gap: '8px',
                                            opacity: activeTab === 'controls' ? 1 : 0.6,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <Tune />
                                        Controls ({(stage().getConfiguration().controls || []).filter(control => control.active !== false).length})
                                    </Button>
                                )}
                                <Button
                                    onClick={() => setActiveTab('lorebook')}
                                    variant={activeTab === 'lorebook' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flex: '0 0 auto',
                                        gap: '8px',
                                        opacity: activeTab === 'lorebook' ? 1 : 0.6,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <Book />
                                    Lorebook ({(isCreatorMode ? stage().getConfiguration().lorebook : stage().getSave().lorebook)?.length || 0})
                                </Button>
                                <Button
                                    onClick={() => setActiveTab('actors')}
                                    variant={activeTab === 'actors' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flex: '0 0 auto',
                                        gap: '8px',
                                        opacity: activeTab === 'actors' ? 1 : 0.6,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <Person />
                                    Actors ({(isCreatorMode ? stage().getConfiguration().actors : actors).filter(actor => actor.active !== false).length})
                                </Button>
                                <Button
                                    onClick={() => setActiveTab('locations')}
                                    variant={activeTab === 'locations' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flex: '0 0 auto',
                                        gap: '8px',
                                        opacity: activeTab === 'locations' ? 1 : 0.6,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <Place />
                                    Locations ({(isCreatorMode ? stage().getConfiguration().locations : locations).filter(location => location.active !== false).length})
                                </Button>
                                <Button
                                    onClick={() => setActiveTab('maps')}
                                    variant={activeTab === 'maps' ? 'primary' : 'secondary'}
                                    style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', gap: '8px', opacity: activeTab === 'maps' ? 1 : 0.6, whiteSpace: 'nowrap' }}
                                >
                                    <MapIcon />
                                    Maps ({(isCreatorMode ? stage().getConfiguration().maps : stage().getSave().maps)?.filter(map => map.active !== false).length || 0})
                                </Button>
                                <Button
                                    onClick={() => setActiveTab('items')}
                                    variant={activeTab === 'items' ? 'primary' : 'secondary'}
                                    style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', gap: '8px', opacity: activeTab === 'items' ? 1 : 0.6, whiteSpace: 'nowrap' }}
                                >
                                    <Inventory2 />
                                    Items ({(isCreatorMode ? stage().getConfiguration().items : items).filter(item => item.active !== false).length})
                                </Button>
                                {eventsEnabled && (
                                <Button
                                    onClick={() => setActiveTab('calendarEvents')}
                                    variant={activeTab === 'calendarEvents' ? 'primary' : 'secondary'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flex: '0 0 auto',
                                        gap: '8px',
                                        opacity: activeTab === 'calendarEvents' ? 1 : 0.6,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <CalendarMonth />
                                    Events ({stage().getManagedCalendarEvents(isCreatorMode).length})
                                </Button>
                                )}
                            </div>

                            {/* Content Area */}
                            {isBusy ? <div role="status">{applyStatus === 'applying' ? 'Applying draft...' : 'Publishing draft...'}</div> : <div style={{
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
                                    <LorebookManagementPanel key={isCreatorMode ? 'create' : 'manage'} stage={stage} isCreatorMode={isCreatorMode} />
                                )}

                                {/* Calendar Events Tab */}
                                {eventsEnabled && activeTab === 'calendarEvents' && (
                                    <CalendarEventManagementPanel key={isCreatorMode ? 'create' : 'manage'} stage={stage} isCreatorMode={isCreatorMode} />
                                )}

                                {/* Actors Tab */}
                                {activeTab === 'actors' && (
                                    <ActorManagementPanel key={isCreatorMode ? 'create' : 'manage'} stage={stage} isCreatorMode={isCreatorMode} />
                                )}

                                {/* Locations Tab */}
                                {activeTab === 'locations' && (
                                    <LocationManagementPanel key={isCreatorMode ? 'create' : 'manage'} stage={stage} isCreatorMode={isCreatorMode} />
                                )}

                                {/* Items Tab */}
                                {activeTab === 'items' && (
                                    <ItemManagementPanel key={isCreatorMode ? 'create' : 'manage'} stage={stage} isCreatorMode={isCreatorMode} />
                                )}

                                {/* Maps Tab */}
                                {activeTab === 'maps' && (
                                    <MapManagementPanel key={isCreatorMode ? 'create' : 'manage'} stage={stage} isCreatorMode={isCreatorMode} />
                                )}

                                {/* Stats Tab */}
                                {activeTab === 'stats' && (
                                    <StatManagementPanel key={isCreatorMode ? 'create' : 'manage'} stage={stage} isCreatorMode={isCreatorMode} />
                                )}

                                {isCreatorMode && activeTab === 'rules' && (
                                    <RulesManagementPanel stage={stage} />
                                )}

                                {/* Controls Tab */}
                                {isCreatorMode && activeTab === 'functions' && (
                                    <FunctionManagementPanel stage={stage} />
                                )}
                                {activeTab === 'controls' && (
                                    <ControlManagementPanel stage={stage} />
                                )}
                            </div>}
                        </GlassPanel>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </>
    );
};
