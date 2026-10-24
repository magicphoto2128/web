import 'package:cloud_firestore/cloud_firestore.dart';

/// Immutable model for a "magic photo": a stored photo linked to a video,
/// plus the perceptual hash used to recognize the photo during a camera scan.
///
/// Firestore document shape (collection `magic_photos`):
///   id              -> String  (== document id, a uuid)
///   photoUrl        -> String  (Storage download URL)
///   videoUrl        -> String  (Storage download URL)
///   perceptualHash  -> String  (16 hex chars == 64-bit dHash)
///   createdAt       -> Timestamp
///   ownerId         -> String  (anonymous uid)
class MagicPhoto {
  final String id;
  final String photoUrl;
  final String videoUrl;
  final String perceptualHash;
  final DateTime? createdAt;
  final String ownerId;

  const MagicPhoto({
    required this.id,
    required this.photoUrl,
    required this.videoUrl,
    required this.perceptualHash,
    required this.ownerId,
    this.createdAt,
  });

  /// Map written to Firestore. `createdAt` uses a server timestamp so the
  /// value is set authoritatively by Firestore on write.
  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'id': id,
      'photoUrl': photoUrl,
      'videoUrl': videoUrl,
      'perceptualHash': perceptualHash,
      'ownerId': ownerId,
      'createdAt': FieldValue.serverTimestamp(),
    };
  }

  /// Build a model from a Firestore document snapshot.
  factory MagicPhoto.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? <String, dynamic>{};
    return MagicPhoto.fromMap(data, doc.id);
  }

  /// Build a model from a raw map + document id. Tolerates a missing or
  /// not-yet-resolved (`null`) `createdAt` (e.g. during server-timestamp
  /// round-trip latency).
  factory MagicPhoto.fromMap(Map<String, dynamic> map, String id) {
    final rawCreatedAt = map['createdAt'];
    DateTime? createdAt;
    if (rawCreatedAt is Timestamp) {
      createdAt = rawCreatedAt.toDate();
    } else if (rawCreatedAt is DateTime) {
      createdAt = rawCreatedAt;
    }

    return MagicPhoto(
      id: (map['id'] as String?) ?? id,
      photoUrl: (map['photoUrl'] as String?) ?? '',
      videoUrl: (map['videoUrl'] as String?) ?? '',
      perceptualHash: (map['perceptualHash'] as String?) ?? '',
      ownerId: (map['ownerId'] as String?) ?? '',
      createdAt: createdAt,
    );
  }

  MagicPhoto copyWith({
    String? id,
    String? photoUrl,
    String? videoUrl,
    String? perceptualHash,
    DateTime? createdAt,
    String? ownerId,
  }) {
    return MagicPhoto(
      id: id ?? this.id,
      photoUrl: photoUrl ?? this.photoUrl,
      videoUrl: videoUrl ?? this.videoUrl,
      perceptualHash: perceptualHash ?? this.perceptualHash,
      createdAt: createdAt ?? this.createdAt,
      ownerId: ownerId ?? this.ownerId,
    );
  }
}
