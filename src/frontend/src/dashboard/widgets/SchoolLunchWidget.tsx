import {
  localIsoDate,
  todaysMenu,
  weekdayName,
  monthDay,
  weekLineCount,
  type SchoolLunchDay,
} from "./school-lunch-utils";

interface SchoolLunchWidgetProps {
  config: {
    school_id?: string;
    school_name?: string;
    meal_type?: string;
    view?: string;
  };
  data?: Record<string, unknown> | null;
}

function TodayView({ day, mealType }: { day: SchoolLunchDay; mealType: string }) {
  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <div
        className="uppercase tracking-widest opacity-70 shrink-0"
        style={{ fontSize: "clamp(0.625em, 3.5cqi, 0.875em)" }}
      >
        Today&apos;s {mealType}
      </div>
      <div
        className="flex-1 flex flex-col items-center justify-center text-center min-h-0"
        style={{ fontSize: "clamp(1em, 7cqi, 1.75em)" }}
      >
        {day.entrees.map((entree, i) => (
          <div key={entree} className="min-h-0">
            {i > 0 && (
              <div
                className="opacity-50 uppercase tracking-widest my-[0.3em]"
                style={{ fontSize: "0.45em" }}
              >
                or
              </div>
            )}
            <div className="font-medium leading-tight">{entree}</div>
          </div>
        ))}
      </div>
      {day.vegetables.length > 0 && (
        <div
          className="opacity-70 border-t border-current/10 pt-2 shrink-0 text-center"
          style={{ fontSize: "clamp(0.625em, 3cqi, 0.875em)" }}
        >
          {day.vegetables.join(" · ")}
        </div>
      )}
    </div>
  );
}

function WeekView({
  days,
  mealType,
  now,
}: {
  days: SchoolLunchDay[];
  mealType: string;
  now: Date;
}) {
  const today = localIsoDate(now);
  const containsToday = days.some((d) => d.date === today);
  const heading = containsToday
    ? `${mealType} This Week`
    : `${mealType} · Week of ${monthDay(days[0].date)}`;

  return (
    // container-type: size makes cqb resolve to the widget's height below
    // (the dashboard's @container wrapper only tracks inline size).
    <div className="h-full flex flex-col p-4 overflow-hidden" style={{ containerType: "size" }}>
      <div
        className="uppercase tracking-widest opacity-70 shrink-0 mb-2"
        style={{ fontSize: "clamp(0.625em, 3.5cqi, 0.875em)" }}
      >
        {heading}
      </div>
      {/* Font scales with widget width, but is capped by height / line count so a
          dense week shrinks to fit instead of overflowing (0.55em floor, then clip). */}
      <div
        className="flex-1 flex flex-col justify-evenly min-h-0 gap-1"
        style={{
          fontSize: `clamp(0.55em, min(3.5cqi, (100cqb - 64px) / ${(1.7 * weekLineCount(days)).toFixed(1)}), 1.125em)`,
        }}
      >
        {days.map((day) => {
          const isToday = day.date === today;
          return (
            <div
              key={day.date}
              className={[
                "flex items-baseline gap-3 rounded-md px-2 py-1",
                isToday ? "bg-current/10 font-medium" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "w-[5.5em] shrink-0",
                  isToday ? "opacity-100" : "opacity-70",
                ].join(" ")}
              >
                {weekdayName(day.date)}
              </span>
              <div className="leading-snug min-w-0">
                {day.entrees.length > 0 ? (
                  day.entrees.map((entree) => <div key={entree}>{entree}</div>)
                ) : (
                  <span className="opacity-50">No school</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SchoolLunchWidget({ config, data }: SchoolLunchWidgetProps) {
  const mealType = config.meal_type ?? "Lunch";

  if (!config.school_id) {
    return (
      <div className="h-full flex items-center justify-center opacity-50 text-d-lg p-4 text-center">
        Select a school in widget settings
      </div>
    );
  }

  const days = (data?.days as SchoolLunchDay[] | undefined) ?? [];
  if (days.length === 0) {
    return (
      <div className="h-full flex items-center justify-center opacity-50 text-d-lg">
        Waiting for data...
      </div>
    );
  }

  const now = new Date();

  if (config.view === "week") {
    return <WeekView days={days} mealType={mealType} now={now} />;
  }

  const day = todaysMenu(days, now);
  if (!day) {
    return (
      <div className="h-full flex items-center justify-center opacity-50 text-d-lg p-4 text-center">
        No {mealType.toLowerCase()} menu today
      </div>
    );
  }

  return <TodayView day={day} mealType={mealType} />;
}
