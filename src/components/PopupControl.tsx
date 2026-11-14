import { FC } from 'react';
import { Box, DialogContent, Paper, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { Stage } from '../Stage';
import { Control, controlReferenceId, isControlAvailable } from '../content/Control';
import { ConditionContext } from '../content/Condition';
import { isScreenAvailable, isSectionScreenType } from '../content/Screen';
import { Skit } from '../content/Skit';
import { ScreenType } from '../screens/BaseScreen';
import { ControlRenderer } from './ControlRenderer';
import { DefinedMapView } from '../screens/DefinedMapView';
import { ListScreenView } from '../screens/ListScreenView';

interface PopupControlProps {
    stage: () => Stage;
    isVerticalLayout: boolean;
    setScreenType: (type: ScreenType) => void;
    onAction: (skit?: Skit | null) => void;
}

export const PopupControl: FC<PopupControlProps> = ({ stage, isVerticalLayout, setScreenType, onAction }) => {
    const stageInstance = stage();
    const control = stageInstance.getVisibleControls('popup')[0];
    const save = stageInstance.getSave();
    const selectedScreen = (save.screens || []).find(screen => screen.id === control?.screenId && screen.active !== false);
    const context = stageInstance.getScheduleContext(save);
    const maps = control ? (save.screens || []).filter(screen => screen.type === 'map' && screen.active !== false && (screen.id === control.screenId || isScreenAvailable(screen, context))) : [];
    // Resolve the title bar controls in selection order; each control's availability conditions apply.
    const controlContext: ConditionContext = { ...context, skitState: stageInstance.getSkitConditionState() };
    const configuredControls = stageInstance.getConfiguration(save).controls || [];
    const titleBarControls = (control?.titleBarControls || [])
        .map(reference => configuredControls.find(candidate => candidate.id === controlReferenceId(reference)))
        .filter((candidate): candidate is Control => Boolean(candidate) && isControlAvailable(candidate!, controlContext));

    return (
        <AnimatePresence>
            {control && (
                <Box
                    component={motion.div}
                    key="popup-shell"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    data-popup-control-overlay
                    onKeyDown={(event) => event.stopPropagation()}
                    sx={{
                        position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'auto',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0, 0, 0, 0.5)', p: { xs: 1, md: 3 },
                        boxSizing: 'border-box', overflow: 'hidden',
                    }}
                >
                    <Paper
                        component={motion.div}
                        initial={{ y: 16, scale: 0.98 }}
                        animate={{ y: 0, scale: 1 }}
                        exit={{ y: 16, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        role="dialog"
                        aria-modal={false}
                        aria-labelledby={`popup-control-${control.id}`}
                        sx={{
                            display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 1200,
                            height: '100%', maxHeight: 900, minHeight: 0, overflow: 'hidden',
                            borderRadius: '12px',
                            background: 'var(--agenda-surface-base)', color: 'var(--agenda-text-primary)',
                        }}
                    >
                        <AnimatePresence initial={false} mode="wait">
                            <motion.div
                                key={JSON.stringify([control.id, selectedScreen?.type, control.screenId])}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, px: 2, py: 0.75, flexShrink: 0 }}>
                                    <Typography
                                        id={`popup-control-${control.id}`}
                                        component="h2"
                                        variant="h6"
                                        sx={{ flex: '1 1 auto', minWidth: 0, lineHeight: 1.3, overflowWrap: 'anywhere' }}
                                    >
                                        {control.name || 'Pop-up'}
                                    </Typography>
                                    {titleBarControls.length > 0 && (
                                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, flex: '0 1 auto', minWidth: 0 }}>
                                            {titleBarControls.map(titleBarControl => (
                                                <ControlRenderer
                                                    key={titleBarControl.id}
                                                    control={titleBarControl}
                                                    stage={stage}
                                                    isVerticalLayout
                                                    onActivate={onAction}
                                                />
                                            ))}
                                        </Box>
                                    )}
                                </Box>
                                <DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, p: { xs: 1, md: 2 } }}>
                                    {selectedScreen && isSectionScreenType(selectedScreen.type) ? (
                                        <ListScreenView stage={stage} screen={selectedScreen} isVerticalLayout={isVerticalLayout} onAction={onAction} />
                                    ) : selectedScreen ? (
                                        <DefinedMapView
                                            key={`${control.id}-${control.screenId}`}
                                            stage={stage}
                                            maps={maps}
                                            initialMapId={selectedScreen.id}
                                            embedded
                                            onAction={onAction}
                                            setScreenType={setScreenType}
                                            isVerticalLayout={isVerticalLayout}
                                        />
                                    ) : (
                                        <div role="alert">
                                            {control.screenId ? `Pop-up Screen "${control.screenId}" is missing or inactive. Select an existing Screen in Controls.` : 'No Screen selected for this pop-up. Select a Screen in Controls.'}
                                        </div>
                                    )}
                                </DialogContent>
                            </motion.div>
                        </AnimatePresence>
                    </Paper>
                </Box>
            )}
        </AnimatePresence>
    );
};
