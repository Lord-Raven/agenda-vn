import { useEffect, useRef } from 'react';

export const useDebouncedSave = (save: () => void) => {
    const didMount = useRef(false);
    const pendingSave = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!didMount.current) {
            didMount.current = true;
            return;
        }

        pendingSave.current = save;
        const timeout = window.setTimeout(() => {
            save();
            pendingSave.current = null;
        }, 300);
        return () => window.clearTimeout(timeout);
    }, [save]);

    useEffect(() => () => {
        pendingSave.current?.();
        pendingSave.current = null;
    }, []);
};
