import { FC, useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "../Stage";
import { Stage } from "../Stage";
import { ScreenType } from "./BaseScreen";
import { BlurredBackground } from "@lord-raven/novel-visualizer";
import { Box, Typography } from "@mui/material";
import { ArrowBackRounded, ArrowForwardRounded, CalendarMonth, EventAvailable, EventBusy, MenuRounded, Settings, TodayRounded } from "@mui/icons-material";
import { motion } from "framer-motion";
import { Button, GlassPanel } from "./UiComponents";
import { useTooltip } from "./TooltipContext";
import { ContentManagementScreen } from "./ContentManagementScreen";
import { Actor, getEmotionImage } from "../content/Actor";

interface CalendarScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

const CALENDAR_BACKGROUND_IMAGE = "https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parseDateKey = (dateText: string) => new Date(`${dateText}T00:00:00Z`);

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
));

const startOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const addMonths = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const isSameDate = (left: Date, right: Date) => formatDateKey(left) === formatDateKey(right);

const formatDate = (dateText: string) => {
    const parsedDate = parseDateKey(dateText);
    if (Number.isNaN(parsedDate.getTime())) {
        return dateText;
    }

    return parsedDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    });
};

const formatMonthLabel = (date: Date) => date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
});

const buildMonthGrid = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const leadingDays = monthStart.getUTCDay();
    const firstGridDay = addDays(monthStart, -leadingDays);

    return Array.from({ length: 42 }, (_, index) => addDays(firstGridDay, index));
};

const groupEventsByDate = (events: CalendarEvent[]) => events.reduce((grouped, event) => {
    const bucket = grouped.get(event.date) || [];
    bucket.push(event);
    grouped.set(event.date, bucket);
    return grouped;
}, new Map<string, CalendarEvent[]>());

export const CalendarScreen: FC<CalendarScreenProps> = ({ stage, setScreenType }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [showContentManagement, setShowContentManagement] = useState(false);

    const stageInstance = stage();
    const save = stageInstance.getSave();
    const uiSettings = stageInstance.getUiSettings();
    const currentDateKey = save.currentDate || formatDateKey(new Date());
    const currentDate = parseDateKey(currentDateKey);

    const [viewMonth, setViewMonth] = useState(() => startOfMonth(currentDate));
    const [selectedDate, setSelectedDate] = useState(currentDateKey);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

    const allEvents = useMemo(
        () => [...(save.upcomingEvents || [])].sort((left, right) => left.date.localeCompare(right.date)),
        [save.upcomingEvents],
    );
    const eventsByDate = useMemo(() => groupEventsByDate(allEvents), [allEvents]);
    const monthGrid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

    useEffect(() => {
        stageInstance.loadCalendarScreen();
    }, [stageInstance]);

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

    const selectedDateEvents = eventsByDate.get(selectedDate) || [];
    const selectedEvent = selectedEventId
        ? selectedDateEvents.find((event) => event.id === selectedEventId) || selectedDateEvents[0] || null
        : selectedDateEvents[0] || null;

    const jumpToCurrentMonth = () => {
        setViewMonth(startOfMonth(currentDate));
        setSelectedDate(currentDateKey);
        setSelectedEventId(null);
    };

    const changeMonth = (offset: number) => {
        const nextMonth = addMonths(viewMonth, offset);
        setViewMonth(nextMonth);
        setSelectedDate(formatDateKey(nextMonth));
        setSelectedEventId(null);
    };

    const selectDate = (dateKey: string, eventId: string | null = null) => {
        setSelectedDate(dateKey);
        setSelectedEventId(eventId);
    };

    const openEvent = (eventId: string) => {
        const opened = stageInstance.startCalendarEventSkit(eventId);
        if (opened) {
            setScreenType(ScreenType.SKIT);
        }
    };

    const skipEvent = () => {
        const skipped = stageInstance.skipNextEvent();
        if (skipped) {
            setTooltip(`Skipped: ${skipped.name}`, EventBusy, 3500);
            return;
        }

        stageInstance.rebuildUpcomingEvents(stageInstance.getSave()).then(() => {
            setTooltip("Generated more upcoming events.", EventAvailable, 3000);
        });
    };

    return (
        <>
            <BlurredBackground
                imageUrl={CALENDAR_BACKGROUND_IMAGE}
                overlay="linear-gradient(130deg, var(--agenda-calendar-overlay-start) 0%, var(--agenda-calendar-overlay-mid) 48%, var(--agenda-calendar-overlay-end) 100%)"
            >
                <Box
                    sx={{
                        width: "100vw",
                        height: "100vh",
                        boxSizing: "border-box",
                        padding: { xs: "12px", md: "18px" },
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.5,
                        overflow: "hidden",
                    }}
                >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Button
                                variant="secondary"
                                onClick={() => setScreenType(ScreenType.MENU)}
                                onMouseEnter={() => setTooltip("Back to menu", MenuRounded)}
                                onMouseLeave={clearTooltip}
                                style={{ padding: "10px 14px" }}
                            >
                                <MenuRounded fontSize="small" />
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => setShowContentManagement(true)}
                                onMouseEnter={() => setTooltip("Manage actors, locations, and lore", Settings)}
                                onMouseLeave={clearTooltip}
                                style={{ padding: "10px 14px" }}
                            >
                                <Settings fontSize="small" />
                            </Button>
                        </Box>

                        <Button
                            variant="primary"
                            onClick={skipEvent}
                            onMouseEnter={() => setTooltip("Skip to the next event date", EventBusy)}
                            onMouseLeave={clearTooltip}
                            style={{ padding: "10px 14px" }}
                        >
                            Skip Next Event
                        </Button>
                    </Box>

                    <GlassPanel variant="bright" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
                            <Box>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, marginBottom: "2px" }}>
                                    <CalendarMonth sx={{ color: "var(--agenda-mist)", fontSize: "1.1rem" }} />
                                    <Typography sx={{ color: "var(--agenda-verdant)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.8rem" }}>
                                        {uiSettings.gameTitle || "Agenda VN"}
                                    </Typography>
                                </Box>
                                <Typography sx={{ color: "#edf2f2", fontWeight: 700, fontSize: { xs: "1.15rem", md: "1.55rem" } }}>
                                    {formatMonthLabel(viewMonth)}
                                </Typography>
                                <Typography sx={{ color: "rgba(185, 210, 227, 0.8)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.72rem" }}>
                                    Current Date: {formatDate(currentDateKey)}
                                </Typography>
                            </Box>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Button
                                    variant="secondary"
                                    onClick={() => changeMonth(-1)}
                                    onMouseEnter={() => setTooltip("Previous month", ArrowBackRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "10px 12px" }}
                                >
                                    <ArrowBackRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={jumpToCurrentMonth}
                                    onMouseEnter={() => setTooltip("Jump to current month", TodayRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "10px 12px" }}
                                >
                                    <TodayRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => changeMonth(1)}
                                    onMouseEnter={() => setTooltip("Next month", ArrowForwardRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "10px 12px" }}
                                >
                                    <ArrowForwardRounded fontSize="small" />
                                </Button>
                            </Box>
                        </Box>

                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 0.75, px: 0.5 }}>
                            {WEEKDAY_LABELS.map((label) => (
                                <Typography
                                    key={label}
                                    sx={{ color: "rgba(185, 210, 227, 0.78)", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.72rem", textAlign: "center" }}
                                >
                                    {label}
                                </Typography>
                            ))}
                        </Box>

                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridTemplateRows: "repeat(6, minmax(0, 1fr))", gap: 0.75, flex: 1, minHeight: 0 }}>
                            {monthGrid.map((cellDate) => {
                                const dateKey = formatDateKey(cellDate);
                                const isCurrentMonth = cellDate.getUTCMonth() === viewMonth.getUTCMonth();
                                const isToday = isSameDate(cellDate, currentDate);
                                const isPast = dateKey < currentDateKey;
                                const cellEvents = eventsByDate.get(dateKey) || [];
                                const isSelected = dateKey === selectedDate;

                                return (
                                    <motion.div
                                        key={dateKey}
                                        onClick={() => selectDate(dateKey, cellEvents[0]?.id || null)}
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.995 }}
                                        style={{
                                            appearance: "none",
                                            border: 0,
                                            padding: 0,
                                            background: "transparent",
                                            textAlign: "left",
                                            width: "100%",
                                            height: "100%",
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                height: "100%",
                                                minHeight: 0,
                                                boxSizing: "border-box",
                                                borderRadius: 2,
                                                border: `1px solid ${isSelected ? "var(--agenda-verdant)" : isToday ? "rgba(137, 205, 135, 0.6)" : "rgba(138, 176, 204, 0.24)"}`,
                                                background: isCurrentMonth
                                                    ? "linear-gradient(145deg, rgba(16, 22, 37, 0.88), rgba(26, 32, 50, 0.94))"
                                                    : "rgba(14, 19, 31, 0.62)",
                                                backgroundImage: isPast
                                                    ? "repeating-linear-gradient(135deg, rgba(185, 210, 227, 0.08) 0, rgba(185, 210, 227, 0.08) 8px, transparent 8px, transparent 20px)"
                                                    : "none",
                                                opacity: isCurrentMonth ? 1 : 0.58,
                                                boxShadow: isSelected
                                                    ? "0 0 0 1px rgba(137, 205, 135, 0.35), 0 12px 28px rgba(0, 0, 0, 0.25)"
                                                    : "none",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 0.5,
                                                padding: "10px",
                                                overflow: "hidden",
                                            }}
                                        >
                                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
                                                <Typography
                                                    sx={{
                                                        color: isToday ? "var(--agenda-verdant)" : "#edf2f2",
                                                        fontWeight: 700,
                                                        fontSize: { xs: "0.82rem", md: "0.92rem" },
                                                        textDecoration: isPast && isCurrentMonth ? "line-through" : "none",
                                                    }}
                                                >
                                                    {cellDate.getUTCDate()}
                                                </Typography>
                                                {isToday && (
                                                    <Typography sx={{ color: "var(--agenda-verdant)", fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                                                        Today
                                                    </Typography>
                                                )}
                                            </Box>

                                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, overflow: "hidden" }}>
                                                {cellEvents.slice(0, 3).map((eventItem) => {
                                                    const participants = (eventItem.actorIds || eventItem.participantActorIds || [])
                                                        .map((actorId) => save.actors[actorId])
                                                        .filter(Boolean) as Actor[];

                                                    return (
                                                        <motion.button
                                                            key={eventItem.id}
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                selectDate(dateKey, eventItem.id);
                                                            }}
                                                            onMouseEnter={() => setTooltip(`Select event: ${eventItem.name}`, EventAvailable)}
                                                            onMouseLeave={clearTooltip}
                                                            whileHover={{ scale: 1.01 }}
                                                            whileTap={{ scale: 0.99 }}
                                                            style={{
                                                                appearance: "none",
                                                                border: 0,
                                                                padding: 0,
                                                                background: "transparent",
                                                                textAlign: "left",
                                                                width: "100%",
                                                            }}
                                                        >
                                                            <Box
                                                                sx={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    gap: 0.75,
                                                                    backgroundColor: eventItem.status === "upcoming" ? "rgba(17, 24, 39, 0.78)" : "rgba(17, 24, 39, 0.62)",
                                                                    border: `1px solid ${eventItem.status === "upcoming" ? "rgba(137, 205, 135, 0.38)" : "rgba(138, 176, 204, 0.26)"}`,
                                                                    borderRadius: "999px",
                                                                    padding: "4px 8px 4px 4px",
                                                                    overflow: "hidden",
                                                                }}
                                                            >
                                                                <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                                                                    {participants.slice(0, 3).map((actor, index) => (
                                                                        <Box
                                                                            key={`${eventItem.id}-${actor.id}`}
                                                                            sx={{
                                                                                width: 22,
                                                                                height: 22,
                                                                                marginLeft: index === 0 ? 0 : -0.5,
                                                                                borderRadius: "50%",
                                                                                border: "1px solid rgba(237, 242, 242, 0.32)",
                                                                                backgroundImage: `url(${getEmotionImage(actor, "neutral", stageInstance, actor.outfitId) || actor.sampleImageUrl})`,
                                                                                backgroundSize: "cover",
                                                                                backgroundPosition: "top center",
                                                                                backgroundColor: "rgba(12, 18, 28, 0.88)",
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </Box>
                                                                <Typography sx={{ color: "#edf2f2", fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                    {eventItem.name}
                                                                </Typography>
                                                            </Box>
                                                        </motion.button>
                                                    );
                                                })}

                                                {cellEvents.length > 3 && (
                                                    <Typography sx={{ color: "rgba(185, 210, 227, 0.72)", fontSize: "0.72rem", fontStyle: "italic" }}>
                                                        +{cellEvents.length - 3} more
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                    </motion.div>
                                );
                            })}
                        </Box>
                    </GlassPanel>

                    <GlassPanel variant="default" style={{ flexShrink: 0, minHeight: 160, overflow: "hidden" }}>
                        {selectedEvent ? (
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
                                    <Box>
                                        <Typography sx={{ color: "rgba(185, 210, 227, 0.78)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.72rem" }}>
                                            Selected Event
                                        </Typography>
                                        <Typography sx={{ color: "#edf2f2", fontWeight: 700, fontSize: { xs: "1rem", md: "1.2rem" } }}>
                                            {selectedEvent.name}
                                        </Typography>
                                        <Typography sx={{ color: "rgba(185, 210, 227, 0.88)", fontSize: "0.88rem" }}>
                                            {formatDate(selectedEvent.date)} · {save.atlas[selectedEvent.locationId]?.name || "Unknown Location"}
                                        </Typography>
                                    </Box>

                                    <Typography sx={{ color: selectedEvent.status === "upcoming" ? "var(--agenda-verdant)" : "rgba(185, 210, 227, 0.78)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.72rem", alignSelf: "center" }}>
                                        {selectedEvent.status}
                                    </Typography>
                                </Box>

                                <Typography sx={{ color: "#edf2f2", lineHeight: 1.55, maxWidth: 980 }}>
                                    {selectedEvent.description}
                                </Typography>

                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                                    {(selectedEvent.actorIds || selectedEvent.participantActorIds || []).map((actorId) => {
                                        const actor = save.actors[actorId];
                                        if (!actor) {
                                            return null;
                                        }

                                        return (
                                            <Box
                                                key={`${selectedEvent.id}-${actor.id}`}
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 0.75,
                                                    backgroundColor: "rgba(17, 24, 39, 0.68)",
                                                    border: `1px solid ${actor.themeColor || "rgba(138, 176, 204, 0.44)"}`,
                                                    borderRadius: "999px",
                                                    padding: "4px 10px 4px 4px",
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        width: 26,
                                                        height: 26,
                                                        borderRadius: "50%",
                                                        border: "1px solid rgba(237, 242, 242, 0.34)",
                                                        backgroundImage: `url(${getEmotionImage(actor, "neutral", stageInstance, actor.outfitId) || actor.sampleImageUrl})`,
                                                        backgroundSize: "cover",
                                                        backgroundPosition: "top center",
                                                    }}
                                                />
                                                <Typography sx={{ color: "rgba(237, 242, 242, 0.96)", fontSize: "0.8rem" }}>{actor.name}</Typography>
                                            </Box>
                                        );
                                    })}
                                </Box>

                                {selectedEvent.status === "upcoming" ? (
                                    <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
                                        <Button
                                            variant="primary"
                                            onClick={() => openEvent(selectedEvent.id)}
                                            onMouseEnter={() => setTooltip(`Open event: ${selectedEvent.name}`, EventAvailable)}
                                            onMouseLeave={clearTooltip}
                                            style={{ padding: "10px 14px" }}
                                        >
                                            Open Event
                                        </Button>
                                    </Box>
                                ) : (
                                    <Typography sx={{ color: "rgba(185, 210, 227, 0.74)", fontSize: "0.85rem" }}>
                                        This event has already been resolved and remains on the calendar for reference.
                                    </Typography>
                                )}
                            </Box>
                        ) : (
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                                <Typography sx={{ color: "rgba(185, 210, 227, 0.78)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.72rem" }}>
                                    Selected Date
                                </Typography>
                                <Typography sx={{ color: "#edf2f2", fontWeight: 700, fontSize: "1rem" }}>
                                    {formatDate(selectedDate)}
                                </Typography>
                                <Typography sx={{ color: "rgba(185, 210, 227, 0.8)" }}>
                                    No events on this date.
                                </Typography>
                            </Box>
                        )}
                    </GlassPanel>
                </Box>
            </BlurredBackground>

            {showContentManagement && (
                <ContentManagementScreen
                    stage={stage}
                    onClose={() => setShowContentManagement(false)}
                />
            )}
        </>
    );
};
