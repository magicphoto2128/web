import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// Typed arguments for [VideoPlayerScreen]. `photoUrl` is carried for back
/// context (returning to the photo the video belongs to).
class VideoPlayerArgs {
  final String videoUrl;
  final String photoUrl;

  const VideoPlayerArgs({required this.videoUrl, required this.photoUrl});
}

/// Plays the linked video with a back button that returns to the photo.
class VideoPlayerScreen extends StatefulWidget {
  static const String routeName = '/video';

  final VideoPlayerArgs args;

  const VideoPlayerScreen({super.key, required this.args});

  @override
  State<VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<VideoPlayerScreen> {
  late final VideoPlayerController _controller;
  late final Future<void> _initFuture;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _controller =
        VideoPlayerController.networkUrl(Uri.parse(widget.args.videoUrl));
    _initFuture = _controller.initialize().then((_) {
      _controller.play();
      if (mounted) setState(() {});
    }).catchError((Object e) {
      if (mounted) setState(() => _error = e);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _togglePlay() {
    setState(() {
      _controller.value.isPlaying ? _controller.pause() : _controller.play();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        // Back button returns to the photo (pops this route).
        leading: BackButton(onPressed: () => Navigator.of(context).pop()),
        title: const Text('Video'),
      ),
      body: Center(
        child: _error != null
            ? Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline,
                        color: Colors.white70, size: 48),
                    const SizedBox(height: 12),
                    const Text('Could not play this video.',
                        style: TextStyle(color: Colors.white)),
                    const SizedBox(height: 8),
                    Text('$_error',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white54)),
                  ],
                ),
              )
            : FutureBuilder<void>(
                future: _initFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done ||
                      !_controller.value.isInitialized) {
                    return const CircularProgressIndicator();
                  }
                  return AspectRatio(
                    aspectRatio: _controller.value.aspectRatio,
                    child: Stack(
                      alignment: Alignment.bottomCenter,
                      children: [
                        GestureDetector(
                          onTap: _togglePlay,
                          child: VideoPlayer(_controller),
                        ),
                        VideoProgressIndicator(_controller,
                            allowScrubbing: true),
                        if (!_controller.value.isPlaying)
                          const Icon(Icons.play_arrow,
                              size: 72, color: Colors.white70),
                      ],
                    ),
                  );
                },
              ),
      ),
      floatingActionButton: _error == null && _controller.value.isInitialized
          ? FloatingActionButton(
              onPressed: _togglePlay,
              child: Icon(
                _controller.value.isPlaying ? Icons.pause : Icons.play_arrow,
              ),
            )
          : null,
    );
  }
}
