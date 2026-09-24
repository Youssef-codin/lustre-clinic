package expo.modules.lustrelistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext

/**
 * Keeps the process out of Android's cached state, where it loses the network
 * within seconds and `/ws` with it. The notification is the price Android asks
 * for that. On the desk phone it listens for the doctor; on the doctor's it
 * carries the visit in the chair and its Finish action, which is only any use
 * in the background because this keeps the network up for the call it makes.
 *
 * It also holds a headless JS task open for as long as it runs, which is what
 * keeps React Native's timers firing while the app is not in front — the
 * socket's reconnect backoff is a `setTimeout`. RN's own `HeadlessJsTaskService`
 * would do that too, but it holds a wake lock for the task's lifetime, and this
 * task lasts all day.
 */
class LustreListenerService : Service() {
  private var taskId: Int? = null
  @Volatile private var notice: Notice? = null
  private var foreground = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_FINISH) {
      finishTapped(intent.getStringExtra(EXTRA_ACTION_ID))
      return START_NOT_STICKY
    }

    val next = Notice.from(intent?.extras)
    notice = next
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, buildNotification(next), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, buildNotification(next))
    }
    foreground = true
    running = this
    UiThreadUtil.runOnUiThread { startTask() }
    // Not restarted if the process dies: a restart would bring JS up headless,
    // with no app mounted to hold the socket.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    if (running === this) running = null
    UiThreadUtil.runOnUiThread { finishTask() }
    super.onDestroy()
  }

  /** Redraws the ongoing notification without a start request, which Android refuses from the background. */
  fun show(next: Notice) {
    notice = next
    getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(next))
  }

  private fun finishTapped(id: String?) {
    val current = notice
    // A tap that outlived its service — the notification goes with it, but the
    // intent can already be on its way — or one for a visit no longer shown.
    if (!foreground || current == null || id == null || current.actionId != id) {
      if (!foreground) stopSelf()
      return
    }
    // The action goes before JS hears of the tap, so a second tap has nothing
    // to land on while the first is still in flight.
    show(current.copy(body = current.pendingBody ?: current.body, actionLabel = null, actionId = null))
    finishListener?.invoke(id)
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

  private fun builder(): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

  // The white "C" `expo-notifications` generates from assets/notification-icon.png.
  // The launcher icon is full colour, and Android draws that as a white blob.
  private fun smallIcon(): Int =
    resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 } ?: applicationInfo.icon

  private fun buildNotification(notice: Notice): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Low: it is always there, so it must never make a sound.
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, notice.channelName, NotificationManager.IMPORTANCE_LOW),
      )
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    val builder = builder()
      .setSmallIcon(smallIcon())
      .setColor(ACCENT)
      .setLargeIcon(Icon.createWithResource(this, applicationInfo.icon))
      .setContentTitle(notice.title)
      .setContentText(notice.body)
      .setStyle(Notification.BigTextStyle().bigText(notice.body))
      .setOngoing(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_SERVICE)
      .apply { if (launch != null) setContentIntent(launch) }

    // A patient's name, however little of it, stays off the lock screen.
    if (notice.publicTitle != null) {
      builder
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .setPublicVersion(
          builder().setSmallIcon(smallIcon()).setColor(ACCENT).setContentTitle(notice.publicTitle).setShowWhen(false).build(),
        )
    }

    if (notice.actionLabel != null && notice.actionId != null) {
      val tap = Intent(this, LustreListenerService::class.java)
        .setAction(ACTION_FINISH)
        .putExtra(EXTRA_ACTION_ID, notice.actionId)
      val pending = PendingIntent.getService(
        this,
        1,
        tap,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      builder.addAction(
        Notification.Action.Builder(Icon.createWithResource(this, smallIcon()), notice.actionLabel, pending)
          .build(),
      )
    }

    return builder.build()
  }

  data class Notice(
    val title: String,
    val body: String,
    val channelName: String,
    val publicTitle: String? = null,
    val actionLabel: String? = null,
    val actionId: String? = null,
    val pendingBody: String? = null,
  ) {
    fun toExtras(intent: Intent): Intent = intent
      .putExtra(EXTRA_TITLE, title)
      .putExtra(EXTRA_BODY, body)
      .putExtra(EXTRA_CHANNEL_NAME, channelName)
      .putExtra(EXTRA_PUBLIC_TITLE, publicTitle)
      .putExtra(EXTRA_ACTION_LABEL, actionLabel)
      .putExtra(EXTRA_ACTION_ID, actionId)
      .putExtra(EXTRA_PENDING_BODY, pendingBody)

    companion object {
      fun from(extras: Bundle?) = Notice(
        title = extras?.getString(EXTRA_TITLE) ?: "Lustre",
        body = extras?.getString(EXTRA_BODY) ?: "",
        channelName = extras?.getString(EXTRA_CHANNEL_NAME) ?: "Lustre",
        publicTitle = extras?.getString(EXTRA_PUBLIC_TITLE),
        actionLabel = extras?.getString(EXTRA_ACTION_LABEL),
        actionId = extras?.getString(EXTRA_ACTION_ID),
        pendingBody = extras?.getString(EXTRA_PENDING_BODY),
      )
    }
  }

  companion object {
    // `color.accent` in src/theme/tokens.ts.
    private const val ACCENT = 0xFF2F5BFF.toInt()
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_BODY = "body"
    private const val EXTRA_CHANNEL_NAME = "channelName"
    private const val EXTRA_PUBLIC_TITLE = "publicTitle"
    private const val EXTRA_ACTION_LABEL = "actionLabel"
    private const val EXTRA_ACTION_ID = "actionId"
    private const val EXTRA_PENDING_BODY = "pendingBody"
    private const val ACTION_FINISH = "expo.modules.lustrelistener.FINISH"
    // Registered in `index.ts` with `AppRegistry.registerHeadlessTask`.
    const val TASK_KEY = "LustreListener"
    private const val CHANNEL_ID = "listener"
    private const val NOTIFICATION_ID = 7201

    @Volatile
    var running: LustreListenerService? = null
      private set

    /** Set by the module while JS is there to hear it. */
    @Volatile
    var finishListener: ((String) -> Unit)? = null
  }
}
