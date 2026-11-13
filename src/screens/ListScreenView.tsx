import { FC } from 'react';
import { Stage } from '../Stage';
import { Screen } from '../content/Screen';
import { ContentCardList, ContentCardPage } from '../components/ContentCardList';
import { Skit } from '../content/Skit';
import { processLoreText } from '../content/Lore';

export { ListCardDetail } from '../components/ContentCardControl';

interface ListScreenViewProps {
    stage: () => Stage;
    screen: Screen;
    isVerticalLayout: boolean;
    onAction: (skit?: Skit | null) => void;
}

export const buildListContentPages = (stage: Stage, screen: Screen, onAction: (skit?: Skit | null) => void): ContentCardPage[] =>
    stage.resolveListSections(screen).map(page => ({
        key: page.key,
        title: processLoreText(page.header, stage),
        cards: page.ids.map(id => ({
            key: id, kind: page.kind, id, header: page.header,
            control: stage.getCardControl(page.kind, page.section.cardControlId),
            disabled: page.unavailableIds.includes(id),
            onAction,
        })),
    }));

export const ListScreenView: FC<ListScreenViewProps> = ({ stage, screen, isVerticalLayout, onAction }) => (
    <ContentCardList
        stage={stage}
        pages={buildListContentPages(stage(), screen, onAction)}
        isVerticalLayout={isVerticalLayout}
        layout={screen.type === 'grid' ? 'grid' : 'list'}
        emptyTitle={screen.name || (screen.type === 'grid' ? 'Grid' : 'List')}
        emptyMessage={screen.sections.length ? 'Nothing to show right now.' : 'No headers configured for this Screen. Add headers in Screens.'}
    />
);
