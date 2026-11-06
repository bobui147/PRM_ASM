import 'package:flutter/material.dart';

import '../models/review.dart';
import 'food_photo.dart';

/// Xem ảnh review toàn màn hình, vuốt qua lại, phóng to được (FR-M09).
class ImageViewerPage extends StatelessWidget {
  const ImageViewerPage({super.key, required this.images, required this.initial});

  final List<ReviewImage> images;
  final int initial;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white),
      body: PageView(
        controller: PageController(initialPage: initial),
        children: [
          for (final image in images)
            InteractiveViewer(
              child: NetPhoto(
                url: image.url,
                fit: BoxFit.contain,
                fallback: const Center(child: Icon(Icons.broken_image, color: Colors.white54)),
              ),
            ),
        ],
      ),
    );
  }
}
