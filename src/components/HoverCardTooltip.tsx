import { cloneElement, createContext, FC, MouseEvent, MouseEventHandler, ReactElement, ReactNode, useContext, useId, useMemo, useState } from 'react';
import { Tooltip } from '@mui/material';

interface HoverCardState {
    path: string[];
    pending: string[];
}

interface HoverCardContextValue {
    state: HoverCardState;
    open: (path: string[]) => void;
    close: (id: string) => void;
    enter: (id: string) => void;
}

const HoverCardContext = createContext<HoverCardContextValue | undefined>(undefined);
const HoverCardPathContext = createContext<string[]>([]);

export const HoverCardProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<HoverCardState>({ path: [], pending: [] });
    const value: HoverCardContextValue = {
        state,
        open: path => setState(current => ({
            path,
            pending: current.pending.filter(id => path.includes(id) && id !== path[path.length - 1]),
        })),
        close: id => setState(current => {
            const index = current.path.indexOf(id);
            if (index < 0) return current;
            if (index < current.path.length - 1) {
                return { ...current, pending: [...new Set([...current.pending, id])] };
            }
            const pendingIndex = current.path.findIndex(ancestor => current.pending.includes(ancestor));
            const path = current.path.slice(0, pendingIndex < 0 ? index : pendingIndex);
            return { path, pending: current.pending.filter(ancestor => path.includes(ancestor)) };
        }),
        enter: id => setState(current => current.pending.includes(id)
            ? { ...current, pending: current.pending.filter(pending => pending !== id) }
            : current),
    };
    return <HoverCardContext.Provider value={value}>{children}</HoverCardContext.Provider>;
};

interface HoverCardTooltipProps {
    children: ReactElement<{ onMouseEnter?: MouseEventHandler }>;
    title: ReactNode;
    describeChild?: boolean;
}

export const HoverCardTooltip: FC<HoverCardTooltipProps> = ({ children, title, describeChild }) => {
    const context = useContext(HoverCardContext);
    const parentPath = useContext(HoverCardPathContext);
    const id = useId();
    const path = useMemo(() => [...parentPath, id], [parentPath, id]);

    return (
        <Tooltip
            title={<HoverCardPathContext.Provider value={path}>
                <div onMouseEnter={() => context?.enter(id)}>{title}</div>
            </HoverCardPathContext.Provider>}
            describeChild={describeChild}
            placement="bottom"
            enterDelay={0}
            enterTouchDelay={0}
            leaveDelay={2000}
            open={context ? context.state.path.includes(id) : undefined}
            onOpen={() => context?.open(path)}
            onClose={() => context?.close(id)}
            slotProps={{ tooltip: { sx: { backgroundColor: 'transparent', padding: 0, maxWidth: 'none' } } }}
        >
            {cloneElement(children, {
                onMouseEnter: (event: MouseEvent) => {
                    children.props.onMouseEnter?.(event);
                    if (context?.state.path.includes(id)) context.open(path);
                },
            })}
        </Tooltip>
    );
};
