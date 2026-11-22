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

  // Default plan — Ironman Cairns 2027 (29-week build). Fully editable.
  // Week 1 starts Mon 23 Nov 2026. Session detail lives in workout-dashboard.
  const DEFAULT_PLAN = {
    raceTitle: 'Ironman Cairns',
    subtitle:  'Palm Cove to Cairns',
    raceDate:  '2027-06-13',
    phases: [
      { id: 'p1', name: 'Reset',     start: '2026-11-09', end: '2026-11-22' },
      { id: 'p2', name: 'Base 1',    start: '2026-11-23', end: '2027-01-17' },
      { id: 'p3', name: 'Base 2',    start: '2027-01-18', end: '2027-03-14' },
      { id: 'p4', name: 'Build',     start: '2027-03-15', end: '2027-05-09' },
      { id: 'p5', name: 'Peak',      start: '2027-05-10', end: '2027-05-30' },
      { id: 'p6', name: 'Taper',     start: '2027-05-31', end: '2027-06-06' },
      { id: 'p7', name: 'Race week', start: '2027-06-07', end: '2027-06-13' },
    ],
    // Weekly sport split (Base 1 pattern). The workout dashboard follows each
    // phase's own detailed days unless this split is edited in the plan editor.
    weekSplit: {
      Mon: ['strength', 'swim'],
      Tue: ['bike', 'run'],
      Wed: ['swim', 'run'],
      Thu: ['bike', 'strength'],
      Fri: ['swim'],
      Sat: ['bike'],
      Sun: ['run'],
    },
    // Bump when the default split/phases change in a way that should
    // supersede older saved plans (see migration in load()).
    planVersion: 3,
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
