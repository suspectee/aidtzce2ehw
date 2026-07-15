export type LanguageId = 'javascript' | 'typescript' | 'python' | 'html' | 'css' | 'json'

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface Participant {
  clientId: string
  name: string
  color: string
}

export interface OutputLine {
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export interface RunnerResult {
  lines: OutputLine[]
  duration: number | null
  status: 'idle' | 'running' | 'success' | 'error' | 'timeout'
  statusText: string
}
