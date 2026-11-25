import { FC, ReactNode, useState } from 'react';
import { Box } from '@mui/material';
import { Stage } from '../Stage';
import { ControlRenderer } from './ControlRenderer';
import { Skit } from '../content/Skit';
import { BarOrientation, controlReference } from '../content/Control';
import { ListCardDetail } from './ContentCardControl';

interface ControlDockProps {
    stage: () => Stage;
    isVerticalLayout?: boolean;
    orientation?: BarOrientation;
    onActivate?: (skit?: Skit | null) => void;
    firstRowEnd?: ReactNode;
}

export const ControlDock: FC<ControlDockProps> = ({ stage, onActivate, isVerticalLayout = false, orientation = 'bottom', firstRowEnd }) => {
    const [, setRevision] = useState(0);
    const stageInstance = stage();
    const bars = stageInstance.getVisibleBars(orientation)
        .map(bar => ({ bar, controls: stageInstance.getBarControls(bar) }))
        .filter(({ controls }) => controls.length > 0);
    if (bars.length === 0) {
        return <>{firstRowEnd}</>;
    }

    return (
        <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: isVerticalLayout ? 0.5 : 1 }}>
            {bars.map(({ bar, controls }, barIndex) => {
                const content = stageInstance.getBarContent(bar);
                const barRow = (
                    <Box key={bar.id} data-bar-control={bar.id}
                        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: isVerticalLayout ? 0.5 : 1,
                            ...(barIndex === 0 && firstRowEnd ? { flex: '1 1 0', minWidth: 0 } : {}) }}>
                        {controls.map((control, index) => {
                            if (content && (control.type === 'dragDropDisplay' || (control.type === 'statDisplay' && control.contentType !== undefined))) {
                                const detail = stageInstance.resolveListCardDetail(controlReference(control.id), content.kind, content.id, '');
                                return detail ? <ListCardDetail key={`${control.id}-${index}`} detail={detail} stage={stageInstance}
                                    isVerticalLayout={isVerticalLayout} kind={content.kind} id={content.id}
                                    onChange={() => { setRevision(current => current + 1); onActivate?.(); }} /> : null;
                            }
                            return (
                                <ControlRenderer
                                    key={`${control.id}-${index}`}
                                    control={control}
                                    stage={stage}
                                    isVerticalLayout={isVerticalLayout}
                                    onActivate={skit => {
                                        setRevision(current => current + 1);
                                        onActivate?.(skit);
                                    }}
                                />
                            );
                        })}
                    </Box>
                );
                return barIndex === 0 && firstRowEnd ? (
                    <Box key={bar.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: isVerticalLayout ? 0.5 : 1 }}>
                        {barRow}
                        {firstRowEnd}
                    </Box>
                ) : barRow;
            })}
        </Box>
    );
};
