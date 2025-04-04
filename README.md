# DApp Meeting

## 📝 Tổng Quan

DApp Meeting là một ứng dụng meeting phi tập trung kết hợp công nghệ blockchain với WebRTC để tạo ra các cuộc họp video an toàn, riêng tư và đáng tin cậy. Ứng dụng sử dụng smart contract để quản lý phòng họp và xác thực người tham gia, đồng thời tận dụng công nghệ WebRTC cho giao tiếp thời gian thực.

## 🏗️ Cấu Trúc Dự Án

Dự án được tổ chức thành các thành phần chính sau:

- **Smart Contract**: Xử lý quản lý phòng, xác thực người tham gia và điều phối sự kiện
- **Backend**: Quản lý phiên WebRTC và kết nối giữa blockchain và Cloudflare
- **Frontend**: Cung cấp giao diện người dùng và quản lý luồng media với các tính năng nâng cao

## 📚 Tài Liệu

Dự án bao gồm tài liệu toàn diện cho từng thành phần:

### Tài Liệu Smart Contract

[📄 Tài Liệu Smart Contract](documents/SmartConstract.md)

Tài liệu này mô tả chi tiết việc triển khai smart contract cho ứng dụng DApp Meeting. Nó bao gồm:

- **Cấu Trúc Dữ Liệu**: Cấu trúc Phòng, Người tham gia và Track
- **Chức Năng Cốt Lõi**: Tạo phòng, tham gia/rời khỏi cuộc họp và quản lý track
- **Hệ Thống Sự Kiện**: Cách sự kiện được chuyển tiếp giữa frontend và backend
- **Ví Dụ Triển Khai**: Các ví dụ từng bước về tương tác với contract

Smart contract đóng vai trò là cầu nối giữa các client frontend và dịch vụ backend, đảm bảo điều phối cuộc họp an toàn và phi tập trung.

### Tài Liệu Frontend

[📄 Tài Liệu Frontend](documents/frontend.md)

Tài liệu frontend giải thích cách ứng dụng client tương tác với cả smart contract và WebRTC. Các chủ đề chính bao gồm:

- **Kết Nối Blockchain**: Cách kết nối với blockchain và smart contract
- **Tích Hợp WebRTC**: Quản lý luồng media và kết nối
- **Quy Trình Cuộc Họp**: Tạo phòng, tham gia, phát streaming và rời khỏi cuộc họp
- **Triển Khai Từng Bước**: Hướng dẫn chi tiết về triển khai

Frontend triển khai các hiệu ứng video, bao gồm làm mờ nền và mặt nạ khuôn mặt, đồng thời cung cấp trải nghiệm người dùng mượt mà.

### Tài Liệu Backend

[📄 Tài Liệu Backend](documents/Backend.md)

Tài liệu backend bao gồm việc triển khai phía máy chủ kết nối smart contract và dịch vụ WebRTC của Cloudflare:

- **Kiến Trúc Hệ Thống**: Trình lắng nghe sự kiện và quản lý giao dịch
- **Tích Hợp Cloudflare**: Quản lý phiên và xử lý media
- **Quản Lý Ví**: Xử lý giao dịch an toàn
- **Quy Trình Xử Lý**: Luồng thông điệp từ đầu đến cuối giữa các thành phần

Backend đảm bảo giao tiếp đáng tin cậy giữa các sự kiện blockchain và chức năng WebRTC.

## 🚀 Bắt Đầu

### Yêu Cầu Hệ Thống

- Private key của ví
- Trình duyệt web hiện đại có hỗ trợ WebRTC
- Ngôn ngữ Go cho dịch vụ backend

### Cài Đặt

1. Clone repository
2. Triển khai smart contract lên blockchain mà bạn chọn
3. Cấu hình backend với địa chỉ contract của bạn
4. Cài đặt các phụ thuộc frontend và build ứng dụng

## 💡 Tính Năng

- Quản lý phòng họp phi tập trung
- Xác thực người tham gia an toàn
- Giao tiếp video và âm thanh thời gian thực
- Khả năng chia sẻ màn hình
- Bộ lọc mặt nạ khuôn mặt và hiệu ứng làm mờ nền
- Thiết kế đáp ứng cho nhiều thiết bị khác nhau

## 🔮 Phát Triển Tương Lai

- Mã hóa đầu cuối để tăng cường bảo mật
- Tích hợp với lưu trữ phi tập trung cho bản ghi cuộc họp
- Hỗ trợ cho các mạng blockchain bổ sung
- Ứng dụng di động cho iOS và Android

## 🤝 Đóng Góp

Chúng tôi hoan nghênh mọi đóng góp! Vui lòng tạo Pull Request.

## 📜 Giấy Phép

Dự án này được cấp phép theo Giấy phép MIT - xem tệp LICENSE để biết chi tiết.
