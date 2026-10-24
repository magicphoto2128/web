// ============================================================================
// PLACEHOLDER FILE — DO NOT USE AS-IS.
//
// This file is intentionally filled with placeholder values. The app will NOT
// connect to Firebase until you replace it with a real configuration.
//
// TO GENERATE THE REAL FILE:
//   1. Create a free Firebase (Spark) project at https://console.firebase.google.com
//   2. Enable Firestore, Storage, and Anonymous Authentication.
//   3. Install the CLI:  dart pub global activate flutterfire_cli
//   4. From the project root run:  flutterfire configure
//      -> This OVERWRITES this file with your project's real values.
//
// See SETUP.md for the full, ordered setup instructions.
// ============================================================================

import 'package:firebase_core/firebase_core.dart'
    show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Default [FirebaseOptions] for use with your Firebase apps.
///
/// Example:
/// ```dart
/// import 'firebase_options.dart';
/// // ...
/// await Firebase.initializeApp(
///   options: DefaultFirebaseOptions.currentPlatform,
/// );
/// ```
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return ios;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not configured for this platform. '
          'Run `flutterfire configure` to generate a real firebase_options.dart.',
        );
    }
  }

  // TODO(setup): Replace every 'REPLACE_ME' value below by running
  // `flutterfire configure`. These are placeholders only.
  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'REPLACE_ME',
    appId: 'REPLACE_ME',
    messagingSenderId: 'REPLACE_ME',
    projectId: 'REPLACE_ME',
    authDomain: 'REPLACE_ME',
    storageBucket: 'REPLACE_ME',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'REPLACE_ME',
    appId: 'REPLACE_ME',
    messagingSenderId: 'REPLACE_ME',
    projectId: 'REPLACE_ME',
    storageBucket: 'REPLACE_ME',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'REPLACE_ME',
    appId: 'REPLACE_ME',
    messagingSenderId: 'REPLACE_ME',
    projectId: 'REPLACE_ME',
    storageBucket: 'REPLACE_ME',
    iosBundleId: 'REPLACE_ME',
  );
}
