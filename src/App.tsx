import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Cloud,
  Code2,
  Copy,
  FileCode2,
  FileText,
  Info,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Play,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
  X,
} from 'lucide-react'
import { CodeEditor } from './components/CodeEditor'
import { fileNames, languageOptions } from './data'
import { useRoom } from './hooks/useRoom'
import { useRunner } from './hooks/useRunner'
import type { LanguageId } from './types'

function getRoomIdFromPath() {
  return window.location.pathname.match(/^\/room\/([a-zA-Z0-9_-]+)/)?.[1] || null
}

function createLocalRoomId() {
  return Math.random().toString(36).slice(2, 10)
}

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':')
}

function InitializingRoom() {
  return (
    <main className="initializing-screen">
      <div className="initializing-mark">
        <Braces size={24} strokeWidth={2.2} />
      </div>
      <p>Preparing your interview room</p>
      <div className="loading-track"><span /></div>
    </main>
  )
}

function Avatar({ name, color, own = false }: { name: string; color: string; own?: boolean }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div className="avatar-wrap" title={own ? `${name} (you)` : name}>
      <span className="avatar" style={{ background: color }}>{initials}</span>
      <span className="avatar-online" />
    </div>
  )
}

function Workspace({ roomId }: { roomId: string }) {
  const room = useRoom(roomId)
  const { result, run, clear } = useRunner()
  const [activePanel, setActivePanel] = useState<'output' | 'tests'>('output')
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [elapsed, setElapsed] = useState(0)
  const [showShare, setShowShare] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)
  const selectedLanguage = languageOptions.find((option) => option.id === room.language)!

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(event.target as Node)) setShowShare(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const connectionLabel = {
    connected: 'Live',
    connecting: 'Connecting',
    reconnecting: 'Reconnecting',
    offline: 'Offline',
  }[room.connection]

  const displayedParticipants = useMemo(() => {
    if (room.participants.length > 0) return room.participants
    return [{ clientId: room.clientId, name: 'You', color: '#e46d3c' }]
  }, [room.clientId, room.participants])

  const copyLink = async () => {
    const url = `${window.location.origin}/room/${roomId}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const runCode = () => {
    setActivePanel('output')
    run(room.language, room.code)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open interview brief">
            <Menu size={19} />
          </button>
          <a className="brand" href="/" aria-label="Pairwise home">
            <span className="brand-mark"><Braces size={19} strokeWidth={2.4} /></span>
            <span className="brand-name">pairwise</span>
          </a>
          <span className="topbar-divider" />
          <div className="interview-name">
            <span>{room.title}</span>
            <span className="room-code">#{roomId.slice(0, 6)}</span>
          </div>
        </div>

        <div className="topbar-right">
          <div className={`connection-pill ${room.connection}`}>
            <span className="connection-dot" />
            {connectionLabel}
          </div>
          <div className="session-time" title="Session duration">
            <Clock3 size={15} />
            <span>{formatTime(elapsed)}</span>
          </div>
          <div className="avatar-stack">
            {displayedParticipants.slice(0, 3).map((participant) => (
              <Avatar
                key={participant.clientId}
                name={participant.name}
                color={participant.color}
                own={participant.clientId === room.clientId}
              />
            ))}
          </div>
          <div className="share-area" ref={shareRef}>
            <button className="share-button" onClick={() => setShowShare((visible) => !visible)}>
              <Share2 size={16} />
              Invite
            </button>
            {showShare && (
              <div className="share-popover">
                <div className="share-popover-heading">
                  <span className="share-icon"><Users size={18} /></span>
                  <div>
                    <strong>Invite to this room</strong>
                    <p>Anyone with the link can join and edit.</p>
                  </div>
                </div>
                <label>Shareable interview link</label>
                <button className="copy-link" onClick={copyLink}>
                  <span>{window.location.origin.replace(/^https?:\/\//, '')}/room/{roomId}</span>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <div className="share-security"><ShieldCheck size={14} /> Code runs only in each participant’s browser</div>
              </div>
            )}
          </div>
          <button className="icon-button more-button" aria-label="More options"><MoreHorizontal size={19} /></button>
        </div>
      </header>

      <div className="workspace">
        {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}
        <aside className={`brief-panel ${sidebarOpen ? 'open' : ''}`}>
          <div className="brief-header">
            <div>
              <span className="eyebrow">INTERVIEW KIT</span>
              <h2>Product events</h2>
            </div>
            <button className="icon-button close-sidebar" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
          </div>

          <nav className="brief-nav" aria-label="Interview sections">
            <button className="active"><FileText size={16} /> Prompt <ArrowRight size={14} /></button>
            <button><ListChecks size={16} /> Test cases <span>3</span></button>
            <button><MessageSquareText size={16} /> Notes <LockKeyhole size={12} /></button>
          </nav>

          <div className="brief-scroll">
            <div className="challenge-meta">
              <span className="difficulty">MEDIUM</span>
              <span><Clock3 size={13} /> 35 min</span>
            </div>
            <h1>Summarize product events</h1>
            <p className="challenge-intro">
              Given a list of product events, build a summary grouped by event type.
            </p>

            <section className="brief-section">
              <h3>Expected output</h3>
              <p>For each event type, return its total occurrence count and the sum of its values.</p>
              <div className="example-card">
                <span>INPUT</span>
                <code>click: 12, view: 4, click: 8</code>
                <span>OUTPUT</span>
                <code>{`click → { count: 2, total: 20 }\nview  → { count: 1, total: 4 }`}</code>
              </div>
            </section>

            <section className="brief-section">
              <h3>Requirements</h3>
              <ul className="requirement-list">
                <li><CheckCircle2 size={15} /> Return an empty object for no events</li>
                <li><CheckCircle2 size={15} /> Support positive and negative values</li>
                <li><CheckCircle2 size={15} /> Avoid mutating the input array</li>
              </ul>
            </section>

            <div className="hint-card">
              <Sparkles size={16} />
              <div><strong>Interviewer prompt</strong><p>Ask how they would handle millions of events arriving as a stream.</p></div>
            </div>
          </div>

          <div className="brief-footer">
            <BookOpen size={15} /> Interview guide
            <ChevronDown size={14} />
          </div>
        </aside>

        <main className="editor-panel">
          <div className="editor-toolbar">
            <div className="file-crumb">
              <FileCode2 size={16} />
              <span>workspace</span>
              <span className="slash">/</span>
              <strong>{fileNames[room.language]}</strong>
              {room.connection === 'connected' && <span className="saved-indicator"><Cloud size={13} /> Synced</span>}
            </div>
            <div className="editor-actions">
              <label className="language-select">
                <span className={`language-logo ${room.language}`}>{room.language === 'python' ? 'Py' : room.language.slice(0, 2).toUpperCase()}</span>
                <select value={room.language} onChange={(event) => room.updateLanguage(event.target.value as LanguageId)}>
                  {languageOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
                </select>
                <ChevronDown size={13} />
              </label>
              <button
                className="run-button"
                onClick={runCode}
                disabled={result.status === 'running'}
                title={selectedLanguage.runnable ? `Run ${selectedLanguage.label}` : `${selectedLanguage.label} is highlight-only`}
              >
                {result.status === 'running' ? <LoaderCircle className="spin" size={16} /> : <Play size={15} fill="currentColor" />}
                {result.status === 'running' ? 'Running' : 'Run code'}
              </button>
            </div>
          </div>

          <div className="editor-surface">
            <CodeEditor
              value={room.code}
              language={room.language}
              onChange={room.updateCode}
              onCursorChange={(line, column) => setCursor({ line, column })}
            />
          </div>

          <footer className="editor-statusbar">
            <div>
              <span>Ln {cursor.line}, Col {cursor.column}</span>
              <span>Spaces: 2</span>
              <span>UTF-8</span>
            </div>
            <div>
              <span className="collab-status"><Users size={13} /> {displayedParticipants.length} in room</span>
              <span>rev {room.version}</span>
            </div>
          </footer>
        </main>

        <aside className="results-panel">
          <div className="results-tabs">
            <button className={activePanel === 'output' ? 'active' : ''} onClick={() => setActivePanel('output')}>
              <TerminalSquare size={16} /> Output
            </button>
            <button className={activePanel === 'tests' ? 'active' : ''} onClick={() => setActivePanel('tests')}>
              <ListChecks size={16} /> Test cases <span>3</span>
            </button>
            {activePanel === 'output' && result.lines.length > 0 && (
              <button className="clear-output" onClick={clear} title="Clear output"><RotateCcw size={14} /></button>
            )}
          </div>

          {activePanel === 'output' ? (
            <div className="output-view">
              <div className={`output-state ${result.status}`}>
                {result.status === 'running' ? <LoaderCircle className="spin" size={14} /> : <Circle size={8} fill="currentColor" />}
                <span>{result.statusText}</span>
                {result.duration !== null && <time>{result.duration} ms</time>}
              </div>
              {result.lines.length === 0 && result.status === 'idle' ? (
                <div className="empty-console">
                  <span className="empty-console-icon"><Code2 size={24} /></span>
                  <h3>Ready when you are</h3>
                  <p>Run the code to see console output here. Execution happens privately in your browser.</p>
                  <button onClick={runCode}><Play size={14} fill="currentColor" /> Run {selectedLanguage.label}</button>
                </div>
              ) : result.status === 'running' && result.lines.length === 0 ? (
                <div className="running-console">
                  <div className="terminal-loader"><i /><i /><i /></div>
                  <p>{result.statusText}</p>
                </div>
              ) : (
                <div className="console-lines">
                  {result.lines.map((line, index) => (
                    <div className={`console-line ${line.stream}`} key={`${line.stream}-${index}`}>
                      <span className="console-chevron">›</span>
                      <pre>{line.text}</pre>
                    </div>
                  ))}
                </div>
              )}
              <div className="sandbox-note">
                <ShieldCheck size={15} />
                <div><strong>Browser sandbox</strong><span>No server access · 5s execution limit</span></div>
              </div>
            </div>
          ) : (
            <div className="tests-view">
              <div className="tests-heading">
                <span>PUBLIC CASES</span>
                <p>Use these examples to guide the implementation.</p>
              </div>
              {[
                ['Groups repeated event types', '3 events → 2 groups'],
                ['Handles an empty event list', '[] → {}'],
                ['Supports signed values', '12 + (−3) → 9'],
              ].map(([name, detail], index) => (
                <div className="test-row" key={name}>
                  <span className="test-number">0{index + 1}</span>
                  <div><strong>{name}</strong><code>{detail}</code></div>
                  <Info size={15} />
                </div>
              ))}
              <div className="hidden-tests"><LockKeyhole size={15} /><span><strong>2 hidden cases</strong> available to the interviewer</span></div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(getRoomIdFromPath)
  const requestedRef = useRef(false)

  useEffect(() => {
    if (roomId || requestedRef.current) return
    requestedRef.current = true

    const createRoom = async () => {
      let nextRoomId = createLocalRoomId()
      try {
        const response = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Frontend Engineer · Live interview' }),
        })
        if (response.ok) nextRoomId = (await response.json()).roomId
      } catch {
        // The locally generated id still lets the workspace render while the API reconnects.
      }
      window.history.replaceState({}, '', `/room/${nextRoomId}`)
      setRoomId(nextRoomId)
    }

    void createRoom()
  }, [roomId])

  if (!roomId) return <InitializingRoom />
  return <Workspace roomId={roomId} />
}
