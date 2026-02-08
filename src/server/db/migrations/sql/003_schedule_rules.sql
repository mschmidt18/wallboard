CREATE TABLE schedule_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layout_id INTEGER REFERENCES layouts(id) ON DELETE CASCADE,
  days_of_week TEXT NOT NULL DEFAULT '[]',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
