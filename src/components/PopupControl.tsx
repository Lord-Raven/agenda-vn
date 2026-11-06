import { FC } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@mui/material';
import { Stage } from '../Stage';
import { isMapAvailable } from '../content/Map';
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
    if (!control) {
        return null;
    }

    const save = stageInstance.getSave();
    const selectedMap = (save.maps || []).find(map => map.id === control.mapId);
    const context = stageInstance.getScheduleContext(save);
    const maps = (save.maps || []).filter(map => map.id === control.mapId || isMapAvailable(map, context));

    return (
        <Dialog
            open
            disableEscapeKeyDown
            maxWidth="lg"
            fullWidth
            aria-labelledby={`popup-control-${control.id}`}
            onKeyDown={(event) => event.stopPropagation()}
            PaperProps={{ sx: { height: 'min(80dvh, 900px)', background: 'var(--agenda-surface-base)', color: 'var(--agenda-text-primary)' } }}
        >
            <DialogTitle id={`popup-control-${control.id}`}>{control.name || 'Pop-up'}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, p: { xs: 1, md: 2 } }}>
                {selectedMap ? (
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
        </Dialog>
    );
};
