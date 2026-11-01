const realtime = require('../realtime');
const votesService = require('./votes');
const dutyService = require('./duty');
const goalService = require('./goal');
const syncService = require('./sync');
const settingsService = require('./settings');

let timers = [];
let running = false;

async function tickVotes() {
  try {
    await votesService.closeExpiredVotes();
  } catch (error) {
    console.error('[Tasks] votes:', error.message);
  }
}

async function tickShifts() {
  try {
    await dutyService.closeStaleShifts();
  } catch (error) {
    console.error('[Tasks] shifts:', error.message);
  }
}

async function tickGoal() {
  try {
    await goalService.rolloverIfNeeded();
    await goalService.getCurrentGoal({ create: true });
  } catch (error) {
    console.error('[Tasks] goal:', error.message);
  }
}

async function tickPresence() {
  try {
    if (realtime.getIO()) {
      const snapshot = realtime.snapshotPresence();
      realtime.emit('presence:update', snapshot);
    }
  } catch (error) {
    console.error('[Tasks] presence:', error.message);
  }
}

async function tickSync() {
  try {
    await syncService.syncOnlineUsers();
  } catch (error) {
    console.error('[Tasks] sync:', error.message);
  }
}

async function tickSyncAll() {
  try {
    await syncService.syncAllUsers();
  } catch (error) {
    console.error('[Tasks] sync-all:', error.message);
  }
}

function startTasks() {
  if (running) return;
  running = true;
  timers.push(setInterval(tickVotes, 30 * 1000));
  timers.push(setInterval(tickShifts, 5 * 60 * 1000));
  timers.push(setInterval(tickGoal, 4 * 60 * 1000));
  timers.push(setInterval(tickPresence, 60 * 1000));
  timers.push(setInterval(tickSync, 120 * 1000));
  timers.push(setInterval(tickSyncAll, 30 * 60 * 1000));
  setTimeout(tickSyncAll, 90 * 1000);
  setTimeout(tickGoal, 4000);
  setTimeout(tickVotes, 8000);
  setTimeout(tickPresence, 12000);
  console.log('[Tasks] مهام الخلفية بدأت (تصويتات، دوام، أهداف، مزامنة ديسكورد).');
}

function stopTasks() {
  for (const timer of timers) clearInterval(timer);
  timers = [];
  running = false;
}

module.exports = { startTasks, stopTasks, tickVotes, tickShifts, tickGoal, tickSync };
