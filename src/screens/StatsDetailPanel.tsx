import React, { FC } from 'react';
import { StatEntryEditor } from '../components/StatEntryEditor';

type StatsDetailPanelProps = Omit<React.ComponentProps<typeof StatEntryEditor>,
    'collapsed' | 'onToggleCollapse' | 'fieldLabelStyle' | 'inlineFieldStyle' |
    'inlineFieldTopStyle' | 'compactChipLabelStyle'>;

const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    color: 'var(--agenda-text-muted)',
    marginBottom: 0,
    fontSize: '13px',
    lineHeight: 1.1,
};

const inlineFieldStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '120px minmax(0, 1fr)',
    gap: '10px',
    alignItems: 'center',
    marginBottom: 8,
};

export const StatsDetailPanel: FC<StatsDetailPanelProps> = (props) => (
    <div style={{ padding: '18px' }}>
        <StatEntryEditor
            {...props}
            collapsed={false}
            fieldLabelStyle={fieldLabelStyle}
            inlineFieldStyle={inlineFieldStyle}
            inlineFieldTopStyle={{ ...inlineFieldStyle, alignItems: 'start' }}
            compactChipLabelStyle={{ color: 'var(--agenda-text-muted)', fontSize: '12px', marginBottom: 4 }}
        />
    </div>
);
