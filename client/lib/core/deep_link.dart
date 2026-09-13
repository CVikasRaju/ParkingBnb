import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:url_launcher/url_launcher_string.dart' show launchUrlString;

/// OS-native navigation deep links (no embedded map SDK).
///
/// Implements the strategy from docs/ARCHITECTURE.md §3: build a
/// `google.navigation:` / `maps://` URI targeting the spot coordinates and
/// fire it through [url_launcher]. Returns false when no handler is installed.
class NavigationLauncher {
  /// Build the deep-link URI for the current platform.
  @visibleForTesting
  static String buildUri({
    required double destLat,
    required double destLng,
    String? travelMode, // 'd' driving (default), 'w' walking
  }) {
    final mode = travelMode ?? 'd';
    if (kIsWeb) {
      return 'https://www.google.com/maps/dir/?api=1&destination=$destLat,$destLng&travelmode=$mode';
    }
    return switch (defaultTargetPlatform) {
      TargetPlatform.iOS =>
        'comgooglemaps://?daddr=$destLat,$destLng&directionsmode=$mode',
      _ => 'google.navigation:q=$destLat,$destLng&mode=$mode',
    };
  }

  /// Fire the native turn-by-turn deep link.
  /// Falls back to the Google Maps web URL if the native intent is missing.
  Future<bool> launchTurnByTurnNavigation({
    required double destLat,
    required double destLng,
  }) async {
    final uri = buildUri(destLat: destLat, destLng: destLng);
    final ok = await launchUrlString(
      uri,
      mode: LaunchMode.externalApplication,
    );
    if (ok) return true;

    // Fallback: universal web link on platforms without the native app.
    final web = 'https://www.google.com/maps/dir/?api=1'
        '&destination=$destLat,$destLng&travelmode=d';
    try {
      return await launchUrlString(web,
          mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }
}