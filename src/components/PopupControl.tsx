import { FC } from 'react';
import { Box, DialogContent, DialogTitle, Paper, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { ResolvedPopupCardDetail, Stage } from '../Stage';
import { Control } from '../content/Control';
import { isMapAvailable } from '../content/Map';
import { formatStatOptionValueText, resolveReferenceKind } from '../content/Stat';
import { ContentCardList, ContentCardPage } from './ContentCardList';
import { ContentListPortraits } from './ContentListControl';
import { Skit } from '../content/Skit';
import { ScreenType } from '../screens/BaseScreen';
import { DefinedMapView } from '../screens/DefinedMapView';

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
    const selectedMap = (save.maps || []).find(map => map.id === control?.mapId);
    const context = stageInstance.getScheduleContext(save);
    const maps = control ? (save.maps || []).filter(map => map.id === control.mapId || isMapAvailable(map, context)) : [];

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
                            background: 'var(--agenda-surface-base)', color: 'var(--agenda-text-primary)',
                        }}
                    >
                        <AnimatePresence initial={false} mode="wait">
                            <motion.div
                                key={JSON.stringify([control.id, control.popupDisplay, control.mapId])}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                            >
                                <DialogTitle id={`popup-control-${control.id}`}>{control.name || 'Pop-up'}</DialogTitle>
                                <DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, p: { xs: 1, md: 2 } }}>
                                    {control.popupDisplay === 'list' ? (
                                        <PopupContentList stage={stage} control={control} isVerticalLayout={isVerticalLayout} onAction={onAction} />
                                    ) : selectedMap ? (
                                        <DefinedMapView
                                            key={`${control.id}-${control.mapId}`}
                                            stage={stage}
                                            maps={maps}
                                            initialMapId={selectedMap.id}
                                            embedded
                                            onAction={onAction}
                                            setScreenType={setScreenType}
                                            isVerticalLayout={isVerticalLayout}
                                        />
                                    ) : (
                                        <div role="alert">
                                            {control.mapId ? `Pop-up map "${control.mapId}" is missing. Select an existing map in Controls.` : 'No map selected for this pop-up. Select a map in Controls.'}
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

interface PopupContentListProps {
    stage: () => Stage;
    control: Control;
    isVerticalLayout: boolean;
    onAction: (skit?: Skit | null) => void;
}

export const buildPopupContentPages = (stageInstance: Stage, control: Control, onAction: (skit?: Skit | null) => void, isVerticalLayout = false): ContentCardPage[] =>
    stageInstance.resolvePopupSections(control).map(page => ({
        key: page.key,
        title: page.header,
        cards: page.ids.map(id => {
            const details = (page.section.details || [])
                .map(detail => stageInstance.resolvePopupCardDetail(detail, page.kind, id, page.header))
                .filter((detail): detail is ResolvedPopupCardDetail => !!detail);
            return {
                key: id,
                kind: page.kind,
                id,
                // Only sections with click actions produce clickable cards.
                onClick: page.section.actions.length ? () => onAction(stageInstance.runPopupCardActions(page.section, page.kind, id, page.header)) : undefined,
                trailing: details.length ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 0.75 }}>
                        {details.map(detail => <PopupCardDetail key={detail.key} detail={detail} stage={stageInstance} isVerticalLayout={isVerticalLayout} />)}
                    </Box>
                ) : undefined,
            };
        }),
    }));

const PopupContentList: FC<PopupContentListProps> = ({ stage, control, isVerticalLayout, onAction }) => (
    <ContentCardList
        stage={stage}
        pages={buildPopupContentPages(stage(), control, onAction, isVerticalLayout)}
        isVerticalLayout={isVerticalLayout}
        emptyTitle={control.name || 'Pop-up'}
        emptyMessage={control.popupSections.length ? 'Nothing to show right now.' : 'No headers configured for this pop-up. Add headers in Controls.'}
    />
);

const formatDetailText = (detail: ResolvedPopupCardDetail): string => {
    if (detail.stat && (detail.type === 'option' || detail.type === 'optionList')) {
        return formatStatOptionValueText(detail.stat, detail.value) ?? '';
    }
    if (detail.type === 'checkbox') {
        return detail.value ? 'Yes' : 'No';
    }
    return Array.isArray(detail.value) ? detail.value.join(', ') : String(detail.value ?? '');
};

// Compact labelled chip for a card's right end; content references render as overlapping portraits.
export const PopupCardDetail: FC<{ detail: ResolvedPopupCardDetail; stage: Stage; isVerticalLayout: boolean }> = ({ detail, stage, isVerticalLayout }) => {
    const isReference = ['actor', 'actorList', 'item', 'itemList', 'location', 'locationList', 'contentList'].includes(detail.type);
    if (isReference) {
        const values = (Array.isArray(detail.value) ? detail.value : [detail.value]).map(String).filter(Boolean);
        return values.length ? (
            <Box data-popup-card-detail={detail.key} title={detail.label} sx={{ display: 'flex' }}>
                <ContentListPortraits kind={resolveReferenceKind(detail.type)} values={values} stage={stage} label={detail.label} variant="overlay" size={isVerticalLayout ? 30 : 36} />
            </Box>
        ) : null;
    }
    return (
        <Box
            data-popup-card-detail={detail.key}
            sx={{
                display: 'flex', alignItems: 'baseline', gap: 0.5, px: 1, py: 0.4, borderRadius: '999px',
                border: '1px solid var(--agenda-line-subtle)',
                background: 'color-mix(in srgb, var(--agenda-surface-base) 70%, transparent)',
                maxWidth: 220, minWidth: 0,
            }}
        >
            <Typography component="span" sx={{ color: 'var(--agenda-text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{detail.label}</Typography>
            <Typography component="span" sx={{ color: 'var(--agenda-text-primary)', fontSize: '0.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {formatDetailText(detail)}
            </Typography>
        </Box>
    );
};
