'use strict';

// Hộp xác nhận cho form có data-confirm (CSP chặn script inline nên đặt ở file riêng).
document.addEventListener('submit', (event) => {
  const form = event.target;
  const message = form.getAttribute('data-confirm');
  if (message && !window.confirm(message)) {
    event.preventDefault();
  }
});

// Chọn/bỏ chọn tất cả checkbox trong bảng thao tác hàng loạt.
document.addEventListener('change', (event) => {
  const toggle = event.target.closest('[data-check-all]');
  if (!toggle) return;
  document.querySelectorAll(toggle.getAttribute('data-check-all')).forEach((box) => {
    box.checked = toggle.checked;
  });
});

// Lọc danh sách theo ô tìm có data-filter-list (ví dụ danh sách quán trong form món).
document.addEventListener('input', (event) => {
  const box = event.target.closest('[data-filter-list]');
  if (!box) return;
  const term = box.value.trim().toLowerCase();
  document.querySelectorAll(`${box.getAttribute('data-filter-list')} [data-filter-item]`).forEach((item) => {
    item.hidden = term !== '' && !item.getAttribute('data-filter-item').includes(term);
  });
});
