import { join } from 'path'
import { homedir } from 'os'

interface ConfigOptions {
  dbPath: string
  secretKeyPath: string
  logPath: string
  logLevel?: string
  displayRefreshInterval?: number
}

export class Config {
  readonly dbPath: string
  readonly secretKeyPath: string
  readonly logPath: string
  readonly logLevel: string
  readonly displayRefreshInterval: number

  constructor(options: ConfigOptions) {
    this.dbPath = options.dbPath
    this.secretKeyPath = options.secretKeyPath
    this.logPath = options.logPath
    this.logLevel = options.logLevel ?? 'INFO'
    this.displayRefreshInterval = options.displayRefreshInterval ?? 60
  }

  static default(): Config {
    const wallboardDir = join(homedir(), '.wallboard')
    return new Config({
      dbPath: join(wallboardDir, 'wallboard.db'),
      secretKeyPath: join(wallboardDir, 'secret.key'),
      logPath: '/var/log/wallboard/wallboard.log',
    })
  }

  static forTesting(tmpDir: string): Config {
    return new Config({
      dbPath: join(tmpDir, 'test.db'),
      secretKeyPath: join(tmpDir, 'secret.key'),
      logPath: join(tmpDir, 'wallboard.log'),
    })
  }
}
