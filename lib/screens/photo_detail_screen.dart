import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../models/magic_photo.dart';
import '../widgets/play_button_overlay.dart';
import 'video_player_screen.dart';

/// Shows a stored photo full-bleed with a play-button overlay. Tapping play
/// opens the linked video; a Share action shares the photo, the video, and a
/// deep-link-style reference via the OS share sheet.
class PhotoDetailScreen extends StatelessWidget {
  static const String routeName = '/detail';

  // Deep-link scheme used in shared text. NOTE: full custom-scheme deep-link
  // ROUTING (opening the app straight to this photo) is a documented follow-up
  // (see README). Here we only share a referencing link/text.
  static const String _deepLinkPrefix = 'magicphoto://photo/';

  final MagicPhoto photo;

  const PhotoDetailScreen({super.key, required this.photo});

  void _openVideo(BuildContext context) {
    Navigator.of(context).pushNamed(
      VideoPlayerScreen.routeName,
      arguments: VideoPlayerArgs(
        videoUrl: photo.videoUrl,
        photoUrl: photo.photoUrl,
      ),
    );
  }

  Future<void> _share() async {
    final deepLink = '$_deepLinkPrefix${photo.id}';
    final text = 'Check out my Magic Photo! 📷➡️🎬\n\n'
        'Photo: ${photo.photoUrl}\n'
        'Video: ${photo.videoUrl}\n'
        'Open in app: $deepLink';
    await Share.share(text, subject: 'A Magic Photo for you');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Magic Photo'),
        actions: [
          IconButton(
            tooltip: 'Share',
            icon: const Icon(Icons.share),
            onPressed: _share,
          ),
        ],
      ),
      body: Center(
        child: PlayButtonOverlay(
          onPressed: () => _openVideo(context),
          child: Image.network(
            photo.photoUrl,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const Center(
              child: Icon(Icons.broken_image, color: Colors.white54, size: 64),
            ),
            loadingBuilder: (context, child, progress) {
              if (progress == null) return child;
              return const Center(child: CircularProgressIndicator());
            },
          ),
        ),
      ),
    );
  }
}
