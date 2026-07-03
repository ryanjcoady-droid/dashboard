/* training-plan.js — single source of truth for the editable training plan.
 *
 * Stored in localStorage under 'training_plan' (synced to Firestore via sync.js).
 * Read by: daily-dashboard (7-day schedule sport tags),
 *          workout-dashboard (phase manager + current phase + plan editor),
 *          strava-dashboard (coach context).
 *
 * Load this AFTER sync.js so the synced value is present.
 */
(function () {
  'use strict';

  const PLAN_KEY = 'training_plan';

  // Sport types used across the app. Keep keys stable — they're stored.
  const SPORTS = {
    swim:     { label: 'Swim',     c: '#38BDF8', bg: '#061520', bd: '#0D2F45' },
    bike:     { label: 'Bike',     c: '#F59E0B', bg: '#1A1000', bd: '#3D2500' },
    run:      { label: 'Run',      c: '#F87171', bg: '#1A0808', bd: '#3D1010' },
    strength: { label: 'Strength', c: '#A78BFA', bg: '#100A1F', bd: '#261A45' },
    sport:    { label: 'Sport',    c: '#94A3B8', bg: '#111827', bd: '#1F2D40' },
    rest:     { label: 'Rest',     c: '#4ADE80', bg: '#071A0F', bd: '#134D22' },
  };

  // Default plan — matches the current 70.3 build. Fully editable.
  const DEFAULT_PLAN = {
    raceTitle: 'Ironman 70.3 Melbourne',
    subtitle:  'St Kilda Beach',
    raceDate:  '2026-11-08',
    phases: [
      { id: 'p1', name: 'Base Building', start: '2026-05-11', end: '2026-07-06' },
      { id: 'p2', name: 'Volume Build',  start: '2026-07-07', end: '2026-08-30' },
      { id: 'p3', name: 'Race Specific', start: '2026-08-31', end: '2026-10-18' },
      { id: 'p4', name: 'Taper',         start: '2026-10-19', end: '2026-11-08' },
    ],
    // Weekly sport split — ordered list of sport keys per day.
    weekSplit: {
      Mon: ['strength', 'bike'],
      Tue: ['swim', 'run'],
      Wed: ['bike', 'run'],
      Thu: ['swim', 'strength'],
      Fri: ['strength', 'bike'],
      Sat: ['swim', 'run'],
      Sun: ['rest'],
    },
    // Bump when the default split/phases change in a way that should
    // supersede older saved plans (see migration in load()).
    planVersion: 2,
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      if (!raw) return clone(DEFAULT_PLAN);
      const p = JSON.parse(raw);
      // Migration: saved plans older than the current default are replaced.
      if ((p.planVersion || 0) < DEFAULT_PLAN.planVersion) {
        const fresh = clone(DEFAULT_PLAN);
        save(fresh);
        return fresh;
      }
      if (!p.raceTitle) p.raceTitle = DEFAULT_PLAN.raceTitle;
      if (!p.raceDate)  p.raceDate  = DEFAULT_PLAN.raceDate;
      if (!Array.isArray(p.phases) || !p.phases.length) p.phases = clone(DEFAULT_PLAN.phases);
      if (!p.weekSplit) p.weekSplit = clone(DEFAULT_PLAN.weekSplit);
      ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d => {
        if (!Array.isArray(p.weekSplit[d])) p.weekSplit[d] = clone(DEFAULT_PLAN.weekSplit[d] || []);
      });
      return p;
    } catch (e) {
      return clone(DEFAULT_PLAN);
    }
  }

  function save(plan) {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  }

  // Phase active on a given date (default: today), or null.
  function currentPhase(plan, when) {
    const now = when ? new Date(when) : new Date();
    now.setHours(12, 0, 0, 0);
    return (plan.phases || []).find(ph => {
      const s = new Date(ph.start + 'T00:00:00');
      const e = new Date(ph.end + 'T23:59:59');
      return now >= s && now <= e;
    }) || null;
  }

  function daysToRace(plan) {
    const race = new Date(plan.raceDate + 'T06:00:00');
    return Math.max(0, Math.floor((race - new Date()) / 86400000));
  }

  function sportsForDay(plan, dayShort) {
    return (plan.weekSplit && plan.weekSplit[dayShort]) || [];
  }

  window.TrainingPlan = {
    PLAN_KEY, SPORTS, DEFAULT_PLAN,
    load, save, clone, currentPhase, daysToRace, sportsForDay,
  };
})();
