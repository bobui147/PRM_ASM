'use strict';

const { getConfig } = require('../config');
const { publicUploadUrl } = require('../services/storage');

const AREA_LABELS = Object.freeze({
  fpt: 'Gần Đại học FPT',
  vnu: 'Gần ĐHQG Hà Nội',
  hhtp: 'Khu Công nghệ cao Hòa Lạc',
  other: 'Khu vực Hòa Lạc khác',
});

const TAG_LABELS = Object.freeze({
  student_price: 'Giá sinh viên',
  group_friendly: 'Phù hợp nhóm đông',
  late_night: 'Mở khuya',
  seating: 'Có chỗ ngồi',
  takeaway: 'Mang đi',
});

const RARITY_LABELS = Object.freeze({
  common: 'Thường',
  rare: 'Hiếm',
  epic: 'Sử thi',
  legendary: 'Huyền thoại',
  ancient: 'Cổ vật',
});

const MEAL_LABELS = Object.freeze({
  breakfast: 'Ăn sáng',
  lunch: 'Ăn trưa',
  dinner: 'Ăn tối',
  late_night: 'Ăn đêm',
});

const REVIEW_STATUS_LABELS = Object.freeze({
  pending: 'Đang chờ duyệt',
  published: 'Đã đăng',
  rejected: 'Bị từ chối',
  hidden: 'Đã bị ẩn',
});

const REJECT_REASON_LABELS = Object.freeze({
  spam: 'Spam/quảng cáo',
  offensive: 'Nội dung xúc phạm',
  irrelevant: 'Không liên quan tới quán',
  inappropriate_image: 'Ảnh không phù hợp',
  other: 'Lý do khác',
});

const REPORT_REASON_LABELS = Object.freeze({
  offensive: 'Nội dung xúc phạm',
  spam: 'Spam hoặc quảng cáo',
  misleading: 'Thông tin sai lệch',
  inappropriate_image: 'Hình ảnh không phù hợp',
  other: 'Lý do khác',
});

function uploadUrl(relativePath) {
  return publicUploadUrl(getConfig().publicBaseUrl, relativePath);
}

function isBlocked(user, now = new Date()) {
  return Boolean(user.blocked_permanent) || (user.blocked_until != null && new Date(user.blocked_until) > now);
}

function blockInfo(user) {
  if (!isBlocked(user)) {
    return null;
  }
  return {
    reason: user.block_reason,
    until: user.blocked_permanent ? null : new Date(user.blocked_until).toISOString(),
  };
}

function toUserDto(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    createdAt: user.created_at,
    blocked: blockInfo(user),
  };
}

function parseTags(value) {
  return value ? String(value).split(',').filter(Boolean) : [];
}

module.exports = {
  AREA_LABELS,
  TAG_LABELS,
  RARITY_LABELS,
  MEAL_LABELS,
  REVIEW_STATUS_LABELS,
  REJECT_REASON_LABELS,
  REPORT_REASON_LABELS,
  uploadUrl,
  isBlocked,
  blockInfo,
  toUserDto,
  parseTags,
};
