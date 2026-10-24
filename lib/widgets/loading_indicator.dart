import 'package:flutter/material.dart';

/// A centered progress spinner with an optional label and optional
/// determinate [progress] (0.0..1.0).
class LoadingIndicator extends StatelessWidget {
  final String? label;
  final double? progress;

  const LoadingIndicator({super.key, this.label, this.progress});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(value: progress),
          if (label != null) ...[
            const SizedBox(height: 16),
            Text(label!, textAlign: TextAlign.center),
          ],
        ],
      ),
    );
  }
}
