import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../shared/api";

interface Props {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

interface School {
  id: string;
  name: string;
  type: string;
}

const MEAL_TYPES = ["Lunch", "Breakfast"] as const;
const VIEW_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
] as const;

export default function SchoolLunchConfig({ config, onChange }: Props) {
  const [district, setDistrict] = useState<string>(
    (config.district_short_name as string | undefined) ?? "",
  );
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [districtName, setDistrictName] = useState<string | null>(null);
  const [servingLines, setServingLines] = useState<string[]>([]);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const schoolId = (config.school_id as string | undefined) ?? "";
  const grade = (config.grade as string | undefined) ?? "01";
  const mealType = (config.meal_type as string | undefined) ?? "Lunch";
  const servingLine = (config.serving_line as string | undefined) ?? "Regular";
  const view = (config.view as string | undefined) ?? "today";

  // emit is only called from event handlers, so it can close over the
  // current config prop directly.
  const emit = useCallback(
    (patch: Record<string, unknown>) => {
      onChange({ ...config, ...patch });
    },
    [config, onChange],
  );

  const lookup = useCallback(
    async (shortName: string) => {
      if (!shortName.trim()) return;
      setLooking(true);
      setLookupError(null);
      try {
        const result = await api.schoolCafeLookup(shortName.trim());
        setSchools(result.schools);
        setGrades(result.grades);
        setDistrictName(result.district_name);
      } catch (err) {
        setLookupError(err instanceof Error ? err.message : "Lookup failed");
        setSchools([]);
        setGrades([]);
        setDistrictName(null);
      } finally {
        setLooking(false);
      }
    },
    [],
  );

  // Populate the school list on mount when a district is already saved.
  const initialDistrict = useRef(district);
  useEffect(() => {
    if (initialDistrict.current) {
      void lookup(initialDistrict.current);
    }
  }, [lookup]);

  // Serving lines depend on the selected school and meal type.
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    api
      .schoolCafeServingLines(schoolId, mealType)
      .then((result) => {
        if (!cancelled && result.serving_lines.length > 0) {
          setServingLines(result.serving_lines);
        }
      })
      .catch(() => {
        // Keep the current value usable even if the lookup fails
        if (!cancelled) setServingLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, mealType]);

  function handleLookupClick() {
    emit({ district_short_name: district.trim() });
    void lookup(district);
  }

  function handleSchoolChange(id: string) {
    const school = schools.find((s) => s.id === id);
    emit({ school_id: id, school_name: school?.name ?? "" });
  }

  const lineOptions = servingLines.length > 0 ? servingLines : [servingLine];

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="lunch-district" className="block text-sm font-medium text-gray-700 mb-1">
          SchoolCafé district name
        </label>
        <div className="flex gap-2">
          <input
            id="lunch-district"
            type="text"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            placeholder="e.g. ElizabethtownAreaSD"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleLookupClick}
            disabled={looking || !district.trim()}
            className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {looking ? "Looking up..." : "Look up"}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          The name at the end of your district&apos;s SchoolCafé link:
          schoolcafe.com/&lt;name&gt;
        </p>
        {districtName && (
          <p className="mt-1 text-sm text-gray-500">{districtName}</p>
        )}
        {lookupError && <p className="mt-1 text-sm text-red-600">{lookupError}</p>}
      </div>

      {(schools.length > 0 || schoolId) && (
        <div>
          <label htmlFor="lunch-school" className="block text-sm font-medium text-gray-700 mb-1">
            School
          </label>
          <select
            id="lunch-school"
            value={schoolId}
            onChange={(e) => handleSchoolChange(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            {schools.length === 0 && schoolId && (
              <option value={schoolId}>{(config.school_name as string) ?? schoolId}</option>
            )}
            {!schoolId && <option value="">Select a school...</option>}
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {schoolId && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lunch-grade" className="block text-sm font-medium text-gray-700 mb-1">
                Grade
              </label>
              <select
                id="lunch-grade"
                value={grade}
                onChange={(e) => emit({ grade: e.target.value })}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                {grades.length === 0 && <option value={grade}>{grade}</option>}
                {grades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="lunch-meal" className="block text-sm font-medium text-gray-700 mb-1">
                Meal
              </label>
              <select
                id="lunch-meal"
                value={mealType}
                onChange={(e) => emit({ meal_type: e.target.value })}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                {MEAL_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {lineOptions.length > 1 && (
            <div>
              <label htmlFor="lunch-line" className="block text-sm font-medium text-gray-700 mb-1">
                Serving line
              </label>
              <select
                id="lunch-line"
                value={servingLine}
                onChange={(e) => emit({ serving_line: e.target.value })}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                {lineOptions.map((line) => (
                  <option key={line} value={line}>
                    {line}
                  </option>
                ))}
              </select>
            </div>
          )}

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">Show</legend>
            <div className="flex items-center gap-4">
              {VIEW_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="lunch-view"
                    value={opt.value}
                    checked={view === opt.value}
                    onChange={() => emit({ view: opt.value })}
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </div>
  );
}
