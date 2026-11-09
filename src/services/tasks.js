const realtime = require('../realtime');
const votesService = require('./votes');
const dutyService = require('./duty');
const goalService = require('./goal');
const syncService = require('./sync');
const settingsService = require('./settings');
const attendanceService = require('./attendance');

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
    const out = await syncService.syncAllUsers();
    if (out && out.total) {
      console.log(`[Tasks] مزامنة الأسماء: ${out.renamed || 0} اسم محدّث من ${out.total} عضو (فشل ${out.failed || 0})`);
    }
  } catch (error) {
    console.error('[Tasks] sync-all:', error.message);
  }
}

async function tickAttendance() {
  try {
    await attendanceService.runDue();
  } catch (error) {
    console.error('[Tasks] attendance:', error.message);
  }
}

/* نافذة الدوام اليومية: تبدأ وتنهي الدوام تلقائيًا حسب الوقت */
async function tickDutyWindow() {
  try {
    const agentService = require('./agent');
    await agentService.syncWindowTick();
  } catch (error) {
    console.error('[Tasks] نافذة الدوام:', error.message);
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
  timers.push(setInterval(tickAttendance, 5 * 60 * 1000));
  timers.push(setInterval(tickDutyWindow, 60 * 1000));
  setTimeout(tickDutyWindow, 20 * 1000);
  setTimeout(tickAttendance, 45 * 1000);
  setTimeout(tickSyncAll, 90 * 1000);
  setTimeout(() => {
    require('./leaderboard').build({ limit: 10 }).catch(() => null);
  }, 130 * 1000);
  setTimeout(async () => {
    try {
      const attendance = require('./attendance');
      const out = await attendance.repairPreJoin({ apply: true });
      console.log('[Tasks] إصلاح ما قبل الانضمام:', out.removedDays, 'يوم —', out.clearedWarnings, 'إنذار');
      const User = require('../models/User');
      const AttendanceDay = require('../models/AttendanceDay');
      const Warning = require('../models/Warning');
      const users = await User.find({}).select('displayName joinedGuildAt createdAt bloodPact rank').lean();
      for (const u of users) {
        const abs = await AttendanceDay.find({ user: u._id, status: 'absent' }).select('dateKey source').lean();
        const warns = await Warning.find({ user: u._id, status: 'active' }).select('dateKey level').lean();
        const d = (v) => (v ? String(v).slice(0, 10) : '-');
        console.log(
          `[Diag] ${u.displayName}: created=${d(u.createdAt)} joined=${d(u.joinedGuildAt)} signed=${d(u.bloodPact && u.bloodPact.signedAt)} abs=${abs.map((a) => a.dateKey + '/' + a.source).join(',') || '-'} warn=${warns.map((w) => w.level + ':' + w.dateKey).join(',') || '-'}`
        );
      }
    } catch (error) {
      console.error('[Tasks] repair-prejoin:', error.message);
    }
  }, 25 * 1000);
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
