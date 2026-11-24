import { FC, ReactNode } from 'react';
import { Box } from '@mui/material';
import { Stage } from '../Stage';
import { Skit } from '../content/Skit';
import { ControlDock } from './ControlDock';

interface GlobalStatBarProps {
    stage: () => Stage;
    isVerticalLayout?: boolean;
    buttons?: ReactNode;
    onActivate?: (skit?: Skit | null) => void;
}

export const GlobalStatBar: FC<GlobalStatBarProps> = ({ stage, buttons, onActivate, isVerticalLayout = false }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: isVerticalLayout ? 0.5 : 1 }}>
        {buttons && <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 0.75 }}>{buttons}</Box>}
        <ControlDock orientation="top" stage={stage} isVerticalLayout={isVerticalLayout} onActivate={onActivate} />
    </Box>
);
