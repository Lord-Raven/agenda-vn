import { FC, useEffect, useMemo, useState } from "react";
import type { CalendarEvent, CalendarEventRecurrence } from "../Stage";
import { Stage } from "../Stage";
import { ScreenType } from "./BaseScreen";
import { Box, Typography } from "@mui/material";
import { ArrowBackRounded, ArrowForwardRounded, EventAvailable, EventBusy, MenuRounded, Settings, TodayRounded } from "@mui/icons-material";
import { AnimatePresence, motion } from "framer-motion";
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
const CALENDAR_ROW_COUNT = 6;
const MAX_EVENT_LINES_PER_DAY = 3;

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

const formatRecurrenceSummary = (recurrence?: CalendarEventRecurrence | null) => {
    if (!recurrence) {
        return "";
    }

    const interval = Math.max(1, Number(recurrence.interval) || 1);
    const unit = recurrence.frequency === "daily"
        ? (interval === 1 ? "day" : "days")
        : recurrence.frequency === "weekly"
            ? (interval === 1 ? "week" : "weeks")
            : (interval === 1 ? "month" : "months");
    return `Repeats every ${interval} ${unit} until ${formatDate(recurrence.untilDate)}`;
};

const buildMonthGrid = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const leadingDays = monthStart.getUTCDay();
    const firstGridDay = addDays(monthStart, -leadingDays);

    return Array.from({ length: CALENDAR_ROW_COUNT * 7 }, (_, index) => addDays(firstGridDay, index));
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
    const currentDateKey = save.currentDate || formatDateKey(new Date());

    const allEvents = useMemo(
        () => [...(save.upcomingEvents || [])]
            .filter((event) => (event.date || "") >= currentDateKey)
            .sort((left, right) => left.date.localeCompare(right.date)),
        [save.upcomingEvents, currentDateKey],
    );
    const upcomingEvents = useMemo(
        () => allEvents,
        [allEvents],
    );
    // In this screen, "today" is anchored to the next event date to match narrative progression.
    const todayDateKey = upcomingEvents[0]?.date || currentDateKey;
    const todayDate = parseDateKey(todayDateKey);

    const [viewMonth, setViewMonth] = useState(() => startOfMonth(todayDate));
    const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

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

    const jumpToCurrentMonth = () => {
        setViewMonth(startOfMonth(todayDate));
    };

    const changeMonth = (offset: number) => {
        const nextMonth = addMonths(viewMonth, offset);
        setViewMonth(nextMonth);
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
                    backgroundImage: `linear-gradient(130deg, var(--agenda-calendar-overlay-start) 0%, var(--agenda-calendar-overlay-mid) 48%, var(--agenda-calendar-overlay-end) 100%), url(${CALENDAR_BACKGROUND_IMAGE})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
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

                    <GlassPanel variant="bright" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                            <Typography
                                sx={{
                                    color: "var(--agenda-primary)",
                                    fontFamily: "var(--agenda-font-flavor)",
                                    fontWeight: 700,
                                    fontSize: { xs: "2rem", md: "3rem" },
                                    letterSpacing: "0.04em",
                                    lineHeight: 1,
                                    textShadow: "0 3px 14px rgba(0, 0, 0, 0.24)",
                                }}
                            >
                                {formatMonthLabel(viewMonth)}
                            </Typography>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, opacity: 0.82 }}>
                                <Button
                                    variant="secondary"
                                    onClick={() => changeMonth(-1)}
                                    onMouseEnter={() => setTooltip("Previous month", ArrowBackRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <ArrowBackRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={jumpToCurrentMonth}
                                    onMouseEnter={() => setTooltip("Jump to current month", TodayRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <TodayRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => changeMonth(1)}
                                    onMouseEnter={() => setTooltip("Next month", ArrowForwardRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <ArrowForwardRounded fontSize="small" />
                                </Button>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                                gap: 0,
                                border: "1px solid var(--agenda-calendar-card-border)",
                                borderBottom: 0,
                                borderRadius: "12px 12px 0 0",
                                overflow: "hidden",
                            }}
                        >
                            {WEEKDAY_LABELS.map((label) => (
                                <Typography
                                    key={label}
                                    sx={{
                                        color: "var(--agenda-inactive)",
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                        fontSize: "0.68rem",
                                        textAlign: "center",
                                        py: 0.85,
                                        borderRight: "1px solid var(--agenda-calendar-card-border)",
                                        background: "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015))",
                                        "&:last-of-type": {
                                            borderRight: 0,
                                        },
                                    }}
                                >
                                    {label}
                                </Typography>
                            ))}
                        </Box>

                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                                gridTemplateRows: `repeat(${CALENDAR_ROW_COUNT}, minmax(0, 1fr))`,
                                gap: 0,
                                flex: 1,
                                minHeight: 0,
                                border: "1px solid var(--agenda-calendar-card-border)",
                                borderTop: 0,
                                borderRadius: "0 0 12px 12px",
                                overflow: "hidden",
                                background: "var(--agenda-calendar-card-bg)",
                            }}
                        >
                            {monthGrid.map((cellDate) => {
                                const dateKey = formatDateKey(cellDate);
                                const isCurrentMonth = cellDate.getUTCMonth() === viewMonth.getUTCMonth();
                                const isToday = isSameDate(cellDate, todayDate);
                                const cellEvents = eventsByDate.get(dateKey) || [];

                                return (
                                    <motion.div
                                        key={dateKey}
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
                                                borderRight: "1px solid var(--agenda-calendar-card-border)",
                                                borderBottom: "1px solid var(--agenda-calendar-card-border)",
                                                borderRadius: 0,
                                                borderTop: 0,
                                                borderLeft: 0,
                                                background: isCurrentMonth
                                                    ? "linear-gradient(178deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.005))"
                                                    : "rgba(0, 0, 0, 0.2)",
                                                opacity: isCurrentMonth ? 1 : 0.5,
                                                boxShadow: isToday
                                                    ? "inset 0 0 0 2px rgba(137, 205, 135, 0.42)"
                                                    : "none",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 0.5,
                                                padding: "10px",
                                                overflow: "hidden",
                                                position: "relative",
                                            }}
                                        >
                                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
                                                <Typography
                                                    sx={{
                                                        color: isToday ? "var(--agenda-active)" : "var(--agenda-primary)",
                                                        fontWeight: 700,
                                                        fontSize: { xs: "0.82rem", md: "0.92rem" },
                                                    }}
                                                >
                                                    {cellDate.getUTCDate()}
                                                </Typography>
                                                {isToday && (
                                                    <Typography sx={{ color: "var(--agenda-active)", fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                                                        Today
                                                    </Typography>
                                                )}
                                            </Box>

                                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, overflow: "hidden" }}>
                                                {cellEvents.slice(0, MAX_EVENT_LINES_PER_DAY).map((eventItem) => {
                                                    const participants = (eventItem.actorIds || eventItem.participantActorIds || [])
                                                        .map((actorId) => save.actors[actorId])
                                                        .filter(Boolean) as Actor[];
                                                    const leadActor = participants[0];

                                                    return (
                                                        <motion.button
                                                            key={eventItem.id}
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                setDetailEvent(eventItem);
                                                            }}
                                                            onMouseEnter={() => setTooltip(`View event: ${eventItem.name}`, EventAvailable)}
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
                                                                    position: "relative",
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    backgroundColor: `${leadActor?.themeColor || "#8ab0cc"}22`,
                                                                    border: `1px solid ${leadActor?.themeColor || "rgba(138, 176, 204, 0.48)"}`,
                                                                    borderRadius: "7px",
                                                                    padding: "4px 8px",
                                                                    minHeight: "30px",
                                                                    overflow: "hidden",
                                                                }}
                                                            >
                                                                <Box
                                                                    sx={{
                                                                        position: "absolute",
                                                                        right: 6,
                                                                        top: "50%",
                                                                        transform: "translateY(-50%)",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        pointerEvents: "none",
                                                                        zIndex: 1,
                                                                    }}
                                                                >
                                                                    {participants.slice(0, 4).map((actor, index) => (
                                                                        <Box
                                                                            key={`${eventItem.id}-${actor.id}`}
                                                                            sx={{
                                                                                width: 20,
                                                                                height: 20,
                                                                                marginLeft: index === 0 ? 0 : -0.9,
                                                                                borderRadius: "50%",
                                                                                border: "1px solid rgba(237, 242, 242, 0.44)",
                                                                                backgroundImage: `url(${getEmotionImage(actor, "neutral", stageInstance, actor.outfitId) || getEmotionImage(actor, "base", stageInstance, actor.outfitId)})`,
                                                                                backgroundSize: "cover",
                                                                                backgroundPosition: "top center",
                                                                                backgroundColor: "rgba(12, 18, 28, 0.88)",
                                                                                boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)",
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </Box>

                                                                <Typography
                                                                    sx={{
                                                                        position: "relative",
                                                                        zIndex: 2,
                                                                        color: "rgba(240, 246, 246, 0.98)",
                                                                        fontSize: "0.72rem",
                                                                        fontWeight: 700,
                                                                        letterSpacing: "0.01em",
                                                                        whiteSpace: "nowrap",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        paddingRight: "48px",
                                                                        width: "100%",
                                                                        fontFamily: leadActor?.themeFontFamily || "inherit",
                                                                        textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
                                                                        WebkitTextStroke: `0.6px ${leadActor?.themeColor || "rgba(12, 18, 28, 0.95)"}`,
                                                                    }}
                                                                >
                                                                    {eventItem.recurrence ? "↻ " : ""}{eventItem.name}
                                                                </Typography>
                                                            </Box>
                                                        </motion.button>
                                                    );
                                                })}
                                            </Box>
                                        </Box>
                                    </motion.div>
                                );
                            })}
                        </Box>
                    </GlassPanel>
            </Box>

            <AnimatePresence>
                {detailEvent && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setDetailEvent(null)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(9, 14, 24, 0.62)",
                            backdropFilter: "blur(5px)",
                            zIndex: 1200,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "16px",
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 18, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.97 }}
                            transition={{ duration: 0.24, ease: "easeOut" }}
                            onClick={(event) => event.stopPropagation()}
                            style={{ width: "min(720px, 92vw)" }}
                        >
                            <GlassPanel variant="bright" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
                                    <Box>
                                        <Typography sx={{ color: "#edf2f2", fontWeight: 700, fontSize: { xs: "1rem", md: "1.2rem" } }}>
                                            {detailEvent.name}
                                        </Typography>
                                        <Typography sx={{ color: "rgba(185, 210, 227, 0.9)", fontSize: "0.88rem" }}>
                                            {formatDate(detailEvent.date)} · {save.atlas[detailEvent.locationId]?.name || "Unknown Location"}
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ color: "var(--agenda-active)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.72rem" }}>
                                        Potential Event
                                    </Typography>
                                </Box>

                                <Typography sx={{ color: "#edf2f2", lineHeight: 1.55 }}>
                                    {detailEvent.description}
                                </Typography>

                                {detailEvent.recurrence && (
                                    <Typography sx={{ color: "rgba(185, 210, 227, 0.9)", fontSize: "0.84rem", letterSpacing: "0.02em" }}>
                                        {formatRecurrenceSummary(detailEvent.recurrence)}
                                    </Typography>
                                )}

                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                                    {(detailEvent.actorIds || detailEvent.participantActorIds || []).map((actorId) => {
                                        const actor = save.actors[actorId];
                                        if (!actor) {
                                            return null;
                                        }

                                        return (
                                            <Box
                                                key={`${detailEvent.id}-${actor.id}`}
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
                                                        backgroundImage: `url(${getEmotionImage(actor, "neutral", stageInstance, actor.outfitId)})`,
                                                        backgroundSize: "cover",
                                                        backgroundPosition: "top center",
                                                    }}
                                                />
                                                <Typography sx={{ color: "rgba(237, 242, 242, 0.96)", fontSize: "0.8rem" }}>{actor.name}</Typography>
                                            </Box>
                                        );
                                    })}
                                </Box>

                                <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
                                    {detailEvent.date === todayDateKey && (
                                        <Button
                                            variant="primary"
                                            onClick={() => openEvent(detailEvent.id)}
                                            onMouseEnter={() => setTooltip(`Open event: ${detailEvent.name}`, EventAvailable)}
                                            onMouseLeave={clearTooltip}
                                            style={{ padding: "10px 14px" }}
                                        >
                                            Confirm
                                        </Button>
                                    )}
                                    <Button
                                        variant="secondary"
                                        onClick={() => setDetailEvent(null)}
                                        style={{ padding: "10px 14px" }}
                                    >
                                        Back
                                    </Button>
                                </Box>
                            </GlassPanel>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {showContentManagement && (
                <ContentManagementScreen
                    stage={stage}
                    onClose={() => setShowContentManagement(false)}
                />
            )}
        </>
    );
};
