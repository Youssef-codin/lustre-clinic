package expo.modules.lustrelistener

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LustreListenerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LustreListener")

    // False when Android refused: a foreground service can only be started
    // while the app is in front, and JS asks again on the next foreground.
    Function("start") { title: String, body: String, channelName: String ->
      val context = appContext.reactContext ?: return@Function false
      val intent = Intent(context, LustreListenerService::class.java)
        .putExtra(LustreListenerService.EXTRA_TITLE, title)
        .putExtra(LustreListenerService.EXTRA_BODY, body)
        .putExtra(LustreListenerService.EXTRA_CHANNEL_NAME, channelName)
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

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      context.stopService(Intent(context, LustreListenerService::class.java))
    }
  }
}
