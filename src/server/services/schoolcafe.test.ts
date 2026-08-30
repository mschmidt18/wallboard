import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  menuWeekStart,
  fetchSchoolLunchMenu,
  lookupDistrict,
  fetchServingLines,
  SchoolCafeError,
} from './schoolcafe.js'

const SCHOOL_ID = '713e04d1-4e25-4a17-bca3-52827c6f5953'

// Shape matches GetWeeklyMenuitemsByGrade: date keys are unpadded M/D/YYYY,
// values are category -> item arrays. Keys deliberately out of order to
// exercise sorting.
const MOCK_WEEKLY_RESPONSE = {
  '9/1/2026': {
    ENTREES: [
      { MenuItemDescription: 'Black Bean and Cheddar Burrito' },
      { MenuItemDescription: 'Chicken and Cheese Quesadilla' },
    ],
    VEGETABLES: [
      { MenuItemDescription: 'Side Salad' },
      { MenuItemDescription: 'Mild Salsa' },
    ],
    FRUITS: [{ MenuItemDescription: 'Fresh Apple ' }],
    MILK: [{ MenuItemDescription: '1% Milk' }],
    CONDIMENTS: [{ MenuItemDescription: 'Ketchup' }],
  },
  '8/31/2026': {
    ENTREES: [
      { MenuItemDescription: 'Turkey Corn Dog' },
      { MenuItemDescription: 'Chicken & Gravy over Fresh Baked Biscuit' },
    ],
    VEGETABLES: [
      { MenuItemDescription: 'Mashed Potatoes ' },
      { MenuItemDescription: 'Steamed Corn' },
    ],
  },
  '9/4/2026': {
    ENTREES: [
      { MenuItemDescription: 'A menu has not been published for this day.' },
    ],
    VEGETABLES: [],
  },
}

describe('menuWeekStart', () => {
  it('returns Monday of the current week on a weekday', () => {
    expect(menuWeekStart(new Date('2026-09-02T08:00:00'))).toBe('08/31/2026')
  })

  it('returns the same day on a Monday', () => {
    expect(menuWeekStart(new Date('2026-08-31T08:00:00'))).toBe('08/31/2026')
  })

  it('returns next Monday on a Saturday', () => {
    expect(menuWeekStart(new Date('2026-09-05T08:00:00'))).toBe('09/07/2026')
  })

  it('returns next Monday on a Sunday', () => {
    expect(menuWeekStart(new Date('2026-09-06T08:00:00'))).toBe('09/07/2026')
  })
})

describe('fetchSchoolLunchMenu', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns normalized days sorted by date with ISO dates and trimmed names', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_WEEKLY_RESPONSE),
    })

    const menu = await fetchSchoolLunchMenu(
      { school_id: SCHOOL_ID, grade: '01', meal_type: 'Lunch', serving_line: 'Regular' },
      new Date('2026-09-02T08:00:00'),
    )

    expect(menu.days.map((d) => d.date)).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-04',
    ])
    expect(menu.days[0].entrees).toEqual([
      'Turkey Corn Dog',
      'Chicken & Gravy over Fresh Baked Biscuit',
    ])
    expect(menu.days[0].vegetables).toEqual(['Mashed Potatoes', 'Steamed Corn'])
    expect(menu.days[1].entrees).toEqual([
      'Black Bean and Cheddar Burrito',
      'Chicken and Cheese Quesadilla',
    ])

    // Requests the week starting Monday with correct params
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = new URL(call[0])
    expect(url.pathname).toBe('/api/CalendarView/GetWeeklyMenuitemsByGrade')
    expect(url.searchParams.get('SchoolId')).toBe(SCHOOL_ID)
    expect(url.searchParams.get('ServingDate')).toBe('08/31/2026')
    expect(url.searchParams.get('ServingLine')).toBe('Regular')
    expect(url.searchParams.get('MealType')).toBe('Lunch')
    expect(url.searchParams.get('Grade')).toBe('01')
  })

  it('turns unpublished-menu placeholder days into empty days', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_WEEKLY_RESPONSE),
    })

    const menu = await fetchSchoolLunchMenu(
      { school_id: SCHOOL_ID, grade: '01', meal_type: 'Lunch', serving_line: 'Regular' },
      new Date('2026-09-02T08:00:00'),
    )

    const friday = menu.days.find((d) => d.date === '2026-09-04')
    expect(friday).toEqual({ date: '2026-09-04', entrees: [], vegetables: [] })
  })

  it('throws on API error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(
      fetchSchoolLunchMenu(
        { school_id: SCHOOL_ID, grade: '01', meal_type: 'Lunch', serving_line: 'Regular' },
        new Date('2026-09-02T08:00:00'),
      ),
    ).rejects.toThrow('SchoolCafe API error: 500')
  })
})

describe('lookupDistrict', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns district, schools, and grades', async () => {
    globalThis.fetch = vi.fn().mockImplementation((input: string) => {
      const url = new URL(input)
      let body: unknown
      if (url.pathname === '/api/GetISDByShortName') {
        expect(url.searchParams.get('shortname')).toBe('ElizabethtownAreaSD')
        body = [{ ISDId: 550, ISDName: 'ELIZABETHTOWN AREA SCHOOL DISTRICT' }]
      } else if (url.pathname === '/api/GetSchoolsList') {
        expect(url.searchParams.get('districtId')).toBe('550')
        body = [
          { SchoolId: SCHOOL_ID, SchoolName: 'BAINBRIDGE EL SCH', SiteTypeDescription: 'Elementary' },
          { SchoolId: 'other-guid', SchoolName: 'ELIZABETHTOWN AREA SHS', SiteTypeDescription: 'High' },
        ]
      } else if (url.pathname === '/api/GetGradesByDistrictId') {
        expect(url.searchParams.get('isdId')).toBe('550')
        body = ['01', '02', 'KG']
      } else {
        throw new Error(`Unexpected URL: ${input}`)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
    })

    const result = await lookupDistrict('ElizabethtownAreaSD')

    expect(result).toEqual({
      district_id: 550,
      district_name: 'ELIZABETHTOWN AREA SCHOOL DISTRICT',
      schools: [
        { id: SCHOOL_ID, name: 'BAINBRIDGE EL SCH', type: 'Elementary' },
        { id: 'other-guid', name: 'ELIZABETHTOWN AREA SHS', type: 'High' },
      ],
      grades: ['01', '02', 'KG'],
    })
  })

  it('throws SchoolCafeError when the district is not found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })

    await expect(lookupDistrict('NoSuchDistrict')).rejects.toThrow(SchoolCafeError)
    await expect(lookupDistrict('NoSuchDistrict')).rejects.toThrow('District not found')
  })

  it('throws on API error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })

    await expect(lookupDistrict('ElizabethtownAreaSD')).rejects.toThrow(
      'SchoolCafe API error: 503',
    )
  })
})

describe('fetchServingLines', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns serving line descriptions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { ServingLineDescription: 'Regular' },
          { ServingLineDescription: 'Line B' },
        ]),
    })

    const lines = await fetchServingLines(SCHOOL_ID, 'Lunch', new Date('2026-09-02T08:00:00'))

    expect(lines).toEqual(['Regular', 'Line B'])

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = new URL(call[0])
    expect(url.pathname).toBe('/api/GetServiceLine')
    expect(url.searchParams.get('schoolid')).toBe(SCHOOL_ID)
    expect(url.searchParams.get('mealtype')).toBe('Lunch')
    expect(url.searchParams.get('startdate')).toBe('09/02/2026')
    expect(url.searchParams.get('enddate')).toBe('09/02/2026')
  })

  it('throws on API error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(fetchServingLines(SCHOOL_ID, 'Lunch')).rejects.toThrow(
      'SchoolCafe API error: 500',
    )
  })
})
