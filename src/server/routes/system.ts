import { execSync } from 'child_process'
import { resolve } from 'path'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth.js'
import type { VersionResponse, UpdateCheckResponse, UpdateResponse } from '@shared/types.js'

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..')

function git(...args: string[]): string | null {
  try {
    const result = execSync(['git', ...args].join(' '), {
      cwd: PROJECT_ROOT,
      timeout: 10_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.trim()
  } catch {
    return null
  }
}

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/system/version', {
    preHandler: [requireAuth],
  }, async (): Promise<VersionResponse> => {
    return {
      commit: git('rev-parse', 'HEAD'),
      commit_short: git('rev-parse', '--short', 'HEAD'),
      commit_date: git('log', '-1', '--format=%ci'),
      branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    }
  })

  app.post('/api/system/check-update', {
    preHandler: [requireAuth],
  }, async (): Promise<UpdateCheckResponse> => {
    // Fetch latest from origin
    try {
      execSync('git fetch origin', {
        cwd: PROJECT_ROOT,
        timeout: 30_000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (e) {
      return {
        up_to_date: null,
        commits_behind: null,
        commits: [],
        error: String(e),
      }
    }

    // Count commits behind
    const countStr = git('rev-list', '--count', 'HEAD..origin/main')
    if (countStr === null) {
      return {
        up_to_date: null,
        commits_behind: null,
        commits: [],
        error: 'Failed to determine commits behind',
      }
    }

    const commitsBehind = parseInt(countStr, 10)
    let commits: string[] = []

    if (commitsBehind > 0) {
      const logOutput = git('log', '--oneline', 'HEAD..origin/main')
      if (logOutput) {
        commits = logOutput.split('\n').filter((line) => line.trim())
      }
    }

    return {
      up_to_date: commitsBehind === 0,
      commits_behind: commitsBehind,
      commits,
      error: null,
    }
  })

  app.post('/api/system/update', {
    preHandler: [requireAuth],
  }, async (): Promise<UpdateResponse> => {
    const steps: [string, string][] = [
      ['git pull', 'git pull'],
      ['npm install', 'npm install'],
      ['npm build', 'npm run build'],
      ['restart service', 'systemctl restart wallboard-server'],
    ]

    const stepsCompleted: string[] = []

    for (const [stepName, cmd] of steps) {
      try {
        execSync(cmd, {
          cwd: PROJECT_ROOT,
          timeout: 120_000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        stepsCompleted.push(stepName)
      } catch {
        return {
          status: 'error',
          steps_completed: stepsCompleted,
          step_failed: stepName,
          fallback_instructions:
            'SSH into the server and run manually:\n' +
            '  cd /opt/wallboard\n' +
            '  git pull\n' +
            '  npm install\n' +
            '  npm run build\n' +
            '  sudo systemctl restart wallboard-server',
        }
      }
    }

    return {
      status: 'ok',
      steps_completed: stepsCompleted,
      step_failed: null,
      fallback_instructions: null,
    }
  })
}
