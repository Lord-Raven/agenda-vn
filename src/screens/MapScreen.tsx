import { FC, useEffect, useMemo, useState } from "react";
import { ArrowBackRounded, ArrowForwardRounded, EditNote, EventAvailable, MenuRounded, Settings } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { Stage } from "../Stage";
import { getLocationImageUrl, LOCATION_TIME_OF_DAY_LABELS, Location } from "../content/Location";
import { ScreenType } from "./BaseScreen";
import { ContentManagementScreen } from "./ContentManagementScreen";
import { useTooltip } from "../components/TooltipContext";
import { Button, GlassPanel } from "../components/UiComponents";
import { DefinedMapView } from "./DefinedMapView";
import { LocationActorPortraits } from "../components/LocationActorPortraits";
import { GlobalStatBar } from "../components/GlobalStatBar";
import { useCachedImageUrl } from "../utils/ImageCache";
import { CachedBackgroundUrl } from "../components/CachedImage";

interface MapScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

const DEFAULT_BACKGROUND_IMAGE_URL = "https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png";
const UNCATEGORIZED_LABEL = "Uncategorized";

const normalizeCategory = (category?: string) => {
    const trimmed = `${category || ""}`.trim();
    return trimmed || UNCATEGORIZED_LABEL;
};

const sortLocationsByName = (left: Location, right: Location) => left.name.localeCompare(right.name);

export const MapScreen: FC<MapScreenProps> = ({ stage, setScreenType, isVerticalLayout }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [showContentManagement, setShowContentManagement] = useState(false);

    const stageInstance = stage();
    const configuredBackgroundImageUrl = (stageInstance.getConfiguration().backgroundImageUrl || "").trim() || DEFAULT_BACKGROUND_IMAGE_URL;
    const cachedBackgroundImageUrl = useCachedImageUrl(configuredBackgroundImageUrl);
    const save = stageInstance.getSave();
    const currentTimeOfDay = save.currentTimeOfDay || "morning";
    const activeMaps = useMemo(
        () => (save.maps || []).filter(map => map.active !== false),
        [save.maps],
    );

    const activeLocations = useMemo(
        () => Object.values(save.atlas || {})
            .filter((location): location is Location => Boolean(location) && location.active !== false)
            .sort((left, right) => {
                const categoryCompare = normalizeCategory(left.category).localeCompare(normalizeCategory(right.category));
                if (categoryCompare !== 0) {
                    return categoryCompare;
                }
                return sortLocationsByName(left, right);
            }),
        [save.atlas],
    );

    const categories = useMemo(
        () => Array.from(new Set(activeLocations.map((location) => normalizeCategory(location.category)))).sort((left, right) => left.localeCompare(right)),
        [activeLocations],
    );

    const [selectedCategory, setSelectedCategory] = useState<string>(categories[0] || "");

    useEffect(() => {
        if (categories.length === 0) {
            if (selectedCategory) {
                setSelectedCategory("");
            }
            return;
        }

        if (!selectedCategory || !categories.includes(selectedCategory)) {
            setSelectedCategory(categories[0]);
        }
    }, [categories, selectedCategory]);

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

    const selectedCategoryIndex = categories.findIndex((category) => category === selectedCategory);
    const visibleLocations = useMemo(
        () => activeLocations.filter((location) => normalizeCategory(location.category) === selectedCategory),
        [activeLocations, selectedCategory],
    );

    const cycleCategory = (offset: number) => {
        if (categories.length <= 1) {
            return;
        }

        const currentIndex = selectedCategoryIndex >= 0 ? selectedCategoryIndex : 0;
        const nextIndex = (currentIndex + offset + categories.length) % categories.length;
        setSelectedCategory(categories[nextIndex]);
    };

    if (activeMaps.length > 0) {
        return (
            <DefinedMapView
                stage={stage}
                maps={activeMaps}
                setScreenType={setScreenType}
                isVerticalLayout={isVerticalLayout}
            />
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
                    backgroundImage: `linear-gradient(130deg, var(--agenda-atmosphere-start) 0%, var(--agenda-atmosphere-mid) 48%, var(--agenda-atmosphere-end) 100%), url(${cachedBackgroundImageUrl || ''})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                }}
            >
                <Box sx={{ flexShrink: 0 }}>
                    <GlobalStatBar
                        stage={stage}
                        buttons={
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => setScreenType(ScreenType.CALENDAR)}
                                    onMouseEnter={() => setTooltip("View calendar", EventAvailable)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <EventAvailable fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setShowContentManagement(true)}
                                    onMouseEnter={() => setTooltip("Manage configuration, actors, locations, and more", EditNote)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <EditNote fontSize="small" />
                                </Button>
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

                <GlassPanel variant="bright" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <Box sx={{ display: "flex", justifyContent: "flex-start", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap" }}>
                        <Typography
                            sx={{
                                color: "var(--agenda-text-muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.12em",
                                fontSize: "0.72rem",
                            }}
                        >
                            {LOCATION_TIME_OF_DAY_LABELS[currentTimeOfDay]} locations
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 1,
                            mt: 1,
                            mb: 1.5,
                        }}
                    >
                        {categories.length > 1 && (
                            <Button
                                variant="secondary"
                                onClick={() => cycleCategory(-1)}
                                onMouseEnter={() => setTooltip("Previous category", ArrowBackRounded)}
                                onMouseLeave={clearTooltip}
                                style={{ padding: "8px 10px" }}
                            >
                                <ArrowBackRounded fontSize="small" />
                            </Button>
                        )}

                        <Box sx={{ textAlign: "center", minWidth: 0 }}>
                            <Typography
                                sx={{
                                    color: "var(--agenda-text-muted)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.14em",
                                    fontSize: "0.72rem",
                                    mb: 0.4,
                                }}
                            >
                                Category
                            </Typography>
                            <Typography
                                sx={{
                                    color: "var(--agenda-text-primary)",
                                    fontFamily: "var(--agenda-font-flavor)",
                                    fontWeight: 700,
                                    fontSize: { xs: "1.7rem", md: "2.5rem" },
                                    letterSpacing: "0.04em",
                                    lineHeight: 1,
                                    textShadow: "0 3px 14px color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)",
                                }}
                            >
                                {selectedCategory || "No Locations"}
                            </Typography>
                        </Box>

                        {categories.length > 1 && (
                            <Button
                                variant="secondary"
                                onClick={() => cycleCategory(1)}
                                onMouseEnter={() => setTooltip("Next category", ArrowForwardRounded)}
                                onMouseLeave={clearTooltip}
                                style={{ padding: "8px 10px" }}
                            >
                                <ArrowForwardRounded fontSize="small" />
                            </Button>
                        )}
                    </Box>

                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1.25,
                            minHeight: 0,
                            overflowY: "auto",
                            pr: 0.5,
                        }}
                    >
                        {visibleLocations.length === 0 && (
                            <Box
                                sx={{
                                    minHeight: 220,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: "16px",
                                    border: "1px solid var(--agenda-panel-border)",
                                    background: "linear-gradient(180deg, var(--agenda-panel-surface), color-mix(in srgb, var(--agenda-surface-base) 86%, transparent))",
                                    color: "var(--agenda-text-muted)",
                                    textAlign: "center",
                                    px: 2,
                                }}
                            >
                                <Typography sx={{ fontSize: "0.95rem" }}>
                                    No active locations are available for this category yet.
                                </Typography>
                            </Box>
                        )}

                        {visibleLocations.map((location, index) => {
                            const imageUrl = getLocationImageUrl(location, stageInstance);
                            const focalPoint = location.focalPoint || { x: 0.5, y: 0.5 };
                            const borderColor = location.themeColor || "var(--agenda-accent-primary)";
                            const currentEvent = stageInstance.getCurrentLocationEvent(location.id);
                            const canVisit = stageInstance.canVisitLocation(location.id);
                            const openLocation = () => {
                                if (stageInstance.startLocationVisit(location.id)) {
                                    setScreenType(ScreenType.SKIT);
                                }
                            };

                            return (
                                <CachedBackgroundUrl key={location.id} url={imageUrl}>
                                    {(cachedImageUrl) => (
                                        <motion.button
                                            type="button"
                                            disabled={!canVisit}
                                            onClick={openLocation}
                                            initial={{ opacity: 0, y: 16 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.22, delay: Math.min(index * 0.04, 0.18) }}
                                            style={{ width: '100%', padding: 0, border: 0, background: 'transparent', textAlign: 'left', color: 'inherit', cursor: canVisit ? 'pointer' : 'not-allowed', opacity: canVisit ? 1 : 0.56 }}
                                        >
                                            <Box
                                                sx={{
                                                    position: "relative",
                                                    minHeight: isVerticalLayout ? 180 : 210,
                                                    borderRadius: "18px",
                                                    overflow: "hidden",
                                                    border: `1px solid ${borderColor}`,
                                                    backgroundImage: cachedImageUrl
                                                        ? `linear-gradient(110deg, color-mix(in srgb, var(--agenda-surface-base) 84%, transparent) 0%, color-mix(in srgb, var(--agenda-surface-base) 55%, transparent) 42%, color-mix(in srgb, var(--agenda-surface-base) 80%, transparent) 100%), url(${cachedImageUrl})`
                                                        : "linear-gradient(110deg, color-mix(in srgb, var(--agenda-surface-base) 84%, transparent) 0%, color-mix(in srgb, var(--agenda-surface-base) 55%, transparent) 42%, color-mix(in srgb, var(--agenda-surface-base) 80%, transparent) 100%)",
                                                    backgroundSize: "cover",
                                                    backgroundPosition: `${focalPoint.x * 100}% ${focalPoint.y * 100}%`,
                                                    boxShadow: "0 10px 28px color-mix(in srgb, var(--agenda-surface-base) 55%, transparent)",
                                                }}
                                            >
                                        <Box sx={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}>
                                            <LocationActorPortraits locationId={location.id} stage={stageInstance} size={isVerticalLayout ? 34 : 40} />
                                        </Box>
                                        <Box
                                            sx={{
                                                position: "absolute",
                                                inset: 0,
                                                background: "linear-gradient(180deg, color-mix(in srgb, var(--agenda-surface-base) 20%, transparent) 0%, color-mix(in srgb, var(--agenda-surface-base) 14%, transparent) 36%, color-mix(in srgb, var(--agenda-surface-base) 76%, transparent) 100%)",
                                            }}
                                        />
                                        <Box
                                            sx={{
                                                position: "relative",
                                                zIndex: 1,
                                                height: "100%",
                                                display: "flex",
                                                alignItems: "flex-end",
                                                p: { xs: 1.5, md: 2 },
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    maxWidth: "min(100%, 540px)",
                                                    background: "color-mix(in srgb, var(--agenda-surface-base) 72%, transparent)",
                                                    border: "1px solid color-mix(in srgb, var(--agenda-text-primary) 18%, transparent)",
                                                    backdropFilter: "blur(8px)",
                                                    borderRadius: "12px",
                                                    px: 1.4,
                                                    py: 1.1,
                                                }}
                                            >
                                                <Typography
                                                    sx={{
                                                        color: "var(--agenda-text-muted)",
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.12em",
                                                        fontSize: "0.68rem",
                                                        mb: 0.35,
                                                    }}
                                                >
                                                    {normalizeCategory(location.category)}
                                                </Typography>
                                                <Typography
                                                    sx={{
                                                        color: "var(--agenda-text-primary)",
                                                        fontFamily: "var(--agenda-font-flavor)",
                                                        fontWeight: 700,
                                                        fontSize: { xs: "1.15rem", md: "1.45rem" },
                                                        lineHeight: 1.15,
                                                        textShadow: "0 2px 10px color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)",
                                                    }}
                                                >
                                                    {location.name || "Unnamed Location"}
                                                </Typography>
                                                <Typography
                                                    sx={{
                                                        color: currentEvent ? "var(--agenda-highlight)" : "var(--agenda-text-muted)",
                                                        fontSize: "0.76rem",
                                                        fontWeight: currentEvent ? 700 : 500,
                                                        mt: 0.5,
                                                    }}
                                                >
                                                    {currentEvent ? currentEvent.name : canVisit ? "Open for visits" : "Closed"}
                                                </Typography>
                                            </Box>
                                        </Box>
                                            </Box>
                                        </motion.button>
                                    )}
                                </CachedBackgroundUrl>
                            );
                        })}
                    </Box>
                </GlassPanel>
            </Box>

            {showContentManagement && (
                <ContentManagementScreen
                    stage={stage}
                    onClose={() => {stage().saveGame(); setShowContentManagement(false);}}
                />
            )}
        </>
    );
};