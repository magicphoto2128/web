import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../main.dart';
import '../widgets/loading_indicator.dart';

/// Pick a photo and a video, then upload them as one linked "magic photo".
class UploadScreen extends StatefulWidget {
  static const String routeName = '/upload';

  const UploadScreen({super.key});

  @override
  State<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends State<UploadScreen> {
  final ImagePicker _picker = ImagePicker();

  File? _photo;
  File? _video;
  bool _uploading = false;
  double _progress = 0;

  // image_picker handles its own platform media access; no explicit
  // permission_handler call is required here for gallery selection. Camera and
  // runtime media permissions used by the scan flow are requested on
  // ScanScreen.

  Future<void> _pickPhoto() async {
    final picked = await _picker.pickImage(source: ImageSource.gallery);
    if (picked == null) return;
    setState(() => _photo = File(picked.path));
  }

  Future<void> _pickVideo() async {
    final picked = await _picker.pickVideo(source: ImageSource.gallery);
    if (picked == null) return;
    setState(() => _video = File(picked.path));
  }

  Future<void> _submit() async {
    final photo = _photo;
    final video = _video;
    if (photo == null || video == null) return;

    setState(() {
      _uploading = true;
      _progress = 0;
    });

    try {
      await firebaseService.uploadMagicPhoto(
        photo: photo,
        video: video,
        onProgress: (p) {
          if (mounted) setState(() => _progress = p);
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Magic photo uploaded.')),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _uploading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Upload failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = _photo != null && _video != null && !_uploading;

    return Scaffold(
      appBar: AppBar(title: const Text('New Magic Photo')),
      body: _uploading
          ? LoadingIndicator(
              label: 'Uploading… ${(_progress * 100).toStringAsFixed(0)}%',
              progress: _progress == 0 ? null : _progress,
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _PickerCard(
                  title: 'Photo',
                  icon: Icons.image,
                  picked: _photo != null,
                  onPick: _pickPhoto,
                  preview: _photo == null
                      ? null
                      : Image.file(_photo!, fit: BoxFit.cover),
                ),
                const SizedBox(height: 16),
                _PickerCard(
                  title: 'Video',
                  icon: Icons.movie,
                  picked: _video != null,
                  onPick: _pickVideo,
                  preview: _video == null
                      ? null
                      : const Center(
                          child: Icon(Icons.check_circle,
                              size: 48, color: Colors.green),
                        ),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: canSubmit ? _submit : null,
                  icon: const Icon(Icons.cloud_upload),
                  label: const Text('Upload'),
                ),
              ],
            ),
    );
  }
}

class _PickerCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final bool picked;
  final VoidCallback onPick;
  final Widget? preview;

  const _PickerCard({
    required this.title,
    required this.icon,
    required this.picked,
    required this.onPick,
    this.preview,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPick,
        child: SizedBox(
          height: 180,
          width: double.infinity,
          child: preview ??
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 48),
                  const SizedBox(height: 8),
                  Text('Pick $title'),
                ],
              ),
        ),
      ),
    );
  }
}
