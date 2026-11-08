import { FC } from 'react';
import { Box, Typography } from '@mui/material';
import { ResolvedListCardDetail, Stage } from '../Stage';
import { Screen } from '../content/Screen';
import { formatStatOptionValueText, resolveReferenceKind } from '../content/Stat';
import { ContentCardList, ContentCardPage } from '../components/ContentCardList';
import { ContentListPortraits } from '../components/ContentListControl';
import { Skit } from '../content/Skit';

interface ListScreenViewProps {
    stage: () => Stage;
    screen: Screen;
    isVerticalLayout: boolean;
    onAction: (skit?: Skit | null) => void;
}

export const buildListContentPages = (stage: Stage, screen: Screen, onAction: (skit?: Skit | null) => void, isVerticalLayout = false): ContentCardPage[] =>
    stage.resolveListSections(screen).map(page => ({
        key: page.key,
        title: page.header,
        cards: page.ids.map(id => {
            const details = page.section.details
                .map(detail => stage.resolveListCardDetail(detail, page.kind, id, page.header))
                .filter((detail): detail is ResolvedListCardDetail => !!detail);
            return {
                key: id,
                kind: page.kind,
                id,
                onClick: page.section.actions.length ? () => onAction(stage.runListCardActions(page.section, page.kind, id, page.header)) : undefined,
                trailing: details.length ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 0.75 }}>
                        {details.map(detail => <ListCardDetail key={detail.key} detail={detail} stage={stage} isVerticalLayout={isVerticalLayout} />)}
                    </Box>
                ) : undefined,
            };
        }),
    }));

export const ListScreenView: FC<ListScreenViewProps> = ({ stage, screen, isVerticalLayout, onAction }) => (
    <ContentCardList
        stage={stage}
        pages={buildListContentPages(stage(), screen, onAction, isVerticalLayout)}
        isVerticalLayout={isVerticalLayout}
        emptyTitle={screen.name || 'List'}
        emptyMessage={screen.sections.length ? 'Nothing to show right now.' : 'No headers configured for this Screen. Add headers in Screens.'}
    />
);

const formatDetailText = (detail: ResolvedListCardDetail): string => {
    if (detail.stat && (detail.type === 'option' || detail.type === 'optionList')) {
        return formatStatOptionValueText(detail.stat, detail.value) ?? '';
    }
    if (detail.type === 'checkbox') return detail.value ? 'Yes' : 'No';
    return Array.isArray(detail.value) ? detail.value.join(', ') : String(detail.value ?? '');
};

export const ListCardDetail: FC<{ detail: ResolvedListCardDetail; stage: Stage; isVerticalLayout: boolean }> = ({ detail, stage, isVerticalLayout }) => {
    const isReference = ['actor', 'actorList', 'item', 'itemList', 'location', 'locationList', 'contentList'].includes(detail.type);
    if (isReference) {
        const values = (Array.isArray(detail.value) ? detail.value : [detail.value]).map(String).filter(Boolean);
        return values.length ? (
            <Box data-popup-card-detail={detail.key} title={detail.label} sx={{ display: 'flex' }}>
                <ContentListPortraits kind={resolveReferenceKind(detail.type)} values={values} stage={stage} label={detail.label} variant="overlay" size={isVerticalLayout ? 30 : 36} />
            </Box>
        ) : null;
    }
    return (
        <Box data-popup-card-detail={detail.key} sx={{
            display: 'flex', alignItems: 'baseline', gap: 0.5, px: 1, py: 0.4, borderRadius: '999px',
            border: '1px solid var(--agenda-line-subtle)',
            background: 'color-mix(in srgb, var(--agenda-surface-base) 70%, transparent)',
            maxWidth: 220, minWidth: 0,
        }}>
            <Typography component="span" sx={{ color: 'var(--agenda-text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{detail.label}</Typography>
            <Typography component="span" sx={{ color: 'var(--agenda-text-primary)', fontSize: '0.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {formatDetailText(detail)}
            </Typography>
        </Box>
    );
};
