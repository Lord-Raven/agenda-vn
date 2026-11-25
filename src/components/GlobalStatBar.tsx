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
    <ControlDock orientation="top" stage={stage} isVerticalLayout={isVerticalLayout} onActivate={onActivate}
        firstRowEnd={buttons && <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0, maxWidth: '100%', gap: 0.75 }}>{buttons}</Box>} />
);
