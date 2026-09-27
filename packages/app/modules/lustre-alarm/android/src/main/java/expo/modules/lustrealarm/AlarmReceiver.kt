package expo.modules.lustrealarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_RING -> {
        AlarmSchedule.armNext(context, intent.getLongExtra(EXTRA_AT, System.currentTimeMillis()))
        AlarmService.ring(context, trial = false)
      }
      ACTION_TRY -> AlarmService.ring(context, trial = true)
      ACTION_SNOOZE -> AlarmService.silence(context)
    }
  }

  companion object {
    const val ACTION_RING = "expo.modules.lustrealarm.RING"
    const val ACTION_TRY = "expo.modules.lustrealarm.TRY"
    const val ACTION_SNOOZE = "expo.modules.lustrealarm.SNOOZE"
    const val EXTRA_AT = "at"
  }
}

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      AlarmSchedule.armNext(context, System.currentTimeMillis())
    }
  }
}
