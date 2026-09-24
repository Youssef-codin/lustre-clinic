package expo.modules.lustrewhatsapp

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LustreWhatsAppModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LustreWhatsApp")

    Function("isInstalled") { packageName: String ->
      val manager = appContext.reactContext?.packageManager ?: return@Function false
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          manager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
        } else {
          @Suppress("DEPRECATION")
          manager.getPackageInfo(packageName, 0)
        }
        true
      } catch (_: PackageManager.NameNotFoundException) {
        false
      }
    }

    // An explicit package skips the "Open with" chooser and any "Always"
    // default someone set on it.
    Function("openInPackage") { url: String, packageName: String ->
      val activity = appContext.currentActivity ?: return@Function false
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(packageName)
      try {
        activity.startActivity(intent)
        true
      } catch (_: ActivityNotFoundException) {
        false
      }
    }
  }
}
