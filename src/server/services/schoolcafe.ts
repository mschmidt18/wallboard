const SCHOOLCAFE_BASE = 'https://webapis.schoolcafe.com/api'

const UNPUBLISHED_PATTERN = /menu has not been published/i

export class SchoolCafeError extends Error {}

export interface SchoolLunchDay {
  date: string // ISO YYYY-MM-DD
  entrees: string[]
  vegetables: string[]
}

export interface SchoolLunchMenu {
  days: SchoolLunchDay[]
}

export interface SchoolLunchParams {
  school_id: string
  grade: string
  meal_type: string
  serving_line: string
}

/**
 * Derive fetch params from a school_lunch widget config, applying defaults.
 * Returns null when the widget is not configured yet (no school selected).
 */
export function schoolLunchSourceParams(
  config: Record<string, unknown>,
): SchoolLunchParams | null {
  const schoolId = config.school_id as string | undefined
  if (!schoolId) return null
  return {
    school_id: schoolId,
    grade: (config.grade as string) ?? '01',
    meal_type: (config.meal_type as string) ?? 'Lunch',
    serving_line: (config.serving_line as string) ?? 'Regular',
  }
}

export function schoolLunchCacheKey(params: SchoolLunchParams): string {
  return `school_lunch_${params.school_id}_${params.grade}_${params.meal_type}_${params.serving_line}`
}

export interface DistrictLookup {
  district_id: number
  district_name: string
  schools: { id: string; name: string; type: string }[]
  grades: string[]
}

interface MenuItem {
  MenuItemDescription?: string
}

type WeeklyResponse = Record<string, Record<string, MenuItem[]>>

function formatApiDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${date.getFullYear()}`
}

/** Parse the API's unpadded M/D/YYYY date keys into ISO YYYY-MM-DD. */
function parseApiDate(key: string): string {
  const [m, d, y] = key.split('/')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/**
 * The Monday to fetch the menu week from, as MM/DD/YYYY.
 * On weekends the current week's menu is over, so use next Monday.
 */
export function menuWeekStart(now: Date): string {
  const date = new Date(now)
  const day = date.getDay()
  if (day === 0) {
    date.setDate(date.getDate() + 1) // Sunday -> next Monday
  } else if (day === 6) {
    date.setDate(date.getDate() + 2) // Saturday -> next Monday
  } else {
    date.setDate(date.getDate() - (day - 1)) // back to Monday
  }
  return formatApiDate(date)
}

async function schoolCafeGet(path: string, params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams(params)
  const response = await fetch(`${SCHOOLCAFE_BASE}/${path}?${query}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`SchoolCafe API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function itemNames(items: MenuItem[] | undefined): string[] {
  return (items ?? [])
    .map((item) => (item.MenuItemDescription ?? '').trim())
    .filter((name) => name.length > 0 && !UNPUBLISHED_PATTERN.test(name))
}

export async function fetchSchoolLunchMenu(
  params: SchoolLunchParams,
  now: Date = new Date(),
): Promise<SchoolLunchMenu> {
  const raw = (await schoolCafeGet('CalendarView/GetWeeklyMenuitemsByGrade', {
    SchoolId: params.school_id,
    ServingDate: menuWeekStart(now),
    ServingLine: params.serving_line,
    MealType: params.meal_type,
    Grade: params.grade,
    PersonId: 'null',
  })) as WeeklyResponse

  const days = Object.entries(raw)
    .map(([dateKey, categories]) => ({
      date: parseApiDate(dateKey),
      entrees: itemNames(categories.ENTREES),
      vegetables: itemNames(categories.VEGETABLES),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { days }
}

export async function lookupDistrict(shortName: string): Promise<DistrictLookup> {
  const districts = (await schoolCafeGet('GetISDByShortName', {
    shortname: shortName,
  })) as { ISDId: number; ISDName: string }[]

  if (districts.length === 0) {
    throw new SchoolCafeError('District not found')
  }
  const district = districts[0]

  const [schools, grades] = await Promise.all([
    schoolCafeGet('GetSchoolsList', { districtId: String(district.ISDId) }) as Promise<
      { SchoolId: string; SchoolName: string; SiteTypeDescription: string }[]
    >,
    schoolCafeGet('GetGradesByDistrictId', { isdId: String(district.ISDId) }) as Promise<string[]>,
  ])

  return {
    district_id: district.ISDId,
    district_name: district.ISDName,
    schools: schools.map((s) => ({
      id: s.SchoolId,
      name: s.SchoolName,
      type: s.SiteTypeDescription,
    })),
    grades,
  }
}

export async function fetchServingLines(
  schoolId: string,
  mealType: string,
  now: Date = new Date(),
): Promise<string[]> {
  const today = formatApiDate(now)
  const lines = (await schoolCafeGet('GetServiceLine', {
    schoolid: schoolId,
    startdate: today,
    enddate: today,
    mealtype: mealType,
  })) as { ServingLineDescription: string }[]

  return lines.map((line) => line.ServingLineDescription)
}
