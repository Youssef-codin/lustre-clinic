package expo.modules.lustrealarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** The words on the ringing screen, worded by JS in the app's language when it arms. */
data class AlarmCopy(
  val title: String,
  val body: String,
  val snooze: String,
  val open: String,
  val channelName: String,
)

/**
 * The series JS last armed, kept on disk because what reads it — the alarm
 * firing, the phone booting — runs with no JS at all. Only the next ring is ever
 * with `AlarmManager`, and each ring arms the one after it, so the alarm icon in
 * the status bar shows the next ring rather than the last.
 *
 * `setAlarmClock` rather than an exact alarm: it is the one Doze never defers,
 * and the one that lets the ring start a foreground service from the background.
 */
object AlarmSchedule {
  private const val PREFS = "lustre.alarm"
  private const val KEY_AT = "at"
  private const val KEY_TITLE = "title"
  private const val KEY_BODY = "body"
  private const val KEY_SNOOZE = "snooze"
  private const val KEY_OPEN = "open"
  private const val KEY_CHANNEL = "channelName"

  /** False when Android refused the alarm: the exact-alarm permission revoked, on 12. */
  fun replace(context: Context, at: List<Long>, copy: AlarmCopy): Boolean {
    saveCopy(context, copy)
    prefs(context).edit().putString(KEY_AT, at.sorted().joinToString(",")).apply()
    return armNext(context, System.currentTimeMillis())
  }

  /**
   * One ring at `at`, beside the series rather than in it, so trying the alarm
   * out never moves the day's real ones. For demo mode.
   */
  fun tryAt(context: Context, at: Long, copy: AlarmCopy): Boolean {
    saveCopy(context, copy)
    val ring = PendingIntent.getBroadcast(
      context,
      1,
      Intent(context, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_TRY),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    return try {
      context.getSystemService(AlarmManager::class.java)
        .setAlarmClock(AlarmManager.AlarmClockInfo(at, showIntent(context)), ring)
      true
    } catch (_: SecurityException) {
      false
    }
  }

  private fun saveCopy(context: Context, copy: AlarmCopy) {
    prefs(context).edit()
      .putString(KEY_TITLE, copy.title)
      .putString(KEY_BODY, copy.body)
      .putString(KEY_SNOOZE, copy.snooze)
      .putString(KEY_OPEN, copy.open)
      .putString(KEY_CHANNEL, copy.channelName)
      .apply()
  }

  fun clear(context: Context) {
    prefs(context).edit().clear().apply()
    context.getSystemService(AlarmManager::class.java).cancel(ringIntent(context, 0))
  }

  /** Arms the first ring strictly after `after`, or cancels when there is none left today. */
  fun armNext(context: Context, after: Long): Boolean {
    val manager = context.getSystemService(AlarmManager::class.java)
    val next = times(context).firstOrNull { it > after }
    if (next == null) {
      manager.cancel(ringIntent(context, 0))
      return true
    }
    return try {
      manager.setAlarmClock(AlarmManager.AlarmClockInfo(next, showIntent(context)), ringIntent(context, next))
      true
    } catch (_: SecurityException) {
      false
    }
  }

  fun copy(context: Context): AlarmCopy {
    val prefs = prefs(context)
    return AlarmCopy(
      title = prefs.getString(KEY_TITLE, null) ?: "Reminders pending",
      body = prefs.getString(KEY_BODY, null) ?: "",
      snooze = prefs.getString(KEY_SNOOZE, null) ?: "Snooze",
      open = prefs.getString(KEY_OPEN, null) ?: "Open",
      channelName = prefs.getString(KEY_CHANNEL, null) ?: "Reminder alarm",
    )
  }

  private fun times(context: Context): List<Long> =
    prefs(context).getString(KEY_AT, null)
      ?.split(",")
      ?.mapNotNull { it.toLongOrNull() }
      ?: emptyList()

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // One request code for every ring, so arming the next replaces the last and
  // one cancel clears it. The instant rides along so the ring can arm the one
  // after it without re-arming itself a moment early.
  private fun ringIntent(context: Context, at: Long): PendingIntent = PendingIntent.getBroadcast(
    context,
    0,
    Intent(context, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_RING).putExtra(AlarmReceiver.EXTRA_AT, at),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )

  // What tapping the alarm in the notification shade opens.
  private fun showIntent(context: Context): PendingIntent? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}
