import { FC, useState } from 'react';
import { Box } from '@mui/material';
import { Stage } from '../Stage';
import { ControlRenderer } from './ControlRenderer';

interface ControlDockProps {
    stage: () => Stage;
}

// Renders every available 'bottom' placement Control (buttons, stat displays, stat editors) in a row below
// the main map content. Renders nothing when there are no available bottom controls.
export const ControlDock: FC<ControlDockProps> = ({ stage }) => {
    // Bumped after a control fires/edits a stat, forcing this dock to re-render with the resulting state.
    const [revision, setRevision] = useState(0);
    const stageInstance = stage();
    const bottomControls = stageInstance.getVisibleControls('bottom');

    if (bottomControls.length === 0) {
        return null;
    }

    return (
        <Box
            sx={{
                flexShrink: 0,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'stretch',
                gap: 1,
            }}
        >
            {bottomControls.map((control) => (
                <ControlRenderer
                    key={`bottom-control-${control.id}`}
                    control={control}
                    stage={stage}
                    onActivate={() => setRevision((current) => current + 1)}
                />
            ))}
        </Box>
    );
};
