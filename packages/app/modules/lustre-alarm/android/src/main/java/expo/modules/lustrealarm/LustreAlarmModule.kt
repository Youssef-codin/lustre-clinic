package expo.modules.lustrealarm

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class AlarmCopyRecord : Record {
  @Field var title: String = ""
  @Field var body: String = ""
  @Field var snooze: String = ""
  @Field var open: String = ""
  @Field var channelName: String = ""

  fun toCopy() = AlarmCopy(title, body, snooze, open, channelName)
}

class AlarmCheckRecord : Record {
  @Field var bases: List<String> = emptyList()
  @Field var pendingPath: String = ""
  @Field var settingsPath: String = ""
  @Field var today: String = ""

  fun toCheck() = ReminderCheck.Check(bases, pendingPath, settingsPath, today)
}

class LustreAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LustreAlarm")

    // Replaces the whole series. A ring already going is left alone: the
    // series is re-armed on every foreground and every refetch.
    Function("schedule") { at: List<Double>, copy: AlarmCopyRecord, check: AlarmCheckRecord?, rings: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      AlarmSchedule.replace(context, at.map { it.toLong() }, copy.toCopy(), check?.toCheck(), rings)
    }

    Function("tryIn") { ms: Double, copy: AlarmCopyRecord ->
      val context = appContext.reactContext ?: return@Function false
      AlarmSchedule.tryAt(context, System.currentTimeMillis() + ms.toLong(), copy.toCopy())
    }

    Function("takeOpenRequest") {
      val requested = AlarmActivity.openRequested
      AlarmActivity.openRequested = false
      requested
    }

    Function("cancel") {
      val context = appContext.reactContext ?: return@Function Unit
      AlarmSchedule.clear(context)
      if (!AlarmService.trial) AlarmService.silence(context)
    }

    // Android 14 lets the user take full-screen intents away, and Play takes
    // them from any app that is not a clock or a phone. Without it the ring is
    // a banner, still sounding.
    Function("canFullScreen") {
      val context = appContext.reactContext ?: return@Function false
      Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
        context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    }

    Function("openFullScreenSettings") {
      val context = appContext.reactContext ?: return@Function Unit
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return@Function Unit
      context.startActivity(
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }
  }
}
