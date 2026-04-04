// This file defines a client-side component for displaying an upcoming events calendar.
// It fetches event data from the /api/calendar endpoint, filters out past events,
// groups them by month, and displays each event in a styled card.

'use client'

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { isAfter } from 'date-fns/fp'

export default function CalendarPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/calendar')
      .then(response => response.json())
      .then(data => {
        if (data.events) {
          const now = new Date()
          const upcomingEvents = data.events.filter(event =>
            isAfter(parseISO(event.start), now)
          ).sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
          setEvents(upcomingEvents)
        }
      })
      .catch(err => setError(err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={styles.loading}>Loading...</div>
  if (error || events.length === 0) return <div style={styles.emptyState}>No upcoming events</div>

  const groupedEvents = events.reduce((acc, event) => {
    const monthYear = format(parseISO(event.start), 'MMMM yyyy')
    if (!acc[monthYear]) acc[monthYear] = []
    acc[monthYear].push(event)
    return acc
  }, {})

  return (
    <div style={styles.container}>
      {Object.keys(groupedEvents).map(month => (
        <div key={month} style={styles.monthSection}>
          <h2 style={styles.monthTitle}>{month}</h2>
          {groupedEvents[month].map(event => (
            <div key={event.id} style={styles.eventCard}>
              <strong>{event.title}</strong>
              <p>{format(parseISO(event.start), 'MMMM d, yyyy HH:mm')} - {format(parseISO(event.end), 'HH:mm')}</p>
              {event.description && <p>{event.description}</p>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const styles = {
  container: {
    backgroundColor: '#0f1117',
    color: '#f0f0f0',
    padding: '24px',
    fontFamily: 'Arial, sans-serif'
  },
  loading: {
    textAlign: 'center',
    padding: '24px',
    color: '#f97316'
  },
  emptyState: {
    textAlign: 'center',
    padding: '24px',
    color: '#f97316'
  },
  monthSection: {
    marginBottom: '24px'
  },
  monthTitle: {
    fontSize: '1.5em',
    margin: '0 0 12px 0',
    borderBottom: '1px solid #2a2d3a',
    paddingBottom: '8px'
  },
  eventCard: {
    backgroundColor: '#1a1d27',
    border: '1px solid #2a2d3a',
    borderRadius: '4px',
    padding: '16px',
    marginBottom: '12px',
    transition: 'background-color 0.3s'
  }
}