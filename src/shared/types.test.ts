import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  LayoutCreateSchema,
  LayoutUpdateSchema,
  WidgetCreateSchema,
  WidgetUpdateSchema,
  WidgetPositionUpdateSchema,
  IcsCalendarCreateSchema,
  IcsCalendarUpdateSchema,
  PasswordBodySchema,
  ChangePasswordBodySchema,
  SettingsUpdateSchema,
  WIDGET_TYPES,
} from './types.js';

// --- Layout schemas ---

describe('LayoutCreateSchema', () => {
  it('accepts minimal valid data with defaults', () => {
    const data = { name: 'Dashboard' };
    const result = Value.Default(LayoutCreateSchema, data);
    expect(Value.Check(LayoutCreateSchema, result)).toBe(true);
    expect(result).toEqual({
      name: 'Dashboard',
      columns: 12,
      row_height: 80,
      theme: {},
    });
  });

  it('accepts full valid data', () => {
    const data = {
      name: 'Night Mode',
      columns: 8,
      row_height: 100,
      theme: { background: '#000', text_color: 'light' },
    };
    expect(Value.Check(LayoutCreateSchema, data)).toBe(true);
  });

  it('rejects empty name', () => {
    const data = { name: '' };
    const result = Value.Default(LayoutCreateSchema, data);
    expect(Value.Check(LayoutCreateSchema, result)).toBe(false);
  });

  it('rejects name exceeding 200 characters', () => {
    const data = { name: 'a'.repeat(201) };
    const result = Value.Default(LayoutCreateSchema, data);
    expect(Value.Check(LayoutCreateSchema, result)).toBe(false);
  });

  it('rejects columns below 1', () => {
    const data = { name: 'Test', columns: 0 };
    expect(Value.Check(LayoutCreateSchema, data)).toBe(false);
  });

  it('rejects columns above 24', () => {
    const data = { name: 'Test', columns: 25 };
    expect(Value.Check(LayoutCreateSchema, data)).toBe(false);
  });

  it('rejects row_height below 20', () => {
    const data = { name: 'Test', columns: 12, row_height: 19 };
    expect(Value.Check(LayoutCreateSchema, data)).toBe(false);
  });

  it('rejects row_height above 500', () => {
    const data = { name: 'Test', columns: 12, row_height: 501 };
    expect(Value.Check(LayoutCreateSchema, data)).toBe(false);
  });
});

describe('LayoutUpdateSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(Value.Check(LayoutUpdateSchema, {})).toBe(true);
  });

  it('accepts partial update', () => {
    expect(Value.Check(LayoutUpdateSchema, { name: 'Updated' })).toBe(true);
  });

  it('rejects empty name when provided', () => {
    expect(Value.Check(LayoutUpdateSchema, { name: '' })).toBe(false);
  });

  it('rejects invalid columns', () => {
    expect(Value.Check(LayoutUpdateSchema, { columns: 0 })).toBe(false);
    expect(Value.Check(LayoutUpdateSchema, { columns: 25 })).toBe(false);
  });
});

// --- Widget schemas ---

describe('WidgetCreateSchema', () => {
  it('accepts valid widget', () => {
    const data = {
      widget_type: 'clock',
      config: { timezone: 'America/New_York' },
      position_x: 0,
      position_y: 0,
      width: 3,
      height: 2,
    };
    expect(Value.Check(WidgetCreateSchema, data)).toBe(true);
  });

  it('rejects invalid widget_type', () => {
    const data = {
      widget_type: 'invalid',
      config: {},
      position_x: 0,
      position_y: 0,
      width: 3,
      height: 2,
    };
    expect(Value.Check(WidgetCreateSchema, data)).toBe(false);
  });

  it('accepts all valid widget types', () => {
    for (const wt of WIDGET_TYPES) {
      const data = {
        widget_type: wt,
        config: {},
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2,
      };
      expect(Value.Check(WidgetCreateSchema, data)).toBe(true);
    }
  });

  it('rejects negative position_x', () => {
    const data = {
      widget_type: 'clock',
      config: {},
      position_x: -1,
      position_y: 0,
      width: 3,
      height: 2,
    };
    expect(Value.Check(WidgetCreateSchema, data)).toBe(false);
  });

  it('rejects width below 1', () => {
    const data = {
      widget_type: 'clock',
      config: {},
      position_x: 0,
      position_y: 0,
      width: 0,
      height: 2,
    };
    expect(Value.Check(WidgetCreateSchema, data)).toBe(false);
  });

  it('rejects width above 24', () => {
    const data = {
      widget_type: 'clock',
      config: {},
      position_x: 0,
      position_y: 0,
      width: 25,
      height: 2,
    };
    expect(Value.Check(WidgetCreateSchema, data)).toBe(false);
  });

  it('rejects height above 20', () => {
    const data = {
      widget_type: 'clock',
      config: {},
      position_x: 0,
      position_y: 0,
      width: 3,
      height: 21,
    };
    expect(Value.Check(WidgetCreateSchema, data)).toBe(false);
  });
});

describe('WidgetUpdateSchema', () => {
  it('accepts empty object', () => {
    expect(Value.Check(WidgetUpdateSchema, {})).toBe(true);
  });

  it('accepts partial update', () => {
    expect(Value.Check(WidgetUpdateSchema, { config: { key: 'value' } })).toBe(true);
  });

  it('rejects invalid position', () => {
    expect(Value.Check(WidgetUpdateSchema, { position_x: -1 })).toBe(false);
  });

  it('rejects invalid dimensions', () => {
    expect(Value.Check(WidgetUpdateSchema, { width: 0 })).toBe(false);
    expect(Value.Check(WidgetUpdateSchema, { height: 21 })).toBe(false);
  });
});

describe('WidgetPositionUpdateSchema', () => {
  it('accepts valid position update', () => {
    const data = { id: 1, position_x: 5, position_y: 3, width: 4, height: 2 };
    expect(Value.Check(WidgetPositionUpdateSchema, data)).toBe(true);
  });

  it('rejects missing id', () => {
    const data = { position_x: 5, position_y: 3, width: 4, height: 2 };
    expect(Value.Check(WidgetPositionUpdateSchema, data)).toBe(false);
  });

  it('rejects negative position', () => {
    const data = { id: 1, position_x: -1, position_y: 3, width: 4, height: 2 };
    expect(Value.Check(WidgetPositionUpdateSchema, data)).toBe(false);
  });
});

// --- ICS Calendar schemas ---

describe('IcsCalendarCreateSchema', () => {
  it('accepts valid data with default color', () => {
    const data = { name: 'Work', url: 'https://example.com/cal.ics' };
    const result = Value.Default(IcsCalendarCreateSchema, data);
    expect(Value.Check(IcsCalendarCreateSchema, result)).toBe(true);
    expect(result).toHaveProperty('color', '#6366f1');
  });

  it('accepts valid hex color', () => {
    const data = { name: 'Work', url: 'https://example.com/cal.ics', color: '#ff0000' };
    expect(Value.Check(IcsCalendarCreateSchema, data)).toBe(true);
  });

  it('rejects invalid hex color', () => {
    const data = { name: 'Work', url: 'https://example.com/cal.ics', color: 'red' };
    expect(Value.Check(IcsCalendarCreateSchema, data)).toBe(false);
  });

  it('rejects empty name', () => {
    const data = { name: '', url: 'https://example.com/cal.ics' };
    expect(Value.Check(IcsCalendarCreateSchema, data)).toBe(false);
  });

  it('rejects empty url', () => {
    const data = { name: 'Work', url: '' };
    expect(Value.Check(IcsCalendarCreateSchema, data)).toBe(false);
  });

  it('rejects name exceeding 200 characters', () => {
    const data = { name: 'a'.repeat(201), url: 'https://example.com/cal.ics' };
    expect(Value.Check(IcsCalendarCreateSchema, data)).toBe(false);
  });
});

describe('IcsCalendarUpdateSchema', () => {
  it('accepts empty object', () => {
    expect(Value.Check(IcsCalendarUpdateSchema, {})).toBe(true);
  });

  it('accepts partial update', () => {
    expect(Value.Check(IcsCalendarUpdateSchema, { name: 'Updated' })).toBe(true);
  });

  it('rejects invalid hex color', () => {
    expect(Value.Check(IcsCalendarUpdateSchema, { color: 'invalid' })).toBe(false);
  });

  it('rejects empty name when provided', () => {
    expect(Value.Check(IcsCalendarUpdateSchema, { name: '' })).toBe(false);
  });
});

// --- Auth schemas ---

describe('PasswordBodySchema', () => {
  it('accepts valid password', () => {
    expect(Value.Check(PasswordBodySchema, { password: 'secret123' })).toBe(true);
  });

  it('rejects missing password', () => {
    expect(Value.Check(PasswordBodySchema, {})).toBe(false);
  });

  it('rejects empty password', () => {
    expect(Value.Check(PasswordBodySchema, { password: '' })).toBe(false);
  });
});

describe('ChangePasswordBodySchema', () => {
  it('accepts valid data', () => {
    const data = { current_password: 'old', new_password: 'new' };
    expect(Value.Check(ChangePasswordBodySchema, data)).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(Value.Check(ChangePasswordBodySchema, { current_password: 'old' })).toBe(false);
    expect(Value.Check(ChangePasswordBodySchema, { new_password: 'new' })).toBe(false);
  });
});

// --- Settings schema ---

describe('SettingsUpdateSchema', () => {
  it('accepts empty object', () => {
    expect(Value.Check(SettingsUpdateSchema, {})).toBe(true);
  });

  it('accepts valid settings', () => {
    const data = {
      google_client_id: 'test-id',
      google_client_secret: 'test-secret',
      display_refresh_interval: 30,
    };
    expect(Value.Check(SettingsUpdateSchema, data)).toBe(true);
  });

  it('accepts partial settings', () => {
    expect(Value.Check(SettingsUpdateSchema, { display_refresh_interval: 120 })).toBe(true);
  });
});
