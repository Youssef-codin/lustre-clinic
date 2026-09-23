package expo.modules.lustrelistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext

/**
 * Keeps the desk phone's process out of Android's cached state, where it loses
 * the network within seconds and `/ws` with it. The notification is the price
 * Android asks for that.
 *
 * It also holds a headless JS task open for as long as it runs, which is what
 * keeps React Native's timers firing while the app is not in front — the
 * socket's reconnect backoff is a `setTimeout`. RN's own `HeadlessJsTaskService`
 * would do that too, but it holds a wake lock for the task's lifetime, and this
 * task lasts all day.
 */
class LustreListenerService : Service() {
  private var taskId: Int? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification(
      intent?.getStringExtra(EXTRA_TITLE) ?: "Lustre",
      intent?.getStringExtra(EXTRA_BODY) ?: "",
      intent?.getStringExtra(EXTRA_CHANNEL_NAME) ?: "Lustre",
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    UiThreadUtil.runOnUiThread { startTask() }
    // Not restarted if the process dies: a restart would bring JS up headless,
    // with no app mounted to hold the socket.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    UiThreadUtil.runOnUiThread { finishTask() }
    super.onDestroy()
  }

  private fun headlessContext(): HeadlessJsTaskContext? {
    val context = (application as? ReactApplication)?.reactHost?.currentReactContext ?: return null
    return HeadlessJsTaskContext.getInstance(context)
  }

  private fun startTask() {
    val headless = headlessContext() ?: return
    val running = taskId
    if (running != null && headless.isTaskRunning(running)) return
    taskId = headless.startTask(HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), 0, true))
  }

  private fun finishTask() {
    val running = taskId ?: return
    taskId = null
    val headless = headlessContext() ?: return
    if (headless.isTaskRunning(running)) headless.finishTask(running)
  }

  private fun buildNotification(title: String, body: String, channelName: String): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      // Low: it is always there, so it must never make a sound.
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_LOW),
      )
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    return builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setOngoing(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_SERVICE)
      .apply { if (launch != null) setContentIntent(launch) }
      .build()
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_CHANNEL_NAME = "channelName"
    // Registered in `index.ts` with `AppRegistry.registerHeadlessTask`.
    const val TASK_KEY = "LustreListener"
    private const val CHANNEL_ID = "listener"
    private const val NOTIFICATION_ID = 7201
  }
}
