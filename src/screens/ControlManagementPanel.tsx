import { FC, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Stage } from '../Stage';
import { Control } from '../content/Control';
import { ControlDetailPanel } from './ControlDetailPanel';
import {
    CategorizedEntrySection,
    CategorizedEntrySidebar,
    toggleSidebarCollapseState,
    useCachedSidebarCollapseState,
} from '../components/CategorizedEntrySidebar';

interface ControlManagementPanelProps {
    stage: () => Stage;
}

const PLACEMENT_LABELS: Record<Control['placement'], string> = {
    top: 'Top',
    bottom: 'Bottom',
};

const TYPE_LABELS: Record<Control['type'], string> = {
    button: 'Button',
    statDisplay: 'Stat Display',
    statEditor: 'Stat Editor',
};

export const ControlManagementPanel: FC<ControlManagementPanelProps> = ({ stage }) => {
    const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
    const [collapsedSections, setCollapsedSections] = useCachedSidebarCollapseState('control-management');
    const [controlRevision, setControlRevision] = useState(0);
    const shouldReduceMotion = useReducedMotion();

    const shellStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 360px) 1fr',
        gap: '20px',
        flex: 1,
        minHeight: 0,
        height: '100%',
    };

    const detailPaneStyle: React.CSSProperties = {
        background: 'color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)',
        border: '1px solid var(--agenda-line-subtle)',
        borderRadius: '12px',
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        maxHeight: '100%',
    };

    const sortByName = <T extends { name?: string }>(a: T, b: T) =>
        (a.name ?? '').trim().localeCompare((b.name ?? '').trim(), undefined, { sensitivity: 'base' });

    const controls = useMemo(() => {
        return (stage().getConfiguration().controls || [])
            .filter((control) => control.active !== false)
            .sort(sortByName);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, controlRevision]);

    const controlsByPlacement = useMemo<CategorizedEntrySection<Control>[]>(() => {
        const sections: CategorizedEntrySection<Control>[] = [
            { id: 'top', title: PLACEMENT_LABELS.top, entries: controls.filter((control) => control.placement === 'top') },
            { id: 'bottom', title: PLACEMENT_LABELS.bottom, entries: controls.filter((control) => control.placement === 'bottom') },
        ];
        return sections;
    }, [controls]);

    const selectedControl = useMemo(() => {
        if (!selectedControlId) {
            return null;
        }
        return controls.find((control) => control.id === selectedControlId) || null;
    }, [controls, selectedControlId]);

    const handleCreateControl = (sectionId: string) => {
        const configuredControls = stage().getConfiguration().controls || [];
        const baseName = 'New Control';
        const usedNames = new Set(configuredControls.map((control) => control.name?.trim().toLowerCase()));
        let candidateName = baseName;
        let counter = 1;
        while (usedNames.has(candidateName.toLowerCase())) {
            candidateName = `${baseName} ${counter}`;
            counter += 1;
        }

        const control = new Control({
            active: true,
            name: candidateName,
            placement: sectionId === 'top' ? 'top' : 'bottom',
            type: 'button',
            label: candidateName,
        });

        stage().updateConfiguration({ controls: [...configuredControls, control] });
        setControlRevision((current) => current + 1);
        setSelectedControlId(control.id);
    };

    const renderControlButton = (control: Control) => {
        const isSelected = control.id === selectedControlId;
        return (
            <motion.button
                whileHover={{ scale: 1.01 }}
                type="button"
                onClick={() => setSelectedControlId(control.id)}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    background: isSelected
                        ? 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)'
                        : 'color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)',
                    border: `1px solid ${isSelected ? 'var(--agenda-line-strong)' : 'var(--agenda-line-subtle)'}`,
                    borderRadius: '8px',
                    padding: '10px',
                    color: 'var(--agenda-text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                }}
            >
                <div style={{ color: 'var(--agenda-highlight)', fontSize: '14px', fontWeight: 700 }}>
                    {control.name || '(Unnamed Control)'}
                </div>
                <div style={{ color: 'var(--agenda-text-muted)', fontSize: '12px' }}>
                    {TYPE_LABELS[control.type]}
                </div>
            </motion.button>
        );
    };

    return (
        <div style={shellStyle}>
            <CategorizedEntrySidebar
                sections={controlsByPlacement}
                collapsedSections={collapsedSections}
                onToggleSection={(sectionId) => {
                    setCollapsedSections((current) => toggleSidebarCollapseState(current, sectionId, false));
                }}
                renderEntry={(control) => renderControlButton(control)}
                getEntryKey={(control) => control.id}
                shouldReduceMotion={Boolean(shouldReduceMotion)}
                emptyListMessage="No controls have been defined yet."
                sectionEmptyMessage="No controls."
                defaultCollapsed={false}
                renderSectionAction={(section) => {
                    handleCreateControl(section.id);
                }}
            />

            <div style={detailPaneStyle}>
                {!selectedControl ? (
                    <div
                        style={{
                            color: 'var(--agenda-text-muted)',
                            fontSize: '15px',
                            textAlign: 'center',
                            padding: '30px',
                        }}
                    >
                        Select a control to view and edit details.
                    </div>
                ) : (
                    <ControlDetailPanel
                        key={selectedControl.id}
                        control={selectedControl}
                        stage={stage}
                        onUpdate={() => setControlRevision((current) => current + 1)}
                        onDeactivate={() => setSelectedControlId(null)}
                    />
                )}
            </div>
        </div>
    );
};
