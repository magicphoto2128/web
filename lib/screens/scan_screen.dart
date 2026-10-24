import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;
import 'package:permission_handler/permission_handler.dart';

import '../main.dart';
import '../models/magic_photo.dart';
import '../services/image_matcher.dart';
import 'video_player_screen.dart';

/// Live camera scan screen.
///
/// SCAN -> MATCH -> PLAY path:
///   1. Request camera permission (permission_handler), init a CameraController.
///   2. startImageStream delivers frames; we throttle to ~1 frame / 700ms and
///      skip frames while a comparison is already running.
///   3. Each processed frame is converted (YUV420 / BGRA8888) into an
///      `image` package Image, then hashed by PerceptualHashMatcher.
///   4. The frame hash is compared (Hamming distance) against every stored
///      record's perceptualHash (fetched once at scan start). The closest
///      record within the matcher threshold wins.
///   5. On a match we stop the stream, dispose the camera, and navigate to the
///      VideoPlayerScreen for that record's video.
class ScanScreen extends StatefulWidget {
  static const String routeName = '/scan';

  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

enum _ScanStatus { initializing, scanning, permissionDenied, matched, error }

class _ScanScreenState extends State<ScanScreen> with WidgetsBindingObserver {
  static const Duration _throttle = Duration(milliseconds: 700);

  final PerceptualHashMatcher _matcher = const PerceptualHashMatcher();

  CameraController? _controller;
  List<MagicPhoto> _records = const <MagicPhoto>[];

  _ScanStatus _status = _ScanStatus.initializing;
  String? _errorMessage;

  bool _processing = false;
  DateTime _lastProcessed = DateTime.fromMillisecondsSinceEpoch(0);
  bool _navigated = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopCamera();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      _stopCamera();
    } else if (state == AppLifecycleState.resumed) {
      _start();
    }
  }

  Future<void> _start() async {
    setState(() {
      _status = _ScanStatus.initializing;
      _errorMessage = null;
    });

    // 1. Camera permission.
    final granted = await Permission.camera.request();
    if (!granted.isGranted) {
      if (mounted) setState(() => _status = _ScanStatus.permissionDenied);
      return;
    }

    try {
      // Load the candidate records once for this scan session.
      _records = await firebaseService.fetchAllRecords();

      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        throw StateError('No camera available on this device.');
      }
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        back,
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.yuv420,
      );
      _controller = controller;
      await controller.initialize();
      if (!mounted) return;

      await controller.startImageStream(_onFrame);
      setState(() => _status = _ScanStatus.scanning);
    } catch (e) {
      if (mounted) {
        setState(() {
          _status = _ScanStatus.error;
          _errorMessage = '$e';
        });
      }
    }
  }

  Future<void> _stopCamera() async {
    final controller = _controller;
    _controller = null;
    if (controller == null) return;
    try {
      if (controller.value.isStreamingImages) {
        await controller.stopImageStream();
      }
    } catch (_) {
      // ignore stop errors during teardown
    }
    await controller.dispose();
  }

  void _onFrame(CameraImage frame) {
    if (_navigated || _processing) return;
    final now = DateTime.now();
    if (now.difference(_lastProcessed) < _throttle) return;
    _lastProcessed = now;
    _processing = true;

    // Run the (CPU-bound but small) conversion + hashing inline, then compare.
    try {
      final image = _convertToImage(frame);
      if (image != null) {
        final frameHash = _matcher.computeHashFromImage(image);
        final match = _findBestMatch(frameHash);
        if (match != null) {
          _onMatch(match);
          return;
        }
      }
    } catch (_) {
      // A single bad frame should not kill the scan; keep going.
    } finally {
      _processing = false;
    }
  }

  /// Pick the stored record with the smallest Hamming distance within the
  /// matcher threshold, or null if none qualifies.
  MagicPhoto? _findBestMatch(String frameHash) {
    MagicPhoto? best;
    var bestDistance = 1 << 30;
    for (final record in _records) {
      if (record.perceptualHash.isEmpty) continue;
      final distance = _matcher.hammingDistance(frameHash, record.perceptualHash);
      if (distance <= _matcher.threshold && distance < bestDistance) {
        bestDistance = distance;
        best = record;
      }
    }
    return best;
  }

  Future<void> _onMatch(MagicPhoto record) async {
    if (_navigated) return;
    _navigated = true;
    if (mounted) setState(() => _status = _ScanStatus.matched);
    await _stopCamera();
    if (!mounted) return;
    await Navigator.of(context).pushReplacementNamed(
      VideoPlayerScreen.routeName,
      arguments: VideoPlayerArgs(
        videoUrl: record.videoUrl,
        photoUrl: record.photoUrl,
      ),
    );
  }

  /// Convert a [CameraImage] to an `image` package [img.Image].
  /// Supports YUV420 (Android) and BGRA8888 (iOS). Returns null on an
  /// unexpected format.
  img.Image? _convertToImage(CameraImage frame) {
    switch (frame.format.group) {
      case ImageFormatGroup.yuv420:
        return _yuv420ToImage(frame);
      case ImageFormatGroup.bgra8888:
        return _bgra8888ToImage(frame);
      default:
        return null;
    }
  }

  img.Image _bgra8888ToImage(CameraImage frame) {
    return img.Image.fromBytes(
      width: frame.width,
      height: frame.height,
      bytes: frame.planes[0].bytes.buffer,
      rowStride: frame.planes[0].bytesPerRow,
      order: img.ChannelOrder.bgra,
    );
  }

  img.Image _yuv420ToImage(CameraImage frame) {
    final width = frame.width;
    final height = frame.height;
    final image = img.Image(width: width, height: height);

    final yPlane = frame.planes[0];
    final uPlane = frame.planes[1];
    final vPlane = frame.planes[2];

    final yRowStride = yPlane.bytesPerRow;
    final uvRowStride = uPlane.bytesPerRow;
    // Chroma pixel stride is 2 for interleaved NV21-like layouts, 1 otherwise.
    final uvPixelStride = uPlane.bytesPerPixel ?? 1;

    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        final yIndex = y * yRowStride + x;
        final uvIndex =
            (y >> 1) * uvRowStride + (x >> 1) * uvPixelStride;

        final yp = yPlane.bytes[yIndex];
        final up = uPlane.bytes[uvIndex];
        final vp = vPlane.bytes[uvIndex];

        // YUV -> RGB (BT.601).
        var r = (yp + 1.402 * (vp - 128)).round();
        var g =
            (yp - 0.344136 * (up - 128) - 0.714136 * (vp - 128)).round();
        var b = (yp + 1.772 * (up - 128)).round();

        r = r.clamp(0, 255);
        g = g.clamp(0, 255);
        b = b.clamp(0, 255);

        image.setPixelRgb(x, y, r, g, b);
      }
    }
    return image;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Scan a photo'),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    switch (_status) {
      case _ScanStatus.permissionDenied:
        return _PermissionDenied(onOpenSettings: openAppSettings);
      case _ScanStatus.error:
        return _ScanError(message: _errorMessage ?? 'Unknown error',
            onRetry: _start);
      case _ScanStatus.initializing:
        return const _CenteredHint(
          icon: Icons.photo_camera,
          text: 'Preparing camera…',
          showSpinner: true,
        );
      case _ScanStatus.matched:
        return const _CenteredHint(
          icon: Icons.check_circle,
          text: 'Match found! Opening video…',
          showSpinner: true,
        );
      case _ScanStatus.scanning:
        final controller = _controller;
        if (controller == null || !controller.value.isInitialized) {
          return const _CenteredHint(
            icon: Icons.photo_camera,
            text: 'Preparing camera…',
            showSpinner: true,
          );
        }
        return Stack(
          fit: StackFit.expand,
          children: [
            CameraPreview(controller),
            const Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Point the camera at a Magic Photo and hold steady.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    backgroundColor: Colors.black54,
                  ),
                ),
              ),
            ),
          ],
        );
    }
  }
}

class _CenteredHint extends StatelessWidget {
  final IconData icon;
  final String text;
  final bool showSpinner;

  const _CenteredHint({
    required this.icon,
    required this.text,
    this.showSpinner = false,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white70, size: 56),
          const SizedBox(height: 16),
          Text(text, style: const TextStyle(color: Colors.white)),
          if (showSpinner) ...[
            const SizedBox(height: 16),
            const CircularProgressIndicator(),
          ],
        ],
      ),
    );
  }
}

class _PermissionDenied extends StatelessWidget {
  final Future<bool> Function() onOpenSettings;

  const _PermissionDenied({required this.onOpenSettings});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography,
                color: Colors.white70, size: 56),
            const SizedBox(height: 16),
            const Text(
              'Camera permission is required to scan photos.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => onOpenSettings(),
              child: const Text('Open settings'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScanError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ScanError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.white70, size: 56),
            const SizedBox(height: 16),
            const Text('Scanning failed.',
                style: TextStyle(color: Colors.white)),
            const SizedBox(height: 8),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white54)),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
