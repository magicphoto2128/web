import 'package:flutter/material.dart';

/// A tappable circular play icon centered over [child].
///
/// Used on the photo detail screen to signal "this photo has a linked video —
/// tap to play".
class PlayButtonOverlay extends StatelessWidget {
  final Widget child;
  final VoidCallback onPressed;
  final double size;

  const PlayButtonOverlay({
    super.key,
    required this.child,
    required this.onPressed,
    this.size = 84,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        Positioned.fill(child: child),
        // Subtle scrim so the button stays visible over bright photos.
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.15),
            ),
          ),
        ),
        Semantics(
          button: true,
          label: 'Play linked video',
          child: Material(
            color: Colors.black54,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onPressed,
              child: SizedBox(
                width: size,
                height: size,
                child: Icon(
                  Icons.play_arrow_rounded,
                  color: Colors.white,
                  size: size * 0.6,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
