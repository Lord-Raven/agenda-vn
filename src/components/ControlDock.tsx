import { FC, useState } from 'react';
import { Box } from '@mui/material';
import { Stage } from '../Stage';
import { ControlRenderer } from './ControlRenderer';
import { Skit } from '../content/Skit';
import { BarOrientation } from '../content/Control';

interface ControlDockProps {
    stage: () => Stage;
    isVerticalLayout?: boolean;
    orientation?: BarOrientation;
    onActivate?: (skit?: Skit | null) => void;
}

export const ControlDock: FC<ControlDockProps> = ({ stage, onActivate, isVerticalLayout = false, orientation = 'bottom' }) => {
    const [, setRevision] = useState(0);
    const stageInstance = stage();
    const bars = stageInstance.getVisibleBars(orientation);
    if (bars.length === 0) {
        return null;
    }

    return (
        <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: isVerticalLayout ? 0.5 : 1 }}>
            {bars.map(bar => {
                const controls = stageInstance.getBarControls(bar);
                if (!controls.length) return null;
                return (
                    <Box key={bar.id} data-bar-control={bar.id}
                        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: isVerticalLayout ? 0.5 : 1 }}>
                        {controls.map((control, index) => (
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
                        ))}
                    </Box>
                );
            })}
        </Box>
    );
};
