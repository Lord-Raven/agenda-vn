import React, { FC } from 'react';
import { motion } from 'framer-motion';
import { Stage } from '../Stage';
import { Save, FolderOpen, Close, Delete, SystemUpdateAlt } from '@mui/icons-material';
import { ScreenType } from './BaseScreen';
import { useTooltip } from '../components/TooltipContext';
import { getEmotionImage } from '../content/Actor';
import { Button, Title } from '../components/UiComponents';

interface SaveLoadScreenProps {
    stage: () => Stage;
    mode: 'save' | 'load';
    onClose: () => void;
    setScreenType?: (type: ScreenType) => void;
    onUpdateStateChange?: (updating: boolean) => void;
}

export const SaveLoadScreen: FC<SaveLoadScreenProps> = ({ stage, mode, onClose, setScreenType, onUpdateStateChange }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [hoveredSlot, setHoveredSlot] = React.useState<number | null>(null);
    const [deleteConfirmSlot, setDeleteConfirmSlot] = React.useState<number | null>(null);
    const [isUpdating, setIsUpdating] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [refreshFailed, setRefreshFailed] = React.useState(false);
    const [updateError, setUpdateError] = React.useState<string | null>(null);
    const updateInProgress = React.useRef(false);
    const stageInstance = stage();
    const hasOpenSlot = Array.from({ length: stageInstance.SAVE_SLOT_COUNT }, (_, index) => index)
        .some(index => !stageInstance.saveData.saves[index]);

    React.useEffect(() => {
        if (stageInstance.isOwner) return;
        let mounted = true;
        setIsRefreshing(true);
        stageInstance.readStageConfiguration().catch(error => {
            console.error('Failed to check for save updates', error);
            if (mounted) {
                setRefreshFailed(true);
                setUpdateError('Could not check for updates. Reopen this screen to retry.');
            }
        }).finally(() => {
            if (mounted) setIsRefreshing(false);
        });
        return () => { mounted = false; };
    }, [stageInstance]);

    const handleCloneAndUpdate = async (slotIndex: number) => {
        if (updateInProgress.current) return;
        updateInProgress.current = true;
        setIsUpdating(true);
        onUpdateStateChange?.(true);
        setUpdateError(null);
        try {
            const targetSlot = await stageInstance.cloneAndUpdateSave(slotIndex);
            setTooltip(`Updated copy saved to slot ${targetSlot + 1}. Original save kept.`, SystemUpdateAlt, 4000);
            onClose();
            setScreenType?.(stageInstance.areEventsEnabled() ? ScreenType.CALENDAR : ScreenType.MAP);
        } catch (error) {
            console.error('Failed to clone and update save', error);
            setUpdateError(error instanceof Error ? error.message : 'Failed to clone and update save.');
        } finally {
            updateInProgress.current = false;
            setIsUpdating(false);
            onUpdateStateChange?.(false);
        }
    };

    const handleSlotClick = (slotIndex: number) => {
        if (isUpdating || isRefreshing) return;
        if (mode === 'save') {
            // Save to this slot
            stage().saveToSlot(slotIndex);
            setTooltip('Game saved!', Save, 2000);
            onClose();
        } else {
            // Load from this slot
            stage().loadSave(slotIndex);
            setTooltip('Game loaded!', FolderOpen, 2000);
            onClose();
            // Navigate to main game screen
            if (setScreenType) {
                setScreenType(stage().areEventsEnabled() ? ScreenType.CALENDAR : ScreenType.MAP);
            }
        }
    };

    const handleDelete = (slotIndex: number) => {
        stage().deleteSave(slotIndex);
        setDeleteConfirmSlot(null);
        setTooltip('Save deleted', Delete, 2000);
    };

    const formatTimestamp = (timestamp?: number): string => {
        if (!timestamp) return 'No Date';
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const renderSaveSlot = (slotIndex: number) => {

        const save = stage().saveData.saves[slotIndex];
        const isEmpty = !save;
        const isCurrentSlot = stage().saveData.lastSaveSlot === slotIndex;

        // Get non-warden, non-player actors:
        let actors = !isEmpty
            ? Object.values(save.actors).filter(actor => actor.id !== save.playerId && actor.name.toLowerCase() !== 'cassiel')
            : [];
        // Sort actors by most recent appearance in a skit (initial only).
        const timelineWithSkit = (save?.timeline || []).filter(entry => entry.skit);
        actors = actors
            .map(actor => {
                const reverseIndex = [...timelineWithSkit]
                    .reverse()
                    .findIndex(entry => entry?.skit?.initialActors.includes(actor.id));
                const lastAppearance = reverseIndex >= 0
                    ? timelineWithSkit.length - reverseIndex
                    : 0;
                return { ...actor, lastAppearance };
            })
            .filter(a => a.lastAppearance > 0)
            .sort((a, b) => b.lastAppearance - a.lastAppearance);

        // Trim actors to max of 5 for display:
        actors = actors.slice(0, 5);

        return (
            <motion.div
                key={slotIndex}
                initial={{ opacity: 0, x: -20 }}
                animate={{ 
                    opacity: 1, 
                    x: hoveredSlot === slotIndex ? 5 : 0 
                }}
                transition={{ 
                    delay: slotIndex * 0.05,
                    x: { duration: 0.2 }
                }}
                style={{ width: '100%' }}
            >
                <Button
                    variant="menu"
                    onMouseEnter={() => {
                        setHoveredSlot(slotIndex);
                        setTooltip(
                            mode === 'save' 
                                ? `Save game to slot ${slotIndex + 1}` 
                                : isEmpty 
                                    ? 'Empty slot' 
                                    : `Load game from slot ${slotIndex + 1}`,
                            mode === 'save' ? Save : FolderOpen
                        );
                    }}
                    onMouseLeave={() => {
                        setHoveredSlot(null);
                        clearTooltip();
                    }}
                    onClick={() => handleSlotClick(slotIndex)}
                    disabled={isUpdating || isRefreshing || (mode === 'load' && isEmpty)}
                    style={{
                        width: '100%',
                        height: '85px',
                        padding: '8px 12px',
                        paddingRight: isEmpty ? '12px' : '50px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        justifyContent: 'center',
                        background: isCurrentSlot 
                            ? 'color-mix(in srgb, var(--agenda-highlight) 15%, transparent)' 
                            : hoveredSlot === slotIndex && !(mode === 'load' && isEmpty)
                                ? 'color-mix(in srgb, var(--agenda-highlight) 10%, transparent)' 
                                : 'color-mix(in srgb, var(--agenda-surface-base) 50%, transparent)',
                        border: isCurrentSlot ? '2px solid color-mix(in srgb, var(--agenda-highlight) 50%, transparent)' : undefined,
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    {/* Delete button for filled slots */}
                    {!isEmpty && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmSlot(slotIndex);
                            }}
                            onMouseEnter={(e) => {
                                e.stopPropagation();
                                setTooltip(isCurrentSlot ? 'Cannot delete current save' : 'Delete save', Delete);
                            }}
                            onMouseLeave={(e) => {
                                e.stopPropagation();
                                clearTooltip();
                            }}
                            disabled={isCurrentSlot || isUpdating || isRefreshing}
                            style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                width: '40px',
                                background: isCurrentSlot
                                    ? 'color-mix(in srgb, var(--agenda-text-primary) 20%, transparent)'
                                    : 'color-mix(in srgb, var(--agenda-danger-text) 24%, transparent)',
                                border: 'none',
                                borderLeft: isCurrentSlot
                                    ? '1px solid color-mix(in srgb, var(--agenda-text-primary) 34%, transparent)'
                                    : '1px solid color-mix(in srgb, var(--agenda-danger-text) 44%, transparent)',
                                borderRadius: '0 4px 4px 0',
                                color: isCurrentSlot
                                    ? 'color-mix(in srgb, var(--agenda-text-primary) 48%, transparent)'
                                    : 'var(--agenda-danger-text)',
                                cursor: isCurrentSlot ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                fontSize: '18px',
                                opacity: isCurrentSlot ? 0.5 : 1
                            }}
                            onMouseOver={(e) => {
                                if (!isCurrentSlot) {
                                    e.currentTarget.style.background = 'color-mix(in srgb, var(--agenda-danger-text) 34%, transparent)';
                                    e.currentTarget.style.color = 'color-mix(in srgb, var(--agenda-danger-text) 80%, var(--agenda-text-primary))';
                                }
                            }}
                            onMouseOut={(e) => {
                                if (!isCurrentSlot) {
                                    e.currentTarget.style.background = 'color-mix(in srgb, var(--agenda-danger-text) 24%, transparent)';
                                    e.currentTarget.style.color = 'var(--agenda-danger-text)';
                                }
                            }}
                        >
                            <Delete fontSize="small" />
                        </button>
                    )}

                    {isEmpty ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                            fontSize: '14px',
                            fontStyle: 'italic'
                        }}>
                            Empty Slot
                        </div>
                    ) : (
                        <>
                            {/* Actor portraits as background */}
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                right: '40px',
                                display: 'flex',
                                height: '85px',
                                opacity: 0.3,
                                pointerEvents: 'none'
                            }}>
                                {actors.slice(0, 10).map((actor) => (
                                    <div
                                        key={actor.id}
                                        style={{
                                            width: '85px',
                                            height: '85px',
                                            overflow: 'hidden'
                                        }}
                                        title={actor.name}
                                    >
                                        <img
                                            src={getEmotionImage(actor, 'neutral')}
                                            alt={actor.name}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                objectPosition: 'top center'
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Single column layout */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: '4px',
                                position: 'relative',
                                zIndex: 1
                            }}>
                                <div style={{
                                    fontSize: '12px',
                                    color: 'color-mix(in srgb, var(--agenda-highlight) 70%, transparent)'
                                }}>
                                    {formatTimestamp(save.timestamp)}
                                </div>
                                <div style={{
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    color: 'var(--agenda-highlight)'
                                }}>
                                    {save.actors[save.playerId].name} - {save.currentDate || 'Unknown'}
                                </div>
                            </div>
                        </>
                    )}
                </Button>
                {stageInstance.canUpdateSave(slotIndex) && (
                    <Button
                        variant="menu"
                        onClick={() => void handleCloneAndUpdate(slotIndex)}
                        disabled={!hasOpenSlot || isUpdating || isRefreshing || refreshFailed}
                        onMouseEnter={() => setTooltip(
                            hasOpenSlot
                                ? `Copy to an empty slot and apply ${stageInstance.isOwner ? 'the creator draft' : 'published configuration'} and content. The original save is kept.`
                                : 'Free a save slot to clone and update. The original will not be overwritten.',
                            SystemUpdateAlt,
                        )}
                        onMouseLeave={clearTooltip}
                        style={{ marginTop: '6px', padding: '6px 12px' }}
                    >
                        <SystemUpdateAlt fontSize="small" />
                        {' '}Clone and Update{!hasOpenSlot ? ' (empty slot required)' : ''}
                    </Button>
                )}
            </motion.div>
        );
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'color-mix(in srgb, var(--agenda-surface-base) 58%, #000)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    if (!isUpdating) onClose();
                }
            }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="glass-panel-bright"
                style={{
                    padding: '30px',
                    maxWidth: '800px',
                    width: '90%',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative'
                }}
            >
                {/* Header with close button */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px'
                }}>
                    <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>
                        {mode === 'save' ? 'Save Game' : 'Load Game'}
                    </Title>
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={onClose}
                        disabled={isUpdating}
                        onMouseEnter={() => setTooltip('Close', Close)}
                        onMouseLeave={() => clearTooltip()}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'color-mix(in srgb, var(--agenda-highlight) 70%, transparent)',
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

                {/* Auto-save note for save mode */}
                {mode === 'save' && (
                    <div style={{
                        fontSize: '12px',
                        color: 'color-mix(in srgb, var(--agenda-highlight) 60%, transparent)',
                        fontStyle: 'italic',
                        marginBottom: '15px',
                        textAlign: 'left'
                    }}>
                        The game will continue to auto-save to your selected slot.
                    </div>
                )}

                {updateError && <div role="alert" style={{ color: 'var(--agenda-danger-text)', marginBottom: '12px' }}>{updateError}</div>}
                {isUpdating && <div role="status">Cloning and applying update...</div>}

                {/* Save slots container */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    overflowY: 'auto',
                    paddingRight: '10px'
                }}>
                    {Array.from({ length: 10 }, (_, i) => renderSaveSlot(i))}
                </div>
            </motion.div>

            {/* Delete confirmation modal */}
            {deleteConfirmSlot !== null && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'color-mix(in srgb, var(--agenda-surface-base) 48%, #000)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1001
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setDeleteConfirmSlot(null);
                        }
                    }}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="glass-panel-bright"
                        style={{
                            padding: '30px',
                            maxWidth: '400px',
                            width: '90%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '20px'
                        }}
                    >
                        <Title variant="glow" style={{ textAlign: 'center', fontSize: '20px' }}>
                            Delete Save?
                        </Title>
                        <div style={{
                            color: 'color-mix(in srgb, var(--agenda-highlight) 80%, transparent)',
                            textAlign: 'center',
                            fontSize: '14px'
                        }}>
                            Are you sure you want to delete this save? This action cannot be undone.
                        </div>
                        <div style={{
                            display: 'flex',
                            gap: '10px',
                            justifyContent: 'center'
                        }}>
                            <Button
                                variant="menu"
                                onClick={() => setDeleteConfirmSlot(null)}
                                onMouseEnter={() => setTooltip('Cancel', Close)}
                                onMouseLeave={() => clearTooltip()}
                                style={{
                                    padding: '10px 20px',
                                    background: 'color-mix(in srgb, var(--agenda-highlight) 10%, transparent)'
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="menu"
                                onClick={() => handleDelete(deleteConfirmSlot)}
                                onMouseEnter={() => setTooltip('Confirm deletion', Delete)}
                                onMouseLeave={() => clearTooltip()}
                                style={{
                                    padding: '10px 20px',
                                    background: 'color-mix(in srgb, var(--agenda-danger-text) 24%, transparent)',
                                    border: '2px solid color-mix(in srgb, var(--agenda-danger-text) 44%, transparent)',
                                    color: 'color-mix(in srgb, var(--agenda-danger-text) 80%, var(--agenda-text-primary))'
                                }}
                            >
                                Delete
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
};
