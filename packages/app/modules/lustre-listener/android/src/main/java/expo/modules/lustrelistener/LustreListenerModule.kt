package expo.modules.lustrelistener

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class NoticeRecord : Record {
  @Field var title: String = ""
  @Field var body: String = ""
  @Field var channelName: String = ""
  @Field var publicTitle: String? = null
  @Field var actionLabel: String? = null
  @Field var actionId: String? = null
  @Field var pendingBody: String? = null

  fun toNotice() = LustreListenerService.Notice(
    title, body, channelName, publicTitle, actionLabel, actionId, pendingBody,
  )
}

class LustreListenerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LustreListener")

    Events("onFinish")

    OnStartObserving {
      LustreListenerService.finishListener = { id -> sendEvent("onFinish", mapOf("id" to id)) }
    }

    OnStopObserving {
      LustreListenerService.finishListener = null
    }

    // False when Android refused: a foreground service can only be started
    // while the app is in front, and JS asks again on the next foreground.
    Function("start") { notice: NoticeRecord ->
      val context = appContext.reactContext ?: return@Function false
      val intent = notice.toNotice().toExtras(Intent(context, LustreListenerService::class.java))
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (_: IllegalStateException) {
        false
      }
    }

    // False when nothing is running to redraw.
    Function("update") { notice: NoticeRecord ->
      val service = LustreListenerService.running ?: return@Function false
      service.show(notice.toNotice())
      true
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      context.stopService(Intent(context, LustreListenerService::class.java))
    }
  }
}
