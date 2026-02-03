// Vitest global test setup
import { afterEach } from 'vitest'
import { clearSessions } from '../middleware/auth.js'

// Clear in-memory session store between tests to prevent leakage
afterEach(() => {
  clearSessions()
})
