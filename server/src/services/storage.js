'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

// Thư mục con hợp lệ: foods, restaurants, reviews/12...
const SUBDIR_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;

/**
 * Lưu và xóa file ảnh trong UPLOAD_DIR. Đường dẫn lưu trong DB luôn là
 * đường dẫn tương đối dạng POSIX (ví dụ "foods/<uuid>.webp").
 */
function createStorage({ uploadDir }) {
  const root = path.resolve(uploadDir);

  /** Đổi đường dẫn tương đối thành tuyệt đối, chặn mọi đường dẫn thoát khỏi root. */
  function resolveSafe(relativePath) {
    if (typeof relativePath !== 'string' || relativePath === '' || path.isAbsolute(relativePath)) {
      throw new Error(`Đường dẫn file không hợp lệ: ${relativePath}`);
    }
    const absolute = path.resolve(root, relativePath);
    if (!absolute.startsWith(root + path.sep)) {
      throw new Error(`Đường dẫn file nằm ngoài thư mục upload: ${relativePath}`);
    }
    return absolute;
  }

  /** Ghi bản lớn và thumbnail (kết quả của processImage) với tên UUID ngẫu nhiên. */
  async function saveImagePair(subdir, { large, thumb }) {
    if (!SUBDIR_PATTERN.test(subdir)) {
      throw new Error(`Thư mục con không hợp lệ: ${subdir}`);
    }
    await fs.mkdir(resolveSafe(subdir), { recursive: true });
    const id = crypto.randomUUID();
    const imagePath = `${subdir}/${id}.webp`;
    const thumbPath = `${subdir}/${id}_thumb.webp`;
    // 'wx': không bao giờ ghi đè file đã có.
    await fs.writeFile(resolveSafe(imagePath), large.data, { flag: 'wx' });
    try {
      await fs.writeFile(resolveSafe(thumbPath), thumb.data, { flag: 'wx' });
    } catch (error) {
      await removeFiles([imagePath]);
      throw error;
    }
    return { imagePath, thumbPath, width: large.width, height: large.height };
  }

  /** Xóa các file theo đường dẫn tương đối; bỏ qua giá trị rỗng và file không còn tồn tại. */
  async function removeFiles(relativePaths) {
    let removed = 0;
    for (const relativePath of relativePaths) {
      if (!relativePath) {
        continue;
      }
      try {
        await fs.unlink(resolveSafe(relativePath));
        removed += 1;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
    return removed;
  }

  /** Xóa cả thư mục con (ví dụ "reviews/12"). Không lỗi nếu không tồn tại. */
  async function removeDir(subdir) {
    if (!SUBDIR_PATTERN.test(subdir)) {
      throw new Error(`Thư mục con không hợp lệ: ${subdir}`);
    }
    await fs.rm(resolveSafe(subdir), { recursive: true, force: true, maxRetries: 3 });
  }

  return { root, resolve: resolveSafe, saveImagePair, removeFiles, removeDir };
}

let shared;

/** Storage dùng chung theo UPLOAD_DIR trong cấu hình. */
function getStorage() {
  shared ??= createStorage({ uploadDir: require('../config').getConfig().uploadDir });
  return shared;
}

/** URL công khai của ảnh, hoặc null nếu không có ảnh. */
function publicUploadUrl(publicBaseUrl, relativePath) {
  return relativePath ? `${publicBaseUrl}/uploads/${relativePath}` : null;
}

module.exports = { createStorage, getStorage, publicUploadUrl };
