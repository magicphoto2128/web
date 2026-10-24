import 'package:flutter/material.dart';

import '../main.dart';
import '../models/magic_photo.dart';
import '../widgets/loading_indicator.dart';
import 'photo_detail_screen.dart';
import 'scan_screen.dart';
import 'upload_screen.dart';

/// Gallery of the current user's magic photos, with Upload and Scan actions.
class HomeScreen extends StatelessWidget {
  static const String routeName = '/';

  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Magic Photo'),
        actions: [
          IconButton(
            tooltip: 'Scan a photo',
            icon: const Icon(Icons.qr_code_scanner),
            onPressed: () =>
                Navigator.of(context).pushNamed(ScanScreen.routeName),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () =>
            Navigator.of(context).pushNamed(UploadScreen.routeName),
        icon: const Icon(Icons.add_a_photo),
        label: const Text('Upload'),
      ),
      body: StreamBuilder<List<MagicPhoto>>(
        stream: firebaseService.streamMyPhotos(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return _ErrorState(message: '${snapshot.error}');
          }
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const LoadingIndicator(label: 'Loading your photos…');
          }
          final photos = snapshot.data ?? const <MagicPhoto>[];
          if (photos.isEmpty) {
            return const _EmptyState();
          }
          return GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
            ),
            itemCount: photos.length,
            itemBuilder: (context, i) => _PhotoTile(photo: photos[i]),
          );
        },
      ),
    );
  }
}

class _PhotoTile extends StatelessWidget {
  final MagicPhoto photo;

  const _PhotoTile({required this.photo});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.of(context).pushNamed(
        PhotoDetailScreen.routeName,
        arguments: photo,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              photo.photoUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const ColoredBox(
                color: Colors.black12,
                child: Icon(Icons.broken_image, size: 40),
              ),
              loadingBuilder: (context, child, progress) {
                if (progress == null) return child;
                return const ColoredBox(
                  color: Colors.black12,
                  child: Center(
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                );
              },
            ),
            const Align(
              alignment: Alignment.bottomRight,
              child: Padding(
                padding: EdgeInsets.all(6),
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: Colors.black54,
                  child: Icon(Icons.play_arrow, color: Colors.white, size: 20),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Icon(Icons.photo_library_outlined, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              'No magic photos yet.',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8),
            Text(
              'Tap Upload to link a photo to a video, or Scan to recognize '
              'a photo with your camera.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;

  const _ErrorState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 12),
            const Text('Could not load your photos.'),
            const SizedBox(height: 8),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
