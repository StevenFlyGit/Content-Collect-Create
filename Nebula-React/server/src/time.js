import { config } from './config.js'

const formatterCache = new Map()

function formatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }))
  }
  return formatterCache.get(timeZone)
}

function zonedParts(date, timeZone) {
  return Object.fromEntries(formatter(timeZone).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

function offsetAt(date, timeZone) {
  const parts = zonedParts(date, timeZone)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime()
}

function assertCalendarDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) throw Object.assign(new Error('日期必须为 YYYY-MM-DD'), { status: 422, code: 'INVALID_DATE' })
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw Object.assign(new Error('日期不存在'), { status: 422, code: 'INVALID_DATE' })
  }
  return { year, month, day }
}

function localMidnightUtc(dateString, timeZone) {
  const guess = Date.parse(`${dateString}T00:00:00.000Z`)
  let result = guess
  for (let i = 0; i < 2; i += 1) result = guess - offsetAt(new Date(result), timeZone)
  return new Date(result)
}

export function businessDateRange(dateString, timeZone = config.appTimezone) {
  const { year, month, day } = assertCalendarDate(dateString)
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
  return { start: localMidnightUtc(dateString, timeZone), end: localMidnightUtc(nextDate, timeZone) }
}

export function currentBusinessDate(timeZone = config.appTimezone) {
  const parts = zonedParts(new Date(), timeZone)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}
