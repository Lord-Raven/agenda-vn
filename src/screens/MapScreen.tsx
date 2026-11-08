import { FC, useEffect, useMemo, useState } from "react";
import { EditNote, EventAvailable, MenuRounded, Settings } from "@mui/icons-material";
import { Box } from "@mui/material";
import { Stage } from "../Stage";
import { Location } from "../content/Location";
import { ScreenType } from "./BaseScreen";
import { ContentManagementScreen } from "./ContentManagementScreen";
import { useTooltip } from "../components/TooltipContext";
import { Button, GlassPanel } from "../components/UiComponents";
import { DefinedMapView } from "./DefinedMapView";
import { LocationActorPortraits } from "../components/LocationActorPortraits";
import { GlobalStatBar } from "../components/GlobalStatBar";
import { ControlDock } from "../components/ControlDock";
import { useCachedImageUrl } from "../utils/ImageCache";
import { ContentCardList, ContentCardPage } from "../components/ContentCardList";
import { isMapAvailable } from "../content/Map";
import { Skit } from "../content/Skit";
import { PopupControl } from "../components/PopupControl";

interface MapScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

const UNCATEGORIZED_LABEL = "Uncategorized";

const normalizeCategory = (category?: string) => {
    const trimmed = `${category || ""}`.trim();
    return trimmed || UNCATEGORIZED_LABEL;
};

const sortLocationsByName = (left: Location, right: Location) => left.name.localeCompare(right.name);

export const MapScreen: FC<MapScreenProps> = ({ stage, setScreenType, isVerticalLayout }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [showContentManagement, setShowContentManagement] = useState(false);
    const [revision, setRevision] = useState(0);
    const handleAction = (skit?: Skit | null) => {
        setRevision(current => current + 1);
        if (skit) setScreenType(ScreenType.SKIT);
    };

    const stageInstance = stage();
    const configuredBackgroundImageUrl = (stageInstance.getConfiguration(stageInstance.getSave()).backgroundImageUrl || "").trim();
    const cachedBackgroundImageUrl = useCachedImageUrl(configuredBackgroundImageUrl);
    const screenBackgroundImage = cachedBackgroundImageUrl
        ? `linear-gradient(130deg, var(--agenda-atmosphere-start) 0%, var(--agenda-atmosphere-mid) 48%, var(--agenda-atmosphere-end) 100%), url(${cachedBackgroundImageUrl})`
        : "radial-gradient(900px 560px at 18% 12%, color-mix(in srgb, var(--agenda-accent-primary) 22%, transparent), transparent 62%), radial-gradient(840px 520px at 82% 88%, color-mix(in srgb, var(--agenda-highlight) 18%, transparent), transparent 64%), linear-gradient(130deg, var(--agenda-atmosphere-start) 0%, var(--agenda-atmosphere-mid) 48%, var(--agenda-atmosphere-end) 100%)";
    const save = stageInstance.getSave();
    const currentTimeOfDay = save.currentTimeOfDay || "morning";
    const scheduleContext = stageInstance.getScheduleContext(save);
    const availableMaps = (save.maps || []).filter(map => isMapAvailable(map, scheduleContext));

    const activeLocations = useMemo(
        () => Object.values(save.atlas || {})
            .filter((location): location is Location => Boolean(location) && location.active !== false && stageInstance.isLocationVisible(location.id))
            .sort((left, right) => {
                const categoryCompare = normalizeCategory(left.category).localeCompare(normalizeCategory(right.category));
                if (categoryCompare !== 0) {
                    return categoryCompare;
                }
                return sortLocationsByName(left, right);
            }),
        [save.atlas, stageInstance, revision],
    );

    const pages = useMemo<ContentCardPage[]>(() => {
        const byCategory = new Map<string, Location[]>();
        activeLocations.forEach(location => {
            const category = normalizeCategory(location.category);
            byCategory.set(category, [...(byCategory.get(category) || []), location]);
        });
        return Array.from(byCategory.keys()).sort((left, right) => left.localeCompare(right)).map(category => ({
            key: category,
            title: category,
            cards: (byCategory.get(category) || []).map(location => {
                const currentEvent = stageInstance.getCurrentLocationEvent(location.id);
                const canVisit = stageInstance.canVisitLocation(location.id);
                return {
                    key: location.id,
                    kind: "location" as const,
                    id: location.id,
                    subtitle: currentEvent ? currentEvent.name : !canVisit ? "Unavailable" : undefined,
                    highlightSubtitle: !!currentEvent,
                    disabled: !canVisit,
                    onClick: () => {
                        if (stageInstance.startLocationVisit(location.id)) {
                            setScreenType(ScreenType.SKIT);
                        }
                    },
                    trailing: <LocationActorPortraits locationId={location.id} stage={stageInstance} size={isVerticalLayout ? 34 : 40} labelSide="left" />,
                };
            }),
        }));
    }, [activeLocations, stageInstance, isVerticalLayout, setScreenType]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setScreenType(ScreenType.MENU);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [setScreenType]);

    if (availableMaps.length > 0) {
        return (
            <>
                <DefinedMapView
                    stage={stage}
                    maps={availableMaps}
                    onAction={handleAction}
                    setScreenType={setScreenType}
                    isVerticalLayout={isVerticalLayout}
                    overlay={<PopupControl stage={stage} isVerticalLayout={isVerticalLayout} setScreenType={setScreenType} onAction={handleAction} />}
                />
            </>
        );
    }

    return (
        <>
            <Box
                sx={{
                    width: "100vw",
                    minHeight: "100vh",
                    height: "100dvh",
                    boxSizing: "border-box",
                    padding: { xs: "12px", md: "18px" },
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                    overflow: "hidden",
                    backgroundImage: screenBackgroundImage,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                }}
            >
                <Box sx={{ flexShrink: 0 }}>
                    <GlobalStatBar
                        stage={stage}
                        isVerticalLayout={isVerticalLayout}
                        onActivate={handleAction}
                        buttons={
                            <>
                                {stageInstance.areEventsEnabled() && (
                                <Button
                                    variant="secondary"
                                    onClick={() => setScreenType(ScreenType.CALENDAR)}
                                    onMouseEnter={() => setTooltip("View calendar", EventAvailable)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <EventAvailable fontSize="small" />
                                </Button>
                                )}
                                {!isVerticalLayout && (
                                <Button
                                    variant="secondary"
                                    onClick={() => setShowContentManagement(true)}
                                    onMouseEnter={() => setTooltip("Manage configuration, actors, locations, and more", EditNote)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <EditNote fontSize="small" />
                                </Button>
                                )}
                                <Button
                                    variant="secondary"
                                    onClick={() => setScreenType(ScreenType.MENU)}
                                    onMouseEnter={() => setTooltip("Main menu", MenuRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <MenuRounded fontSize="small" />
                                </Button>
                            </>
                        }
                    />
                </Box>

                <Box sx={{ position: 'relative', isolation: 'isolate', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <GlassPanel variant="bright" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <ContentCardList
                        stage={stage}
                        pages={pages}
                        isVerticalLayout={isVerticalLayout}
                        emptyTitle="No Locations"
                        emptyMessage="No active locations are available yet."
                    />
                </GlassPanel>
                <PopupControl stage={stage} isVerticalLayout={isVerticalLayout} setScreenType={setScreenType} onAction={handleAction} />
                </Box>

                <ControlDock stage={stage} isVerticalLayout={isVerticalLayout} onActivate={handleAction} />
            </Box>

            {showContentManagement && (
                <ContentManagementScreen
                    stage={stage}
                    onClose={() => {stage().saveGame(); setShowContentManagement(false); handleAction();}}
                />
            )}
        </>
    );
};