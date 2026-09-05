/*
 * Development seed. Fills the app database with a realistic academic history
 * so every screen (Hoy, Horario, Materias, Entregas, Finales, Parciales,
 * Carreras, Planificador) has something true-to-life to render.
 *
 * Two halves, on purpose:
 *   - `buildSeedData(today)` is PURE. It takes the day the seed is run and
 *     returns the whole dataset anchored to it, so a seed run in any month
 *     still produces a cursada in progress, parciales just taken, entregas
 *     due this week and a período that has not started yet. Hardcoded years
 *     would make the app look abandoned three months from now.
 *   - `main()` opens the database, migrates it and writes that dataset.
 *
 * Run as a CLI (`npm run db:seed`) or import the builder from tests.
 *
 * Usage:
 *   npm run db:seed                  append the dataset to the dev database
 *   npm run db:seed -- --reset       wipe the academic tables first
 *   npm run db:seed -- --db <path>   target another database file
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../src/main/db/schema.ts'

// --- date helpers ---------------------------------------------------------

// Local ISO `YYYY-MM-DD`. Never `toISOString()`: that shifts to UTC and can
// move a class to the previous day west of Greenwich — the same local-naive
// contract every date column in the schema carries.
function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const moved = new Date(date)
  moved.setDate(moved.getDate() + days)
  return moved
}

// Local naive datetime `YYYY-MM-DDTHH:mm`, the `deadlines.due_at` contract.
function atTime(date: Date, time: string): string {
  return `${toIsoDate(date)}T${time}`
}

function minutesOf(hours: number, minutes: number): number {
  return hours * 60 + minutes
}

// Every date in `[start, end]` that falls on `dayOfWeek` (0=Sunday, matching
// `schedule_slots.day_of_week`).
function classDatesBetween(start: Date, end: Date, dayOfWeek: number): Date[] {
  const dates: Date[] = []
  const cursor = new Date(start)
  while (cursor.getDay() !== dayOfWeek) {
    cursor.setDate(cursor.getDate() + 1)
  }
  while (cursor <= end) {
    dates.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 7)
  }
  return dates
}

/*
 * Deterministic PRNG (mulberry32). Attendance needs to look human — a few
 * ausencias, the odd feriado — without the dataset changing shape between two
 * runs of the same day, which would make the seed impossible to assert on.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- dataset shape --------------------------------------------------------

type NewProgram = typeof schema.programs.$inferInsert
type NewPeriod = Omit<typeof schema.periods.$inferInsert, 'programId'>
type NewAcademicDate = Omit<typeof schema.academicDates.$inferInsert, 'programId'>
type NewSubject = Omit<typeof schema.subjects.$inferInsert, 'periodId' | 'programId'>
type NewSlot = Omit<typeof schema.scheduleSlots.$inferInsert, 'subjectId'>
type NewDeadline = Omit<typeof schema.deadlines.$inferInsert, 'subjectId'>
type NewPartialExam = Omit<typeof schema.partialExams.$inferInsert, 'subjectId'>
type NewFinalExam = Omit<typeof schema.finalExams.$inferInsert, 'subjectId'>
type NewAttendance = Omit<typeof schema.attendanceRecords.$inferInsert, 'subjectId'>

/** A subject plus everything it owns, keyed by the período it was cursada in. */
export interface SeedSubject extends NewSubject {
  /** `name` of the período this subject belongs to, or null for plan-only rows. */
  periodName: string | null
  slots: NewSlot[]
  deadlines: NewDeadline[]
  partialExams: NewPartialExam[]
  finalExams: NewFinalExam[]
  attendance: NewAttendance[]
}

/** One correlativa, expressed by subject `code` so it survives id assignment. */
export interface SeedPrerequisite {
  subjectCode: string
  requiresSubjectCode: string
  requiredLevel: 'regularizada' | 'aprobada'
}

/** One line of a próximo-período draft, by período name and subject code. */
export interface SeedPlannerEntry {
  periodName: string
  subjectCode: string
}

export interface SeedProgram extends NewProgram {
  periods: NewPeriod[]
  academicDates: NewAcademicDate[]
  subjects: SeedSubject[]
  prerequisites: SeedPrerequisite[]
  plannerEntries: SeedPlannerEntry[]
}

export interface SeedData {
  programs: SeedProgram[]
}

// --- dataset --------------------------------------------------------------

const SUBJECT_COLORS = ['#4C8DFF', '#7C3AED', '#0EA5E9', '#F97316', '#10B981', '#E11D48', '#EAB308', '#8B5CF6'] as const

function colorFor(index: number): string {
  // A modulo of the palette's own length is always in range, but only for a
  // whole, non-negative index; the first colour is what an out-of-range one
  // falls back to, which is also what the tuple lets the type say without an
  // assertion.
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length] ?? SUBJECT_COLORS[0]
}

/** "1er cuatrimestre 2026" / "2do cuatrimestre 2026", from the start date. */
function cuatrimestreName(start: Date): string {
  const half = start.getMonth() < 6 ? '1er' : '2do'
  return `${half} cuatrimestre ${start.getFullYear()}`
}

/**
 * The cuatrimestre windows an Argentine faculty actually runs — March to July
 * and August to December — for the years around `year`, in chronological
 * order.
 */
function canonicalCuatrimestres(year: number): { start: Date; end: Date }[] {
  const windows: { start: Date; end: Date }[] = []
  for (let offset = -3; offset <= 3; offset += 1) {
    windows.push({ start: new Date(year + offset, 2, 16), end: new Date(year + offset, 6, 4) })
    windows.push({ start: new Date(year + offset, 7, 10), end: new Date(year + offset, 11, 5) })
  }
  return windows
}

function buildEngineeringProgram(today: Date, random: () => number): SeedProgram {
  // The cursada in progress: started six weeks ago, ends in a bit under three
  // months. Everything else is placed relative to it.
  const currentStart = addDays(today, -45)
  const currentEnd = addDays(today, 80)

  // The neighbouring cuatrimestres sit on the CALENDAR, not at ±6 months from
  // the one in progress: shifting by six months lands a "1er cuatrimestre" in
  // January, in the middle of the summer break, which no Argentine faculty
  // would schedule. Past ones are the canonical windows that closed before the
  // current one opened; the next one is the first that opens after it closes.
  const canonical = canonicalCuatrimestres(currentStart.getFullYear())
  const closed = canonical.filter((window) => window.end < currentStart)
  const oldestWindow = closed[closed.length - 2]
  const previousWindow = closed[closed.length - 1]
  const upcoming = canonical.find((window) => window.start > currentEnd)
  if (oldestWindow === undefined || previousWindow === undefined || upcoming === undefined) {
    // `canonicalCuatrimestres` spans three years either side of the cursada in
    // progress, so it always closes at least two windows before it and opens
    // one after it. Landing here means that window generator changed shape.
    throw new Error('the canonical calendar must surround the cursada in progress with two closed windows and one open')
  }
  const [oldestStart, oldestEnd] = [oldestWindow.start, oldestWindow.end]
  const [previousStart, previousEnd] = [previousWindow.start, previousWindow.end]
  const [nextStart, nextEnd] = [upcoming.start, upcoming.end]

  const oldest = cuatrimestreName(oldestStart)
  const previous = cuatrimestreName(previousStart)
  const current = cuatrimestreName(currentStart)
  const next = cuatrimestreName(nextStart)
  // Overlaps the two cuatrimestres on purpose — that overlap is exactly how an
  // anual subject gets a período of its own (see `periods` in the schema).
  const anual = `Anual ${currentStart.getFullYear()}`

  const periods: NewPeriod[] = [
    { name: oldest, kind: 'cuatrimestre', startsOn: toIsoDate(oldestStart), endsOn: toIsoDate(oldestEnd) },
    { name: previous, kind: 'cuatrimestre', startsOn: toIsoDate(previousStart), endsOn: toIsoDate(previousEnd) },
    { name: current, kind: 'cuatrimestre', startsOn: toIsoDate(currentStart), endsOn: toIsoDate(currentEnd) },
    {
      name: anual,
      kind: 'anual',
      startsOn: toIsoDate(new Date(currentStart.getFullYear(), 2, 16)),
      endsOn: toIsoDate(new Date(currentStart.getFullYear(), 11, 5))
    },
    { name: next, kind: 'cuatrimestre', startsOn: toIsoDate(nextStart), endsOn: toIsoDate(nextEnd) }
  ]

  const academicDates: NewAcademicDate[] = [
    {
      title: 'Inscripción a finales — turno de este mes',
      kind: 'inscripcionFinales',
      startsOn: toIsoDate(addDays(today, 4)),
      endsOn: toIsoDate(addDays(today, 11))
    },
    {
      title: 'Inscripción a cursadas del próximo cuatrimestre',
      kind: 'inscripcionCursadas',
      startsOn: toIsoDate(addDays(today, 46)),
      endsOn: toIsoDate(addDays(today, 60))
    },
    {
      title: 'Vence la regularidad de Análisis Matemático II',
      kind: 'vencimientoRegularidad',
      startsOn: toIsoDate(addDays(today, 120)),
      endsOn: null
    },
    {
      title: 'Entrega de la libreta universitaria en bedelía',
      kind: 'otro',
      startsOn: toIsoDate(addDays(today, -18)),
      endsOn: null
    }
  ]

  // Approved subjects from earlier cuatrimestres: no slots, no attendance, a
  // couple of parciales and (where the cátedra required one) a final.
  const approved: SeedSubject[] = [
    {
      name: 'Análisis Matemático I',
      code: '082',
      periodName: oldest,
      nivel: 1,
      outcome: 'aprobada',
      grade: 8,
      regularity: 'regular',
      docente: 'Ing. Marcela Sosa',
      contacto: 'msosa@frba.utn.edu.ar',
      comision: 'K1051',
      aula: 'Aula 402',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=1082',
      groupUrl: null,
      notas: 'Los prácticos de integrales por partes fueron lo más pesado. El apunte de la cátedra alcanza.',
      attendanceMinPercent: 75,
      color: colorFor(0),
      slots: [],
      deadlines: [],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(oldestStart, 45)), result: 'aprobado', grade: 6 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(oldestStart, 95)), result: 'aprobado', grade: 7 }
      ],
      finalExams: [
        { label: 'Mesa de diciembre', takenOn: toIsoDate(addDays(oldestEnd, 12)), result: 'aprobado', grade: 8 }
      ],
      attendance: []
    },
    {
      name: 'Álgebra y Geometría Analítica',
      code: '081',
      periodName: oldest,
      nivel: 1,
      outcome: 'aprobada',
      grade: 7,
      regularity: 'regular',
      docente: 'Lic. Hernán Quiroga',
      contacto: 'hquiroga@frba.utn.edu.ar',
      comision: 'K1051',
      aula: 'Aula 402',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=1081',
      groupUrl: 'https://chat.whatsapp.com/algebra-k1051',
      notas: 'Rendí el final en la segunda mesa. Espacios vectoriales entra siempre.',
      attendanceMinPercent: 75,
      color: colorFor(1),
      slots: [],
      deadlines: [],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(oldestStart, 42)), result: 'reprobado', grade: 3 },
        { label: 'Recuperatorio 1', takenOn: toIsoDate(addDays(oldestStart, 63)), result: 'aprobado', grade: 6 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(oldestStart, 98)), result: 'aprobado', grade: 8 }
      ],
      finalExams: [
        { label: 'Mesa de diciembre', takenOn: toIsoDate(addDays(oldestEnd, 10)), result: 'reprobado', grade: null },
        { label: 'Mesa de febrero', takenOn: toIsoDate(addDays(oldestEnd, 68)), result: 'aprobado', grade: 7 }
      ],
      attendance: []
    },
    {
      name: 'Algoritmos y Estructuras de Datos',
      code: '021',
      periodName: oldest,
      nivel: 1,
      outcome: 'aprobada',
      grade: 9,
      regularity: 'promocionada',
      docente: 'Ing. Paula Benítez',
      contacto: 'pbenitez@frba.utn.edu.ar',
      comision: 'K1051',
      aula: 'Lab 301',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=2021',
      groupUrl: 'https://discord.gg/algoritmos-k1051',
      notas: 'Promocioné con los dos parciales. El TP de árboles AVL fue el más largo del cuatrimestre.',
      attendanceMinPercent: 80,
      color: colorFor(2),
      slots: [],
      deadlines: [],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(oldestStart, 48)), result: 'aprobado', grade: 9 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(oldestStart, 100)), result: 'aprobado', grade: 9 }
      ],
      finalExams: [],
      attendance: []
    },
    {
      name: 'Sistemas y Organizaciones',
      code: '011',
      periodName: oldest,
      nivel: 1,
      outcome: 'aprobada',
      grade: 10,
      regularity: 'promocionada',
      docente: 'Lic. Andrea Ferreyra',
      contacto: null,
      comision: 'K1051',
      aula: 'Aula 108',
      campusUrl: null,
      groupUrl: null,
      notas: 'Materia de lectura. Los trabajos grupales pesan más que los parciales.',
      attendanceMinPercent: 75,
      color: colorFor(3),
      slots: [],
      deadlines: [],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(oldestStart, 44)), result: 'aprobado', grade: 10 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(oldestStart, 92)), result: 'aprobado', grade: 9 }
      ],
      finalExams: [],
      attendance: []
    },
    {
      name: 'Análisis Matemático II',
      code: '092',
      periodName: previous,
      nivel: 2,
      // The interesting state: cursada regularizada, final still to be taken.
      outcome: 'finalPendiente',
      grade: null,
      regularity: 'regular',
      docente: 'Ing. Marcela Sosa',
      contacto: 'msosa@frba.utn.edu.ar',
      comision: 'K2054',
      aula: 'Aula 405',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=1092',
      groupUrl: null,
      notas: 'Me falta el final. Repasar integrales de superficie y teorema de Stokes antes de la mesa.',
      attendanceMinPercent: 75,
      color: colorFor(4),
      slots: [],
      deadlines: [],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(previousStart, 46)), result: 'aprobado', grade: 6 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(previousStart, 97)), result: 'aprobado', grade: 6 }
      ],
      // No date yet: a mesa is recorded before the institution publishes its calendar.
      finalExams: [{ label: 'Mesa de este turno', takenOn: null, result: 'pendiente', grade: null }],
      attendance: []
    },
    {
      name: 'Física I',
      code: '083',
      periodName: previous,
      nivel: 2,
      outcome: 'aprobada',
      grade: 6,
      regularity: 'regular',
      docente: 'Ing. Rubén Alcaraz',
      contacto: 'ralcaraz@frba.utn.edu.ar',
      comision: 'K2054',
      aula: 'Lab 105',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=1083',
      groupUrl: null,
      notas: 'Los informes de laboratorio se entregan a mano y valen para la regularidad.',
      attendanceMinPercent: 80,
      color: colorFor(5),
      slots: [],
      deadlines: [],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(previousStart, 43)), result: 'aprobado', grade: 7 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(previousStart, 94)), result: 'reprobado', grade: 4 },
        { label: 'Recuperatorio 2', takenOn: toIsoDate(addDays(previousStart, 110)), result: 'aprobado', grade: 6 }
      ],
      finalExams: [
        { label: 'Mesa de julio', takenOn: toIsoDate(addDays(previousEnd, 14)), result: 'aprobado', grade: 6 }
      ],
      attendance: []
    },
    {
      name: 'Sintaxis y Semántica de los Lenguajes',
      code: '022',
      periodName: previous,
      nivel: 2,
      outcome: 'aprobada',
      grade: 8,
      regularity: 'promocionada',
      docente: 'Ing. Diego Marín',
      contacto: 'dmarin@frba.utn.edu.ar',
      comision: 'K2054',
      aula: 'Lab 302',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=2022',
      groupUrl: 'https://chat.whatsapp.com/sintaxis-k2054',
      notas: 'El TP integrador fue un intérprete propio. Guardar el repo, sirve para Diseño.',
      attendanceMinPercent: 80,
      color: colorFor(6),
      slots: [],
      deadlines: [],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(previousStart, 47)), result: 'aprobado', grade: 8 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(previousStart, 99)), result: 'aprobado', grade: 8 }
      ],
      finalExams: [],
      attendance: []
    },
    {
      name: 'Paradigmas de Programación',
      code: '023',
      periodName: previous,
      nivel: 2,
      outcome: 'aprobada',
      grade: 9,
      regularity: 'promocionada',
      docente: 'Ing. Paula Benítez',
      contacto: 'pbenitez@frba.utn.edu.ar',
      comision: 'K2054',
      aula: 'Lab 301',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=2023',
      groupUrl: 'https://discord.gg/paradigmas-k2054',
      notas: 'Funcional en Haskell y lógico en Prolog. Los TPs son individuales y se defienden.',
      attendanceMinPercent: 80,
      color: colorFor(7),
      slots: [],
      deadlines: [],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(previousStart, 50)), result: 'aprobado', grade: 10 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(previousStart, 102)), result: 'aprobado', grade: 8 }
      ],
      finalExams: [],
      attendance: []
    }
  ]

  // The cursada in progress. These are the rows Hoy, Horario, Entregas and
  // Parciales actually read, so they carry the slots and the live dates.
  const inProgress: SeedSubject[] = [
    {
      name: 'Diseño de Sistemas',
      code: '032',
      periodName: current,
      nivel: 3,
      outcome: null,
      grade: null,
      regularity: null,
      docente: 'Ing. Luciano Rivas',
      contacto: 'lrivas@frba.utn.edu.ar',
      comision: 'K3051',
      aula: 'Lab 302',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=3032',
      groupUrl: 'https://discord.gg/diseno-k3051',
      notas: 'El TP integrador es grupal y se entrega en tres iteraciones. Grupo: Sofi, Tomás y yo.',
      attendanceMinPercent: 75,
      color: colorFor(0),
      slots: [
        { dayOfWeek: 1, startMinutes: minutesOf(18, 15), endMinutes: minutesOf(22, 0), location: 'Lab 302' },
        { dayOfWeek: 3, startMinutes: minutesOf(18, 15), endMinutes: minutesOf(20, 15), location: 'Lab 302' }
      ],
      deadlines: [
        {
          title: 'TP integrador — iteración 1',
          type: 'Trabajo práctico',
          dueAt: atTime(addDays(today, -19), '23:59'),
          done: true
        },
        {
          title: 'TP integrador — iteración 2',
          type: 'Trabajo práctico',
          dueAt: atTime(addDays(today, 3), '23:59'),
          done: false
        },
        {
          title: 'Presentación de diagramas de secuencia',
          type: 'Exposición',
          dueAt: atTime(addDays(today, 10), '18:15'),
          done: false
        }
      ],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(today, -12)), result: 'aprobado', grade: 7 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(today, 38)), result: 'pendiente', grade: null }
      ],
      finalExams: [],
      attendance: []
    },
    {
      name: 'Gestión de Datos',
      code: '033',
      periodName: current,
      nivel: 3,
      outcome: null,
      grade: null,
      regularity: null,
      docente: 'Lic. Verónica Paz',
      contacto: 'vpaz@frba.utn.edu.ar',
      comision: 'K3051',
      aula: 'Aula 214',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=3033',
      groupUrl: 'https://chat.whatsapp.com/gestion-datos-k3051',
      notas: 'Normalización hasta 3FN entra seguro en el primer parcial. Las consultas se toman en papel.',
      attendanceMinPercent: 75,
      color: colorFor(1),
      slots: [{ dayOfWeek: 2, startMinutes: minutesOf(18, 15), endMinutes: minutesOf(22, 0), location: 'Aula 214' }],
      deadlines: [
        {
          title: 'Entrega del modelo de datos normalizado',
          type: 'Trabajo práctico',
          dueAt: atTime(addDays(today, -26), '23:59'),
          done: true
        },
        {
          // Overdue and unmarked — the uncomfortable state the screen has to show.
          title: 'Ejercicios de álgebra relacional',
          type: 'Ejercicios',
          dueAt: atTime(addDays(today, -2), '23:59'),
          done: false
        },
        {
          title: 'TP de stored procedures',
          type: 'Trabajo práctico',
          dueAt: atTime(addDays(today, 16), '23:59'),
          done: false
        }
      ],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(today, -5)), result: 'pendiente', grade: null },
        { label: '2do parcial', takenOn: toIsoDate(addDays(today, 45)), result: 'pendiente', grade: null }
      ],
      finalExams: [],
      attendance: []
    },
    {
      name: 'Economía',
      code: '013',
      periodName: current,
      nivel: 3,
      outcome: null,
      grade: null,
      regularity: null,
      docente: 'Lic. Andrea Ferreyra',
      contacto: null,
      comision: 'K3051',
      aula: 'Aula 108',
      campusUrl: null,
      groupUrl: null,
      notas: 'Se aprueba con dos parciales teóricos. Bibliografía: Mochón y Beker.',
      attendanceMinPercent: 75,
      color: colorFor(2),
      slots: [{ dayOfWeek: 4, startMinutes: minutesOf(18, 15), endMinutes: minutesOf(20, 15), location: 'Aula 108' }],
      deadlines: [
        {
          title: 'Resumen del capítulo de elasticidad',
          type: 'Lectura',
          dueAt: atTime(addDays(today, 6), '18:15'),
          done: false
        }
      ],
      partialExams: [{ label: '1er parcial', takenOn: toIsoDate(addDays(today, 8)), result: 'pendiente', grade: null }],
      finalExams: [],
      attendance: []
    },
    {
      name: 'Probabilidad y Estadística',
      code: '093',
      periodName: current,
      nivel: 3,
      outcome: null,
      grade: null,
      regularity: null,
      docente: 'Ing. Rubén Alcaraz',
      contacto: 'ralcaraz@frba.utn.edu.ar',
      comision: 'K3051',
      aula: 'Aula 305',
      campusUrl: 'https://campus.frba.utn.edu.ar/course/view.php?id=1093',
      groupUrl: null,
      notas: 'Llevar la tabla de la normal impresa, no dejan usar el celular.',
      attendanceMinPercent: 75,
      color: colorFor(3),
      slots: [
        { dayOfWeek: 3, startMinutes: minutesOf(20, 30), endMinutes: minutesOf(22, 0), location: 'Aula 305' },
        { dayOfWeek: 5, startMinutes: minutesOf(18, 15), endMinutes: minutesOf(20, 15), location: 'Aula 305' }
      ],
      deadlines: [
        {
          title: 'Guía 3 — variables aleatorias continuas',
          type: 'Ejercicios',
          dueAt: atTime(addDays(today, 1), '20:00'),
          done: false
        },
        {
          title: 'Informe de la práctica con R',
          type: 'Informe',
          dueAt: atTime(addDays(today, 23), '23:59'),
          done: false
        }
      ],
      partialExams: [
        { label: '1er parcial', takenOn: toIsoDate(addDays(today, -9)), result: 'aprobado', grade: 8 },
        { label: '2do parcial', takenOn: toIsoDate(addDays(today, 41)), result: 'pendiente', grade: null }
      ],
      finalExams: [],
      attendance: []
    },
    {
      name: 'Inglés Técnico I',
      code: '900',
      // Anual, alongside the cuatrimestre — the overlap the schema allows.
      periodName: anual,
      nivel: 2,
      outcome: null,
      grade: null,
      regularity: null,
      docente: 'Prof. Silvia Roldán',
      contacto: 'sroldan@frba.utn.edu.ar',
      comision: 'K1051',
      aula: 'Aula 210',
      campusUrl: null,
      groupUrl: null,
      notas: 'Traducción técnica. Se aprueba con dos parciales de comprensión de texto.',
      attendanceMinPercent: 75,
      color: colorFor(4),
      slots: [{ dayOfWeek: 6, startMinutes: minutesOf(9, 0), endMinutes: minutesOf(11, 0), location: 'Aula 210' }],
      deadlines: [
        {
          title: 'Traducción del paper asignado',
          type: 'Trabajo práctico',
          dueAt: atTime(addDays(today, 13), '12:00'),
          done: false
        }
      ],
      partialExams: [{ label: '1er parcial', takenOn: toIsoDate(addDays(today, -33)), result: 'aprobado', grade: 9 }],
      finalExams: [],
      attendance: []
    }
  ]

  // Plan-de-estudios rows: no período, no cursada, just a place on the map.
  // `nivel: null` on the last one is the "sin ordenar" tray, a real state.
  const planned: SeedSubject[] = [
    { name: 'Ingeniería y Calidad de Software', code: '042', nivel: 4 },
    { name: 'Redes de Información', code: '043', nivel: 4 },
    { name: 'Legislación', code: '014', nivel: 4 },
    { name: 'Investigación Operativa', code: '094', nivel: 4 },
    { name: 'Práctica Profesional Supervisada', code: '950', nivel: null }
  ].map((row, index) => {
    return {
      name: row.name,
      code: row.code,
      periodName: null,
      nivel: row.nivel,
      outcome: null,
      grade: null,
      regularity: null,
      docente: null,
      contacto: null,
      comision: null,
      aula: null,
      campusUrl: null,
      groupUrl: null,
      notas: null,
      attendanceMinPercent: null,
      color: colorFor(index),
      slots: [],
      deadlines: [],
      partialExams: [],
      finalExams: [],
      attendance: []
    }
  })

  // Attendance for the cursada in progress: every past occurrence of every
  // slot since the período started. Mostly presente, with the occasional
  // ausencia and one feriado, so the porcentaje is never a flat 100%.
  for (const subject of inProgress) {
    const marks = new Map<string, NewAttendance>()
    for (const slot of subject.slots) {
      for (const date of classDatesBetween(currentStart, today, slot.dayOfWeek)) {
        const roll = random()
        const status = roll > 0.88 ? 'ausente' : roll > 0.84 ? 'feriado' : 'presente'
        // UNIQUE (subject_id, date): two slots on the same day are one class.
        marks.set(toIsoDate(date), { date: toIsoDate(date), status })
      }
    }
    subject.attendance = [...marks.values()].sort((left, right) => left.date.localeCompare(right.date))
  }

  // Only correlativas the chain does NOT already imply. Investigación Operativa
  // (094) requires Probabilidad (093), which requires Análisis Matemático II
  // (092) — so naming 092 on 094 as well says nothing new. The app's picker
  // subtracts exactly that set (`collectRequirementsOf`), so seeding one would
  // put an edge on the map the student could never have added.
  const prerequisites: SeedPrerequisite[] = [
    { subjectCode: '092', requiresSubjectCode: '082', requiredLevel: 'aprobada' },
    { subjectCode: '092', requiresSubjectCode: '081', requiredLevel: 'aprobada' },
    { subjectCode: '023', requiresSubjectCode: '021', requiredLevel: 'aprobada' },
    { subjectCode: '022', requiresSubjectCode: '021', requiredLevel: 'regularizada' },
    { subjectCode: '032', requiresSubjectCode: '023', requiredLevel: 'aprobada' },
    { subjectCode: '032', requiresSubjectCode: '022', requiredLevel: 'regularizada' },
    { subjectCode: '033', requiresSubjectCode: '023', requiredLevel: 'aprobada' },
    { subjectCode: '093', requiresSubjectCode: '092', requiredLevel: 'regularizada' },
    { subjectCode: '013', requiresSubjectCode: '011', requiredLevel: 'aprobada' },
    { subjectCode: '042', requiresSubjectCode: '032', requiredLevel: 'aprobada' },
    { subjectCode: '043', requiresSubjectCode: '022', requiredLevel: 'aprobada' },
    { subjectCode: '094', requiresSubjectCode: '093', requiredLevel: 'aprobada' },
    { subjectCode: '014', requiresSubjectCode: '013', requiredLevel: 'regularizada' },
    { subjectCode: '950', requiresSubjectCode: '032', requiredLevel: 'aprobada' }
  ]

  // The próximo-período draft. Deliberately includes Legislación, whose
  // correlativa (Economía regularizada) is still in progress — a plan is
  // allowed to be optimistic, and the planner is what points that out.
  const plannerEntries: SeedPlannerEntry[] = [
    { periodName: next, subjectCode: '042' },
    { periodName: next, subjectCode: '043' },
    { periodName: next, subjectCode: '094' },
    { periodName: next, subjectCode: '014' }
  ]

  return {
    name: 'Ingeniería en Sistemas de Información',
    institution: 'UTN — Facultad Regional Buenos Aires',
    color: '#4C8DFF',
    gradingScheme: 'numerico',
    gradeScale: 10,
    periods,
    academicDates,
    subjects: [...approved, ...inProgress, ...planned],
    prerequisites,
    plannerEntries
  }
}

// A standalone course, not a carrera: pass/fail, one open-ended período, no
// correlativas and no average. Exercises the 'binario' branch end to end.
function buildLanguageProgram(today: Date): SeedProgram {
  const start = addDays(today, -30)
  const periodName = `Ciclo ${start.getFullYear()}`

  return {
    name: 'Inglés B2 — Upper Intermediate',
    institution: 'Cultural Inglesa',
    color: '#10B981',
    gradingScheme: 'binario',
    gradeScale: null,
    periods: [
      // `endsOn: null` on purpose: an open-ended course that simply keeps going.
      { name: periodName, kind: 'curso', startsOn: toIsoDate(start), endsOn: null }
    ],
    academicDates: [
      {
        title: 'Inscripción al examen internacional B2 First',
        kind: 'otro',
        startsOn: toIsoDate(addDays(today, 20)),
        endsOn: toIsoDate(addDays(today, 34))
      }
    ],
    subjects: [
      {
        name: 'Inglés B2',
        code: 'B2',
        periodName,
        nivel: null,
        outcome: null,
        grade: null,
        regularity: null,
        docente: 'Prof. Laura Giménez',
        contacto: 'lgimenez@culturalinglesa.com',
        comision: 'Martes y jueves — noche',
        aula: 'Sede Caballito, aula 3',
        campusUrl: 'https://campus.culturalinglesa.com/b2',
        groupUrl: 'https://chat.whatsapp.com/b2-caballito',
        notas: 'Se aprueba con asistencia y el writing final. No hay nota numérica, es aprobado o no.',
        attendanceMinPercent: 80,
        color: '#10B981',
        slots: [
          { dayOfWeek: 2, startMinutes: minutesOf(19, 30), endMinutes: minutesOf(21, 30), location: 'Aula 3' },
          { dayOfWeek: 4, startMinutes: minutesOf(19, 30), endMinutes: minutesOf(21, 30), location: 'Aula 3' }
        ],
        deadlines: [
          { title: 'Writing — opinion essay', type: 'Entrega', dueAt: atTime(addDays(today, 5), '19:30'), done: false },
          { title: 'Speaking mock exam', type: 'Examen', dueAt: atTime(addDays(today, 27), '19:30'), done: false }
        ],
        // No grade: under 'binario' an approved parcial carries no number.
        partialExams: [
          { label: 'Progress test 1', takenOn: toIsoDate(addDays(today, -8)), result: 'aprobado', grade: null }
        ],
        finalExams: [],
        attendance: []
      }
    ],
    prerequisites: [],
    plannerEntries: []
  }
}

/**
 * The whole dataset, anchored to the day the seed runs. Pure: same `today`
 * in, same rows out.
 */
export function buildSeedData(today: Date): SeedData {
  const random = createRandom(20260101)
  const language = buildLanguageProgram(today)
  const [english] = language.subjects
  if (english === undefined) {
    throw new Error('the language program must define the subject its attendance is written onto')
  }

  // Same attendance treatment the engineering cursada gets.
  const marks = new Map<string, NewAttendance>()
  for (const slot of english.slots) {
    for (const date of classDatesBetween(addDays(today, -30), today, slot.dayOfWeek)) {
      const roll = random()
      marks.set(toIsoDate(date), { date: toIsoDate(date), status: roll > 0.85 ? 'ausente' : 'presente' })
    }
  }
  english.attendance = [...marks.values()].sort((left, right) => left.date.localeCompare(right.date))

  return { programs: [buildEngineeringProgram(today, random), language] }
}

// --- writer ---------------------------------------------------------------

type AppDatabase = ReturnType<typeof drizzle<typeof schema>>

/*
 * Tables the seed owns, in FK-safe delete order. `attachments` is included
 * because a subject delete cascades into it anyway — the FILES those rows
 * point at are left on disk, which is why --reset is opt-in and prints a
 * warning. Conversations, ask history and app_settings are never touched:
 * they belong to the user, not to the academic dataset.
 */
const SEEDED_TABLES = [
  'subject_prerequisites',
  'planner_entries',
  'attendance_records',
  'class_notes',
  'deadlines',
  'final_exams',
  'partial_exams',
  'schedule_slots',
  'attachment_chunks',
  'attachments',
  'subjects',
  'periods',
  'academic_dates',
  'programs'
]

function resetSeededTables(raw: Database.Database): void {
  raw.transaction(() => {
    for (const table of SEEDED_TABLES) {
      raw.prepare(`DELETE FROM ${table}`).run()
    }
  })()
}

/**
 * The id a single-row `.returning({ id }).all()` insert gives back. Drizzle
 * types the result as an array, so the caller has to say out loud that an
 * insert coming back empty is a broken invariant rather than a case to handle.
 */
function insertedId(rows: { id: number }[], table: string): number {
  const [row] = rows
  if (row === undefined) {
    throw new Error(`the insert into ${table} returned no row`)
  }
  return row.id
}

function writeSeedData(db: AppDatabase, data: SeedData): void {
  for (const program of data.programs) {
    const programId = insertedId(
      db
        .insert(schema.programs)
        .values({
          name: program.name,
          institution: program.institution,
          color: program.color,
          gradingScheme: program.gradingScheme,
          gradeScale: program.gradeScale
        })
        .returning({ id: schema.programs.id })
        .all(),
      'programs'
    )

    const periodIds = new Map<string, number>()
    for (const period of program.periods) {
      const id = insertedId(
        db
          .insert(schema.periods)
          .values({ ...period, programId })
          .returning({ id: schema.periods.id })
          .all(),
        'periods'
      )
      periodIds.set(period.name, id)
    }

    if (program.academicDates.length > 0) {
      db.insert(schema.academicDates)
        .values(program.academicDates.map((date) => ({ ...date, programId })))
        .run()
    }

    const subjectIds = new Map<string, number>()
    for (const subject of program.subjects) {
      const { periodName, slots, deadlines, partialExams, finalExams, attendance, ...fields } = subject
      const subjectId = insertedId(
        db
          .insert(schema.subjects)
          .values({
            ...fields,
            programId,
            periodId: periodName === null ? null : (periodIds.get(periodName) ?? null)
          })
          .returning({ id: schema.subjects.id })
          .all(),
        'subjects'
      )
      subjectIds.set(subject.code, subjectId)

      if (slots.length > 0) {
        db.insert(schema.scheduleSlots)
          .values(slots.map((slot) => ({ ...slot, subjectId })))
          .run()
      }
      if (deadlines.length > 0) {
        db.insert(schema.deadlines)
          .values(deadlines.map((deadline) => ({ ...deadline, subjectId })))
          .run()
      }
      if (partialExams.length > 0) {
        db.insert(schema.partialExams)
          .values(partialExams.map((exam) => ({ ...exam, subjectId })))
          .run()
      }
      if (finalExams.length > 0) {
        db.insert(schema.finalExams)
          .values(finalExams.map((exam) => ({ ...exam, subjectId })))
          .run()
      }
      if (attendance.length > 0) {
        db.insert(schema.attendanceRecords)
          .values(attendance.map((record) => ({ ...record, subjectId })))
          .run()
      }
    }

    if (program.prerequisites.length > 0) {
      db.insert(schema.subjectPrerequisites)
        .values(
          program.prerequisites.map((edge) => ({
            subjectId: subjectIds.get(edge.subjectCode)!,
            requiresSubjectId: subjectIds.get(edge.requiresSubjectCode)!,
            requiredLevel: edge.requiredLevel
          }))
        )
        .run()
    }

    if (program.plannerEntries.length > 0) {
      db.insert(schema.plannerEntries)
        .values(
          program.plannerEntries.map((entry) => ({
            periodId: periodIds.get(entry.periodName)!,
            subjectId: subjectIds.get(entry.subjectCode)!
          }))
        )
        .run()
    }
  }
}

// --- CLI ------------------------------------------------------------------

/**
 * Where Electron keeps this app's userData, mirroring `app.getPath('userData')`
 * in src/main/index.ts. The app's name comes from package.json's `name`, so a
 * dev run writes to `<userData>/course-companion/course-companion.db`.
 */
function defaultDatabasePath(): string {
  const appName = 'course-companion'
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), appName, `${appName}.db`)
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName, `${appName}.db`)
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), appName, `${appName}.db`)
}

const ISO_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * The day the dataset is anchored to: `--today <YYYY-MM-DD>` when given, the
 * real current day otherwise.
 *
 * The flag exists so a REPRODUCIBLE dataset can be built on demand. Every
 * date in this seed is derived from `today`, which is what keeps a dev
 * database looking alive — and what would make the MCP evaluation suite
 * (`evaluations/`) go stale a month after it was written, since its answers
 * are only verifiable against a dataset that does not move.
 *
 * Parsed field by field into a LOCAL date rather than through `new
 * Date(string)`: the one-argument string form is treated as UTC midnight,
 * which lands on the previous day west of Greenwich — the same shift
 * `toIsoDate` above refuses to make.
 */
export function resolveSeedDay(argv: string[]): Date {
  const flag = argv.indexOf('--today')
  if (flag === -1) {
    return new Date()
  }

  const raw = argv[flag + 1]
  const match = raw === undefined ? null : ISO_DAY_PATTERN.exec(raw)
  if (match === null) {
    throw new Error(`--today expects a YYYY-MM-DD day, got ${raw ?? '(nothing)'}`)
  }

  const [, year, month, day] = match
  const parsed = new Date(Number(year), Number(month) - 1, Number(day))
  // Rejects a well-shaped but impossible day (2026-13-02, 2026-02-31), which
  // JavaScript would otherwise roll over into a neighbouring month.
  if (parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) {
    throw new Error(`--today is not a real calendar day: ${raw}`)
  }
  return parsed
}

function main(argv: string[]): void {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: npm run db:seed -- [--reset] [--db <path>] [--today <YYYY-MM-DD>]')
    return
  }

  const dbFlag = argv.indexOf('--db')
  const dbPath = dbFlag === -1 ? defaultDatabasePath() : path.resolve(argv[dbFlag + 1] ?? '')
  const reset = argv.includes('--reset')

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const raw = new Database(dbPath)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  const db = drizzle(raw, { schema })

  const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle', 'migrations')
  migrate(db, { migrationsFolder })

  if (reset) {
    console.log('--reset: clearing the academic tables (attachment FILES on disk are NOT removed).')
    resetSeededTables(raw)
  }

  const today = resolveSeedDay(argv)
  const data = buildSeedData(today)
  raw.transaction(() => writeSeedData(db, data))()
  raw.close()

  const subjects = data.programs.reduce((total, program) => total + program.subjects.length, 0)
  console.log(`Seeded ${dbPath} (anchored to ${toIsoDate(today)})`)
  console.log(`  ${data.programs.length} programs, ${subjects} subjects`)
  if (!reset) {
    console.log('  (append mode — pass `--reset` to start from a clean database)')
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}
