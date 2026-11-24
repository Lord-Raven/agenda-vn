import { FC, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Stage } from '../Stage';
import { ContentDisplayContext } from '../content/Control';
import { ContentType } from '../content/Condition';
import { CardActionContext } from './ContentCardControl';

type DragSession = {
    stage: Stage;
    element: HTMLDivElement;
    kind: ContentType;
    finish: (target?: ContentDisplayContext, targetElement?: HTMLDivElement) => void;
    cancel: () => void;
};

let activeDrag: DragSession | undefined;

type Receiver = {
    current: () => { stage: Stage; context: ContentDisplayContext };
    highlight: (value: boolean) => void;
};
const receivers = new Set<Receiver>();

export const DragDropDisplay: FC<{
    stage: Stage;
    context: ContentDisplayContext;
    accepts?: ContentType;
    onChange?: () => void;
    children: ReactNode;
}> = ({ stage, context, accepts, onChange, children }) => {
    const onAction = useContext(CardActionContext);
    const [highlighted, setHighlighted] = useState(false);
    const cancelRef = useRef<(() => void) | undefined>();
    const current = useRef({ stage, context });
    current.current = { stage, context };
    const receiver = useRef<Receiver>({ current: () => current.current, highlight: setHighlighted });
    useEffect(() => {
        const registration = receiver.current;
        receivers.add(registration);
        return () => {
            receivers.delete(registration);
            cancelRef.current?.();
        };
    }, []);

    return <div data-drag-drop-display={context.control.id} data-drop-highlighted={highlighted || undefined}
        style={{ minWidth: 32, minHeight: 32, borderRadius: 8,
            outline: highlighted ? '2px solid var(--agenda-highlight)' : undefined,
            background: highlighted ? 'color-mix(in srgb, var(--agenda-highlight) 15%, transparent)' : undefined }}
        onClick={event => event.stopPropagation()}
        onDragStart={event => {
            if (!context.control.onDragFunction) {
                event.preventDefault();
                return;
            }
            const item = (event.target as Element).closest<HTMLElement>('[data-drag-content-id]');
            const kind = item?.dataset.dragContentKind;
            const id = item?.dataset.dragContentId;
            if (!id || (kind !== 'actor' && kind !== 'item' && kind !== 'location')) return;
            event.stopPropagation();
            activeDrag?.cancel();
            const element = event.currentTarget;
            const document = element.ownerDocument;
            const cancel = () => {
                document.removeEventListener('dragover', over);
                document.removeEventListener('drop', drop);
                if (activeDrag?.element === element) activeDrag = undefined;
                cancelRef.current = undefined;
                receivers.forEach(candidate => candidate.highlight(false));
            };
            const finish: DragSession['finish'] = (target, targetElement) => {
                cancel();
                if (targetElement === element) return;
                try {
                    stage.runContentDrop(context, kind, id, target);
                } catch (error) {
                    console.error('Failed to run drag and drop actions:', error);
                    stage.showPriorityMessage(`Failed to run drag and drop actions: ${error instanceof Error ? error.message : String(error)}`);
                } finally {
                    if (onChange) onChange();
                    else onAction?.();
                }
            };
            const over = (dropEvent: DragEvent) => dropEvent.preventDefault();
            const drop = (dropEvent: DragEvent) => {
                dropEvent.preventDefault();
                const inside = dropEvent.target instanceof Node && element.contains(dropEvent.target);
                finish(undefined, inside ? element : undefined);
            };
            activeDrag = { stage, element, kind, finish, cancel };
            cancelRef.current = cancel;
            document.addEventListener('dragover', over);
            document.addEventListener('drop', drop);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', id);
            receivers.forEach(candidate => {
                const target = candidate.current();
                if (candidate === receiver.current || target.stage !== stage) return;
                try {
                    candidate.highlight(stage.canReceiveContentDrop(target.context, kind, id));
                } catch (error) {
                    console.error('Failed to validate content drop:', error);
                    stage.showPriorityMessage(`Failed to validate content drop: ${error instanceof Error ? error.message : String(error)}`);
                }
            });
        }}
        onDragEnd={() => cancelRef.current?.()}
        onDragOver={event => {
            if (activeDrag?.stage !== stage || (accepts && activeDrag.kind !== accepts)) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={event => {
            if (activeDrag?.stage !== stage || (accepts && activeDrag.kind !== accepts)) return;
            event.preventDefault();
            event.stopPropagation();
            activeDrag.finish(context, event.currentTarget);
            onChange?.();
        }}>
        {children}
    </div>;
};
