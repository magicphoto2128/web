import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'firebase_options.dart';
import 'models/magic_photo.dart';
import 'screens/home_screen.dart';
import 'screens/photo_detail_screen.dart';
import 'screens/scan_screen.dart';
import 'screens/upload_screen.dart';
import 'screens/video_player_screen.dart';
import 'services/firebase_service.dart';
import 'widgets/loading_indicator.dart';

/// Shared service instance used across screens.
final FirebaseService firebaseService = FirebaseService();

void main() {
  // Firebase init + anonymous sign-in happen inside [_Bootstrap] so we can show
  // loading/error UI instead of a blank screen or a hard crash.
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MagicPhotoApp());
}

class MagicPhotoApp extends StatelessWidget {
  const MagicPhotoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Magic Photo',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: const _Bootstrap(),
      onGenerateRoute: _onGenerateRoute,
    );
  }

  /// Named-route table with typed arguments passed via route settings.
  static Route<dynamic>? _onGenerateRoute(RouteSettings settings) {
    switch (settings.name) {
      case HomeScreen.routeName:
        return MaterialPageRoute(
          builder: (_) => const HomeScreen(),
          settings: settings,
        );
      case UploadScreen.routeName:
        return MaterialPageRoute(
          builder: (_) => const UploadScreen(),
          settings: settings,
        );
      case ScanScreen.routeName:
        return MaterialPageRoute(
          builder: (_) => const ScanScreen(),
          settings: settings,
        );
      case PhotoDetailScreen.routeName:
        final photo = settings.arguments as MagicPhoto;
        return MaterialPageRoute(
          builder: (_) => PhotoDetailScreen(photo: photo),
          settings: settings,
        );
      case VideoPlayerScreen.routeName:
        final args = settings.arguments as VideoPlayerArgs;
        return MaterialPageRoute(
          builder: (_) => VideoPlayerScreen(args: args),
          settings: settings,
        );
      default:
        return null;
    }
  }
}

/// Initializes Firebase and signs the user in anonymously, then shows the home
/// screen. Surfaces a loading state while that work runs and an error state if
/// it fails (most commonly: `firebase_options.dart` not yet configured).
class _Bootstrap extends StatefulWidget {
  const _Bootstrap();

  @override
  State<_Bootstrap> createState() => _BootstrapState();
}

class _BootstrapState extends State<_Bootstrap> {
  late Future<void> _init;

  @override
  void initState() {
    super.initState();
    _init = _bootstrap();
  }

  Future<void> _bootstrap() async {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    await firebaseService.ensureSignedIn();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _init,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: LoadingIndicator(label: 'Starting Magic Photo…'),
          );
        }
        if (snapshot.hasError) {
          return _InitError(
            error: snapshot.error!,
            onRetry: () => setState(() => _init = _bootstrap()),
          );
        }
        return const HomeScreen();
      },
    );
  }
}

class _InitError extends StatelessWidget {
  final Object error;
  final VoidCallback onRetry;

  const _InitError({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 16),
              const Text(
                'Could not start the app.',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Firebase failed to initialize. If this is a fresh checkout, '
                'run `flutterfire configure` to generate firebase_options.dart '
                '(see SETUP.md).',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text('$error',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.grey)),
              const SizedBox(height: 16),
              FilledButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      ),
    );
  }
}
