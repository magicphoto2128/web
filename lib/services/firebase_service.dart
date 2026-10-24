import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:uuid/uuid.dart';

import '../models/magic_photo.dart';
import 'image_matcher.dart';

/// Thin wrapper over Firebase Auth / Firestore / Storage for the app's data
/// operations: anonymous sign-in, uploading a photo+video pair, streaming the
/// current user's photos, and fetching all records for scan matching.
class FirebaseService {
  FirebaseService({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    FirebaseStorage? storage,
    ImageMatcher? matcher,
  })  : _auth = auth ?? FirebaseAuth.instance,
        _firestore = firestore ?? FirebaseFirestore.instance,
        _storage = storage ?? FirebaseStorage.instance,
        _matcher = matcher ?? const PerceptualHashMatcher();

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;
  final ImageMatcher _matcher;

  static const String _collection = 'magic_photos';
  static const Uuid _uuid = Uuid();

  /// Firestore collection, typed to `Map<String, dynamic>`.
  CollectionReference<Map<String, dynamic>> get _photos =>
      _firestore.collection(_collection);

  /// The current anonymous uid, or null if not signed in yet.
  String? get currentUid => _auth.currentUser?.uid;

  /// Ensure there is a signed-in (anonymous) user and return its uid.
  Future<String> ensureSignedIn() async {
    final existing = _auth.currentUser;
    if (existing != null) return existing.uid;
    final cred = await _auth.signInAnonymously();
    return cred.user!.uid;
  }

  /// Upload [photo] and [video] to Storage under the current uid, compute the
  /// perceptual hash of the photo, write a `magic_photos` document, and return
  /// the created [MagicPhoto].
  ///
  /// [onProgress] (0.0..1.0) reports combined upload progress if provided.
  Future<MagicPhoto> uploadMagicPhoto({
    required File photo,
    required File video,
    void Function(double progress)? onProgress,
  }) async {
    final uid = await ensureSignedIn();
    final docId = _uuid.v4();

    // Compute the hash from the photo bytes before upload so it is stored with
    // the record and available for scan matching later.
    final photoBytes = await photo.readAsBytes();
    final hash = _matcher.computeHash(photoBytes);

    // Upload photo then video; report averaged progress across both tasks.
    final photoRef = _storage.ref('users/$uid/photos/$docId.jpg');
    final videoRef = _storage.ref('users/$uid/videos/$docId.mp4');

    double photoProgress = 0;
    double videoProgress = 0;
    void report() =>
        onProgress?.call((photoProgress + videoProgress) / 2.0);

    final photoTask = photoRef.putFile(
      photo,
      SettableMetadata(contentType: 'image/jpeg'),
    );
    photoTask.snapshotEvents.listen((s) {
      if (s.totalBytes > 0) {
        photoProgress = s.bytesTransferred / s.totalBytes;
        report();
      }
    });
    await photoTask;
    final photoUrl = await photoRef.getDownloadURL();

    final videoTask = videoRef.putFile(
      video,
      SettableMetadata(contentType: 'video/mp4'),
    );
    videoTask.snapshotEvents.listen((s) {
      if (s.totalBytes > 0) {
        videoProgress = s.bytesTransferred / s.totalBytes;
        report();
      }
    });
    await videoTask;
    final videoUrl = await videoRef.getDownloadURL();

    final model = MagicPhoto(
      id: docId,
      photoUrl: photoUrl,
      videoUrl: videoUrl,
      perceptualHash: hash,
      ownerId: uid,
    );

    await _photos.doc(docId).set(model.toMap());
    return model;
  }

  /// Live stream of the current user's magic photos, newest first.
  Stream<List<MagicPhoto>> streamMyPhotos() {
    final uid = currentUid;
    if (uid == null) {
      return const Stream<List<MagicPhoto>>.empty();
    }
    return _photos
        .where('ownerId', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map(MagicPhoto.fromFirestore).toList(growable: false));
  }

  /// Fetch all records (across owners) for scan matching. A second user needs
  /// to match photos uploaded by someone else, so this is intentionally not
  /// scoped by uid. For the free-tier demo a full read of the collection is
  /// acceptable; a production app would index/narrow this.
  Future<List<MagicPhoto>> fetchAllRecords({int limit = 500}) async {
    final snap = await _photos.limit(limit).get();
    return snap.docs.map(MagicPhoto.fromFirestore).toList(growable: false);
  }
}
