import { useCallback, useEffect, useRef, useState } from 'react'
import { starterCode } from '../data'
import type { ConnectionState, LanguageId, Participant } from '../types'

interface RoomMessage {
  type: string
  code?: string
  language?: LanguageId
  title?: string
  version?: number
  clientId?: string
  participants?: Participant[]
}

function uniqueParticipants(participants: Participant[]) {
  return Array.from(
    new Map(participants.map((participant) => [participant.clientId, participant])).values(),
  )
}

function getClientIdentity() {
  const fallbackId = `client-${Math.random().toString(36).slice(2, 10)}`
  try {
    const existingId = sessionStorage.getItem('pairwise-client-id')
    const clientId = existingId || crypto.randomUUID()
    sessionStorage.setItem('pairwise-client-id', clientId)
    return { clientId, name: sessionStorage.getItem('pairwise-name') || 'You' }
  } catch {
    return { clientId: fallbackId, name: 'You' }
  }
}

export function useRoom(roomId: string) {
  const identityRef = useRef(getClientIdentity())
  const [code, setCode] = useState(starterCode.javascript)
  const [language, setLanguageState] = useState<LanguageId>('javascript')
  const [title, setTitle] = useState('Frontend Engineer · Live interview')
  const [version, setVersion] = useState(0)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const socketRef = useRef<WebSocket | null>(null)
  const broadcastRef = useRef<number | null>(null)
  const codeRef = useRef(code)
  const languageRef = useRef(language)
  const draftsRef = useRef<Partial<Record<LanguageId, string>>>({ javascript: code })

  const sendDocument = useCallback((nextCode: string, nextLanguage: LanguageId) => {
    if (broadcastRef.current) window.clearTimeout(broadcastRef.current)
    broadcastRef.current = window.setTimeout(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({ type: 'code:update', code: nextCode, language: nextLanguage }),
        )
      }
    }, 45)
  }, [])

  const updateCode = useCallback(
    (nextCode: string) => {
      codeRef.current = nextCode
      draftsRef.current[languageRef.current] = nextCode
      setCode(nextCode)
      sendDocument(nextCode, languageRef.current)
    },
    [sendDocument],
  )

  const updateLanguage = useCallback(
    (nextLanguage: LanguageId) => {
      if (nextLanguage === languageRef.current) return
      draftsRef.current[languageRef.current] = codeRef.current
      const nextCode = draftsRef.current[nextLanguage] ?? starterCode[nextLanguage]
      languageRef.current = nextLanguage
      codeRef.current = nextCode
      draftsRef.current[nextLanguage] = nextCode
      setLanguageState(nextLanguage)
      setCode(nextCode)
      sendDocument(nextCode, nextLanguage)
    },
    [sendDocument],
  )

  useEffect(() => {
    let disposed = false
    let attempt = 0
    let reconnectTimer: number | null = null
    let activeSocket: WebSocket | null = null

    const connect = () => {
      if (disposed) return
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const { clientId, name } = identityRef.current
      const query = new URLSearchParams({ client_id: clientId, name })
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/rooms/${roomId}?${query}`)
      activeSocket = socket
      socketRef.current = socket
      setConnection(attempt === 0 ? 'connecting' : 'reconnecting')

      socket.onopen = () => {
        if (disposed || socketRef.current !== socket) return
        attempt = 0
        setConnection('connected')
      }

      socket.onmessage = (event) => {
        if (disposed || socketRef.current !== socket) return
        const message = JSON.parse(event.data) as RoomMessage
        if (message.type === 'room:snapshot') {
          if (typeof message.code === 'string' && message.language) {
            codeRef.current = message.code
            languageRef.current = message.language
            draftsRef.current[message.language] = message.code
            setCode(message.code)
            setLanguageState(message.language)
          }
          if (message.title) setTitle(message.title)
          if (typeof message.version === 'number') setVersion(message.version)
          if (message.participants) setParticipants(uniqueParticipants(message.participants))
        }

        if (message.type === 'code:update') {
          if (typeof message.version === 'number') setVersion(message.version)
          if (
            message.clientId !== identityRef.current.clientId &&
            typeof message.code === 'string' &&
            message.language
          ) {
            codeRef.current = message.code
            languageRef.current = message.language
            draftsRef.current[message.language] = message.code
            setCode(message.code)
            setLanguageState(message.language)
          }
        }

        if (message.type === 'presence:update' && message.participants) {
          setParticipants(uniqueParticipants(message.participants))
        }
      }

      socket.onclose = () => {
        if (disposed || socketRef.current !== socket) return
        attempt += 1
        setConnection(attempt > 3 ? 'offline' : 'reconnecting')
        reconnectTimer = window.setTimeout(connect, Math.min(1000 * attempt, 4000))
      }
    }

    connect()
    return () => {
      disposed = true
      activeSocket?.close()
      if (socketRef.current === activeSocket) socketRef.current = null
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      if (broadcastRef.current) window.clearTimeout(broadcastRef.current)
    }
  }, [roomId])

  return {
    code,
    language,
    title,
    version,
    participants,
    connection,
    clientId: identityRef.current.clientId,
    updateCode,
    updateLanguage,
  }
}
