package expo.modules.lustrealarm

import android.os.SystemClock
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONException
import org.json.JSONObject

/**
 * Asks the clinic server, just before a ring, whether there is still anything
 * to ring about: the list can have been cleared or dismissed on the other phone
 * since this one last opened the app and armed the series.
 *
 * Only a definite no skips the ring. Unreachable, slow, or an answer it cannot
 * read all ring: an alarm missed over a flaky wifi is worse than one too many.
 */
object ReminderCheck {
  data class Check(val bases: List<String>, val pendingPath: String, val settingsPath: String, val today: String)

  private const val TIMEOUT_MS = 2_000L
  // Not worth asking an address with less than this left for its two requests.
  private const val MIN_TIMEOUT_MS = 500L
  // Inside the ~10 s Android gives an alarm to start its foreground service,
  // with room left to start it.
  private const val BUDGET_MS = 6_000L

  fun shouldRing(check: Check): Boolean {
    val deadline = SystemClock.elapsedRealtime() + BUDGET_MS
    for (base in check.bases) {
      // Each address gets what is left, not a fixed share: the LAN address
      // timing out on mobile data must still leave time for Tailscale.
      val timeout = minOf(TIMEOUT_MS, (deadline - SystemClock.elapsedRealtime()) / 2)
      if (timeout < MIN_TIMEOUT_MS) break
      val pending = get(base + check.pendingPath, timeout) ?: continue
      val settings = get(base + check.settingsPath, timeout) ?: continue
      return try {
        val due = JSONObject(pending).getJSONObject("result").getJSONArray("data").length() > 0
        val dismissedOn = JSONObject(settings).getJSONObject("result").getJSONObject("data").optString("reminderDismissedOn")
        due && dismissedOn != check.today
      } catch (_: JSONException) {
        true
      }
    }
    return true
  }

  private fun get(url: String, timeoutMs: Long): String? =
    try {
      val connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = timeoutMs.toInt()
      connection.readTimeout = timeoutMs.toInt()
      try {
        if (connection.responseCode == HttpURLConnection.HTTP_OK) {
          connection.inputStream.bufferedReader().use { it.readText() }
        } else {
          null
        }
      } finally {
        connection.disconnect()
      }
    } catch (_: IOException) {
      null
    }
}
